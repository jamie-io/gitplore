/**
 * Fails when the production build's initial scripts exceed 350 kB gzipped (IMPLEMENTATION_PLAN.md
 * §9). Angular's own budgets measure raw bytes; this is the number the plan actually states.
 */
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { initialScripts, overBudget } from './lib/budget.mjs';

const DIST = fileURLToPath(new URL('../dist/gitplore/browser/', import.meta.url));
const LIMIT_KB = 350;

const html = await readFile(`${DIST}index.html`, 'utf8');
const sizes = {};
for (const script of initialScripts(html)) {
  sizes[script] = gzipSync(await readFile(`${DIST}${script}`)).byteLength / 1024;
  console.log(`  ${script.padEnd(28)} ${sizes[script].toFixed(1)} kB gz`);
}

const verdict = overBudget(sizes, LIMIT_KB);
if (verdict) {
  console.error(`✗ ${verdict}`);
  process.exit(1);
}
console.log(`✓ initial bundle within ${LIMIT_KB} kB gzipped`);
