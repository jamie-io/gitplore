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

test.describe('Deslopify world', () => {
  test('glides through the Lichtung', async ({ page }) => {
    test.setTimeout(180_000);
    const problems = await openDeslopify(page);
    await expect(page.locator('[data-role="pitch"]')).toBeVisible();
    await page.keyboard.press('KeyW');
    await expect(page.locator('[data-role="station-chip"]')).toHaveCount(7);
    await page.keyboard.press('Digit4');
    await expect(page.locator('[data-role="world-status"]')).toContainText('Deslopify an', {
      timeout: 40_000,
    });
    await expect(page.locator('[data-role="moment-banner"]')).toContainText(
      'Deslopify installiert',
      { timeout: 40_000 },
    );
    await page.keyboard.press('Digit6');
    await expect(page.locator('[data-role="plate"]')).toContainText('Feed-Wand', {
      timeout: 40_000,
    });
    await page.keyboard.press('KeyE');
    await expect(page.locator('[data-role="world-status"]')).toContainText('Deslopify aus');
    await expect(page.locator('[data-role="toast"]')).toContainText('Deslopify aus');
    await page.keyboard.press('Digit0');
    await expect(page.locator('[data-role="plate"]')).toContainText('Ankunft', {
      timeout: 40_000,
    });
    await page.keyboard.press('KeyR');
    await expect(page.locator('[data-role="world-status"]')).toContainText('Deslopify noch nicht');
    await expect(page.locator('[data-role="station-chip"][data-state="visited"]')).toHaveCount(0);
    expect(problems).toEqual([]);
  });

  test('keeps station chips out of the hub and a plaza project', async ({ page }) => {
    test.setTimeout(120_000);
    const problems = collectProblems(page);
    await page.goto('/');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');
    await page.locator('button[data-role="start"]').click();
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await expect(page.locator('[data-role="station-chip"]')).toHaveCount(0);

    await page.goto('/p/gitplore');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');
    await page.locator('button[data-role="start"]').click();
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await expect(page.locator('[data-role="station-chip"]')).toHaveCount(0);
    expect(problems).toEqual([]);
  });
});
