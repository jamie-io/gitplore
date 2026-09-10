/**
 * Compresses every source model into public/assets/models and writes public/assets/manifest.json
 * (IMPLEMENTATION_PLAN.md §8): meshopt geometry, WebP textures capped at 1024 px.
 *
 * Group rule: a model named after a project slug belongs to that project's group and loads lazily
 * when the player is near; everything else is `core` and preloads behind the loading screen.
 */
import { execFile } from 'node:child_process';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { mergedProjects } from './lib/portfolio.mjs';

const run = promisify(execFile);
const SRC = fileURLToPath(new URL('../assets-src/models/', import.meta.url));
const OUT = fileURLToPath(new URL('../public/assets/models/', import.meta.url));
const SCREENS = fileURLToPath(new URL('../public/assets/screens/', import.meta.url));
const MANIFEST = fileURLToPath(new URL('../public/assets/manifest.json', import.meta.url));
const CLI = fileURLToPath(new URL('../node_modules/.bin/gltf-transform', import.meta.url));

const PROJECTS = mergedProjects();

/** Which project (if any) a model belongs to; a model no project names is `core`. */
const GROUPS = Object.fromEntries(
  PROJECTS.filter((p) => p.landmark.model).map((p) => [p.landmark.model.split('/').pop(), p.slug]),
);

await mkdir(OUT, { recursive: true });
const assets = [];

for (const file of (await readdir(SRC)).filter((f) => f.endsWith('.glb')).sort()) {
  const out = `${OUT}${file}`;
  await run(CLI, [
    'optimize',
    `${SRC}${file}`,
    out,
    '--compress',
    'meshopt',
    '--texture-compress',
    'webp',
    '--texture-size',
    '1024',
  ]);
  const { size } = await stat(out);
  const before = (await stat(`${SRC}${file}`)).size;
  const group = GROUPS[file] ?? 'core';
  assets.push({ url: `assets/models/${file}`, bytes: size, group });
  console.log(`✓ ${file.padEnd(14)} ${before} → ${size} bytes  [${group}]`);
}

for (const project of PROJECTS) {
  if (project.demo.kind === 'iframe') {
    const { size } = await stat(`${SCREENS}${project.demo.screenshot.split('/').pop()}`);
    assets.push({ url: project.demo.screenshot, bytes: size, group: project.slug });
  }
}

await writeFile(MANIFEST, JSON.stringify({ assets }, null, 2) + '\n');
console.log(`✓ manifest.json  ${assets.length} assets`);
