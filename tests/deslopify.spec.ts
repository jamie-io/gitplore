import { expect, test, type Page } from '@playwright/test';

function collectProblems(page: Page): string[] {
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
  return problems;
}

async function openDeslopify(page: Page): Promise<string[]> {
  const problems = collectProblems(page);
  await page.goto('/p/deslopify?stats=1');
  await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');
  await page.locator('button[data-role="start"]').click();
  await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
  return problems;
}

/** Puts the visitor on a spot the world names for tests, behind `?stats=1`. */
async function teleport(page: Page, id: string): Promise<void> {
  const placed = await page.evaluate(
    (spot) =>
      (
        window as Window & { __gitploreTestTeleport?: (id: string) => boolean }
      ).__gitploreTestTeleport?.(spot) ?? false,
    id,
  );
  expect(placed).toBe(true);
}

test.describe('Deslopify world', () => {
  test('glides through the Lichtung', async ({ page }) => {
    test.setTimeout(180_000);
    const problems = await openDeslopify(page);
    const status = page.locator('[data-role="world-status"]');
    const chips = page.locator('[data-role="station-chip"]');
    await expect(page.locator('app-hud .area')).toContainText('Dschungel — Deslopify');
    await expect(status).toHaveText('Deslopify noch nicht · Entslopt 0/8');
    await expect(page.locator('[data-role="pitch"]')).toBeVisible();
    await page.keyboard.press('KeyW');
    await expect(chips).toHaveCount(7);

    // Short-lived things first: the banner is up for the moment's 2.6 s, the status for good.
    await page.keyboard.press('Digit4');
    await expect(page.locator('[data-role="moment-banner"]')).toContainText(
      'Deslopify installiert',
      { timeout: 40_000 },
    );
    await expect(status).toContainText('Deslopify an', { timeout: 40_000 });

    await page.keyboard.press('Digit6');
    await expect(page.locator('[data-role="plate"]')).toContainText('Feed-Wand', {
      timeout: 40_000,
    });
    // The Lichtung's own amber.
    await expect(page.locator('[data-role="station-chip"][data-state="here"]')).toHaveCSS(
      'background-color',
      'rgb(224, 161, 60)',
    );
    await expect(page.locator('app-hud .prompt')).toContainText('Deslopify ausschalten', {
      timeout: 40_000,
    });
    await page.keyboard.press('KeyE');
    // The toast lasts 2.2 s; the status stays.
    await expect(page.locator('[data-role="toast"]')).toContainText('Deslopify aus');
    await expect(status).toContainText('Deslopify aus');

    await page.keyboard.press('Digit0');
    await expect(page.locator('[data-role="plate"]')).toContainText('Ankunft', {
      timeout: 40_000,
    });
    const visited = page.locator('[data-role="station-chip"][data-state="visited"]');
    await expect.poll(() => visited.count()).toBeGreaterThanOrEqual(1);

    await page.keyboard.press('KeyR');
    await expect(status).toContainText('Deslopify noch nicht');
    await expect(chips).toHaveCount(7);
    await expect(visited).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('shows the install moment when the visitor walks through the arch', async ({ page }) => {
    test.setTimeout(150_000);
    const problems = await openDeslopify(page);
    await page.keyboard.press('KeyW');
    await expect(page.locator('[data-role="station-chip"]')).toHaveCount(7);

    // W held through the arch: the moment it plays must not be skipped by the key already down.
    await teleport(page, 'deslopify:bridge-south');
    await page.keyboard.down('KeyW');
    await expect(page.locator('[data-role="moment-banner"]')).toContainText(
      'Deslopify installiert',
      { timeout: 40_000 },
    );
    await page.keyboard.up('KeyW');
    await expect(page.locator('[data-role="world-status"]')).toContainText('Deslopify an');
    expect(problems).toEqual([]);
  });

  // Guards "no stations, no bar": a world without stations shows no chips at all.
  test('keeps station chips out of the hub and a showroom project', async ({ page }) => {
    test.setTimeout(120_000);
    const problems = collectProblems(page);
    await page.goto('/');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');
    await page.locator('button[data-role="start"]').click();
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await expect(page.locator('app-hud .area')).toContainText('Lichtung');
    await expect(page.locator('[data-role="station-chip"]')).toHaveCount(0);

    await page.goto('/p/novaverta');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');
    await page.locator('button[data-role="start"]').click();
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await expect(page.locator('app-hud .area')).toContainText('Showroom');
    await expect(page.locator('[data-role="station-chip"]')).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});
