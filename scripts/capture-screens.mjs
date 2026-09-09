/**
 * Captures the in-world screen texture for every iframe demo: a 1024x640 WebP of the live site
 * (IMPLEMENTATION_PLAN.md §8). The results are committed, so a build never needs the network.
 */
import { execFileSync } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { PROJECTS } from '../src/app/content/projects.ts';

const WIDTH = 1024;
const HEIGHT = 640;
const QUALITY = 82;

const OUT_DIR = new URL('../public/assets/screens/', import.meta.url);
await mkdir(OUT_DIR, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });
let failures = 0;

for (const project of PROJECTS) {
  if (project.demo.kind !== 'iframe') {
    continue;
  }

  const webp = new URL(`${project.slug}.webp`, OUT_DIR);
  const png = new URL(`${project.slug}.png`, OUT_DIR);

  try {
    await page.goto(project.demo.url, { waitUntil: 'networkidle', timeout: 45000 });
    await page.screenshot({ path: fileURLToPath(png) });
    execFileSync('cwebp', [
      '-quiet',
      '-q',
      String(QUALITY),
      fileURLToPath(png),
      '-o',
      fileURLToPath(webp),
    ]);
    await rm(png);
    console.log(`✓ ${project.slug.padEnd(14)} ${project.demo.url}`);
  } catch (error) {
    failures++;
    console.error(`✗ ${project.slug.padEnd(14)} ${error.message}`);
  }
}

await browser.close();
if (failures > 0) {
  process.exit(1);
}
