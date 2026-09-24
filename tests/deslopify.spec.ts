import { expect, test } from '@playwright/test';

test.describe('Deslopify world', () => {
  test('boots cleanly, lights the lantern, and toggles the wall', async ({ page }) => {
    // Under SwiftShader in CI the jungle renders a few frames a second, and walking is frame-bound.
    test.setTimeout(150_000);
    const problems: string[] = [];
    page.on('console', (message) => {
      const text = message.text();
      if (
        message.type() === 'error' ||
        (message.type() === 'warning' && /THREE\.|WebGL|GL_|shader/i.test(text))
      ) {
        problems.push(`${message.type()}: ${text}`);
      }
    });
    page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));

    await page.goto('/p/deslopify?stats=1');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');
    await page.locator('button[data-role="start"]').click();
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await expect(page.locator('app-hud .area')).toContainText('Dschungel — Deslopify');
    await expect(page.locator('app-hud .status')).toHaveText('Deslopify noch nicht · Entslopt 0/8');

    const prompt = page.locator('app-hud .prompt');
    await page.keyboard.down('KeyW');
    await expect(prompt).toContainText('Laterne anzünden', { timeout: 40_000 });
    await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyE');
    await expect(prompt).not.toContainText('Laterne anzünden');

    const placedAtBridge = await page.evaluate(
      () =>
        (
          window as Window & { __gitploreTestTeleport?: (id: string) => boolean }
        ).__gitploreTestTeleport?.('deslopify:bridge-south') ?? false,
    );
    expect(placedAtBridge).toBe(true);
    await page.keyboard.down('KeyW');
    await expect(page.locator('app-hud .status')).toHaveText(/Deslopify an · Entslopt \d+\/8/, {
      timeout: 40_000,
    });
    await page.keyboard.up('KeyW');

    // The existing panel hook is the deterministic browser path to the north-bank wall.
    await page.goto('/p/deslopify/info');
    await page.locator('button[data-role="try-in-world"]').click();
    await expect(page).toHaveURL(/\/p\/deslopify$/);
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await expect(page.locator('app-hud .status')).toHaveText(/Deslopify an · Entslopt \d+\/8/);
    await expect(prompt).toContainText('Deslopify ausschalten');

    await page.keyboard.press('KeyE');
    await expect(page.locator('app-hud .status')).toHaveText(/Deslopify aus · Entslopt \d+\/8/);
    await page.keyboard.press('KeyE');
    await expect(page.locator('app-hud .status')).toHaveText(/Deslopify an · Entslopt \d+\/8/);

    await page.keyboard.press('KeyR');
    await expect(page.locator('app-hud .status')).toHaveText('Deslopify noch nicht · Entslopt 0/8');
    // R puts the visitor back at the arrival, and the lantern back on its post, unlit.
    await page.keyboard.down('KeyW');
    await expect(prompt).toContainText('Laterne anzünden', { timeout: 40_000 });
    await page.keyboard.up('KeyW');

    expect(problems).toEqual([]);
  });
});
