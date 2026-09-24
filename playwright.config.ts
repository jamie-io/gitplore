import { defineConfig, devices } from '@playwright/test';

/**
 * Software rendering: CI runners have no GPU, and Chromium refuses WebGL2 without these flags
 * (IMPLEMENTATION_PLAN.md §9).
 */
const SWIFTSHADER = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

/**
 * Port of the production build under test. Several git worktrees of this repository can run the
 * suite side by side; with a shared port, `reuseExistingServer` would quietly test another
 * worktree's build. Set `E2E_PORT` per worktree to keep them apart.
 */
const PORT = Number(process.env['E2E_PORT'] ?? 4173);

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: `http://localhost:${PORT}`, trace: 'on-first-retry' },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], launchOptions: { args: SWIFTSHADER } },
    },
    {
      // Chromium rather than WebKit: this project exists to prove the simple-view redirect, and
      // pinning one engine keeps CI to a single browser download.
      name: 'iphone',
      // The phone is redirected away from the hub, so the world suite does not apply here.
      testIgnore:
        /(world|worlds|panel|interaction|demo|deslopify|memory|a11y|shaders|perf|capture|audio)\.spec\.ts/,
      use: { ...devices['iPhone 14'], browserName: 'chromium' },
    },
  ],
  // The suite runs against the production build, not `ng serve`: no on-demand compilation under
  // parallel workers, and it tests what ships (§9).
  webServer: {
    command: `npm run build && PORT=${PORT} node scripts/serve-dist.mjs`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
