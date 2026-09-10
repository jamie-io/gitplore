/**
 * Fails when the production build's initial scripts exceed 350 kB gzipped (IMPLEMENTATION_PLAN.md
 * §9). Angular's own budgets measure raw bytes; this is the number the plan actually states.
 */
import { readFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { initialScripts, overBudget } from './lib/budget.mjs';
import { distRoot } from './lib/dist.mjs';

const DIST = distRoot();
const LIMIT_KB = 350;

const html = await readFile(`${DIST}index.html`, 'utf8');
let totalKb = 0;
for (const script of initialScripts(html)) {
  const kb = gzipSync(await readFile(`${DIST}${script}`)).byteLength / 1024;
  totalKb += kb;
  console.log(`  ${script.padEnd(28)} ${kb.toFixed(1)} kB gz`);
}

const verdict = overBudget(totalKb, LIMIT_KB);
if (verdict) {
  console.error(`✗ ${verdict}`);
  process.exit(1);
}
console.log(`✓ initial bundle within ${LIMIT_KB} kB gzipped`);
