import { expect, test, type Page } from '@playwright/test';
import { setTabHidden, startWorld } from './helpers';

/**
 * SwiftShader has no audio output and Playwright cannot listen to a speaker, so nothing here
 * asserts anything about sound. What a browser can prove is that the graph was built on the start
 * gesture and that the context is running, that muting and hiding the tab silence it, and — with
 * the console gate of `tests/shaders.spec.ts` — that nothing in the synth throws while a visitor
 * walks around: a WebAudio node given a bad parameter raises, it does not merely sound wrong.
 */
const WORLDS = [
  { place: 'Lichtung', url: '/' },
  { place: 'Dschungel', url: '/p/deslopify' },
  { place: 'Plaza', url: '/p/gitplore' },
  { place: 'Showroom', url: '/p/novaverta' },
] as const;

/** Console lines that are not ours to fix. Each entry needs a reason. */
const KNOWN: readonly RegExp[] = [];

const audioState = (page: Page) => page.locator('app-hud');

function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on('console', (message) => {
    const text = message.text();
    if (message.type() === 'error' && !KNOWN.some((pattern) => pattern.test(text))) {
      problems.push(`error: ${text}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
}

for (const world of WORLDS) {
  test(`${world.place} sounds without throwing`, async ({ page }) => {
    const problems = watchConsole(page);

    await startWorld(page, world.url);
    await expect(audioState(page)).toHaveAttribute('data-audio', 'running');

    // Far enough for the stride phase to cross 0 and π several times, so footsteps really fire.
    await page.keyboard.down('KeyW');
    await page.waitForTimeout(3000);
    await page.keyboard.up('KeyW');
    // The interact blip, if the walk ended in front of anything, and a moment for the voices.
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(500);

    expect(problems).toEqual([]);
  });
}

test('muting suspends the context and unmuting brings it back', async ({ page }) => {
  const problems = watchConsole(page);
  await startWorld(page);
  await expect(audioState(page)).toHaveAttribute('data-audio', 'running');

  await page.locator('button[data-role="settings"]').click();
  await page.locator('#settings-muted').check();
  await expect(audioState(page)).toHaveAttribute('data-audio', 'suspended');

  await page.locator('#settings-muted').uncheck();
  await expect(audioState(page)).toHaveAttribute('data-audio', 'running');

  await page.locator('button[data-role="close"]').click();
  expect(problems).toEqual([]);
});

test('a hidden tab is a silent tab', async ({ page }) => {
  const problems = watchConsole(page);
  await startWorld(page);
  await expect(audioState(page)).toHaveAttribute('data-audio', 'running');

  await setTabHidden(page, true);
  await expect(audioState(page)).toHaveAttribute('data-audio', 'suspended');

  await setTabHidden(page, false);
  await expect(audioState(page)).toHaveAttribute('data-audio', 'running');

  expect(problems).toEqual([]);
});
