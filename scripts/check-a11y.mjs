/**
 * Fails when any audited route scores below a perfect Lighthouse accessibility category
 * (design spec §8). Run it against the production build:
 *
 *     npm run build && node scripts/serve-dist.mjs &
 *     npm run a11y:check
 *
 * The e2e suite already runs axe over two pages (`tests/a11y.spec.ts`); this covers the whole
 * route set with the audits Lighthouse adds on top, and — unlike the ad-hoc runs it replaces —
 * it is committed, so what was measured is no longer a matter of memory.
 */
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { A11Y_ROUTES, auditUrl, failureReports } from './lib/a11y-audit.mjs';

const BASE = process.env['A11Y_BASE_URL'] ?? 'http://localhost:4173';
const LIGHTHOUSE = join('node_modules', '.bin', 'lighthouse');

// The same software rendering Playwright uses: CI runners have no GPU and Chromium refuses WebGL2
// without them, which would redirect every world route into the simple view (§9).
const CHROME_FLAGS = [
  '--headless=new',
  '--no-sandbox',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader',
].join(' ');

// Lighthouse drives whatever Chrome `chrome-launcher` can find. Rather than assume the runner
// image ships one, fall back to the Chromium the e2e suite already installs.
if (!process.env['CHROME_PATH']) {
  try {
    const { chromium } = await import('@playwright/test');
    process.env['CHROME_PATH'] = chromium.executablePath();
  } catch {
    // No Playwright browser installed either; let chrome-launcher look for a system Chrome.
  }
}

const outDir = await mkdtemp(join(tmpdir(), 'gitplore-a11y-'));

async function audit(route) {
  const url = auditUrl(BASE, route.path);
  const reportPath = join(outDir, `${route.path.replace(/\W+/g, '_')}.json`);
  const args = [
    url,
    '--only-categories=accessibility',
    '--output=json',
    `--output-path=${reportPath}`,
    `--chrome-flags=${CHROME_FLAGS}`,
    '--quiet',
  ];
  if (route.preset === 'desktop') {
    args.push('--preset=desktop');
  }

  await run(LIGHTHOUSE, args);

  const report = JSON.parse(await readFile(reportPath, 'utf8'));
  const failedAudits = Object.values(report.audits)
    .filter(
      (entry) =>
        entry.score !== null && entry.score < 1 && entry.scoreDisplayMode !== 'notApplicable',
    )
    .map((entry) => entry.id);

  return {
    url,
    // A redirect means the route was not the page we meant to audit.
    landedOn: report.finalDisplayedUrl,
    score: report.categories.accessibility.score,
    failedAudits,
  };
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}

const reports = [];
for (const route of A11Y_ROUTES) {
  const report = await audit(route);
  const landed = report.landedOn.startsWith(report.url.split('?')[0])
    ? ''
    : ` → ${report.landedOn}`;
  console.log(`  ${route.path.padEnd(34)} ${String(report.score)}${landed}`);
  reports.push(report);
}

const failures = failureReports(reports);
for (const failure of failures) {
  console.error(`✗ ${failure}`);
}

if (failures.length > 0) {
  console.error(`\n${failures.length} route(s) below a perfect accessibility score.`);
  process.exit(1);
}

console.log(`✓ all ${reports.length} routes score a perfect accessibility category`);
