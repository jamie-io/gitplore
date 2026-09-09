import { defineConfig, devices } from '@playwright/test';

/**
 * Software rendering: CI runners have no GPU, and Chromium refuses WebGL2 without these flags
 * (IMPLEMENTATION_PLAN.md §9).
 */
const SWIFTSHADER = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'];

export default defineConfig({
  testDir: 'tests',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: { baseURL: 'http://localhost:4173', trace: 'on-first-retry' },
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
      testIgnore: /(world|panel|interaction)\.spec\.ts/,
      use: { ...devices['iPhone 14'], browserName: 'chromium' },
    },
  ],
  // The suite runs against the production build, not `ng serve`: no on-demand compilation under
  // parallel workers, and it tests what ships (§9).
  webServer: {
    command: 'npm run build && node scripts/serve-dist.mjs',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 180_000,
  },
});
