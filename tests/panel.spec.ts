import { expect, test } from '@playwright/test';
import { framesRendered } from './helpers';

const PANEL_POLICIES = [
  { tier: 'low', rendersBehindPanel: false },
  { tier: 'medium', rendersBehindPanel: true },
  { tier: 'high', rendersBehindPanel: true },
] as const;

test.describe('project destination', () => {
  test('a deep link opens the panel with the README over that world', async ({ page }) => {
    await page.goto('/p/novaverta/info');

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Phönix Industriedienstleistungen');
    // Straight from the bundled README, not from projects.ts.
    await expect(dialog.locator('app-markdown')).toContainText('NOVA VERTA');
    await expect(page.locator('app-world-page canvas')).toBeVisible();
  });

  test('the panel links to the demo and the source', async ({ page }) => {
    await page.goto('/p/novaverta/info');

    await expect(page.locator('a[data-role="demo"]')).toHaveAttribute(
      'href',
      'https://jamie-io.github.io/novaverta/',
    );
    await expect(page.locator('a[data-role="source"]')).toHaveAttribute(
      'href',
      'https://github.com/jamie-io/novaverta',
    );
  });

  test('closing the panel leaves the visitor in the repository’s own world', async ({ page }) => {
    await page.goto('/p/novaverta/info');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.locator('button[data-role="close"]').click();

    await expect(page).toHaveURL(/\/p\/novaverta$/);
    await expect(page.getByRole('dialog', { name: /Phönix/ })).toHaveCount(0);
    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');
    await expect(page.locator('app-hud .area')).toContainText('Showroom');
  });

  test('escape closes the panel too', async ({ page }) => {
    await page.goto('/p/novaverta/info');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog', { name: /Phönix/ })).toHaveCount(0);
  });

  test('an unknown slug explains itself and leaves the start world standing', async ({ page }) => {
    await page.goto('/p/nope/info');

    await expect(page.getByRole('dialog')).toContainText('nicht gefunden');
    await expect(page.locator('app-hud .area')).toContainText('Lichtung');
  });

  for (const policy of PANEL_POLICIES) {
    test(`opening and closing panel preserves ${policy.tier}-tier frame policy and navigation`, async ({
      page,
    }) => {
      await page.addInitScript((qualityOverride) => {
        localStorage.setItem(
          'gitplore.settings',
          JSON.stringify({ qualityOverride, sensitivity: 1, reducedMotionOverride: true }),
        );
      }, policy.tier);

      await page.goto('/p/novaverta/info?stats=1');
      await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');
      await expect(page.getByRole('dialog')).toBeVisible();

      // Low pauses; medium and high keep drawing at the engine's 15 fps panel throttle.
      await page.keyboard.down('KeyW');
      const panelFrames = await framesRendered(page);
      const laterPanelFrames = await framesRendered(page);
      await page.keyboard.up('KeyW');

      if (policy.rendersBehindPanel) {
        expect(laterPanelFrames).toBeGreaterThan(panelFrames);
      } else {
        expect(laterPanelFrames).toBe(panelFrames);
      }

      await page.locator('button[data-role="close"]').click();
      await expect(page).toHaveURL(/\/p\/novaverta$/);
      await expect(page.locator('app-hud .area')).toContainText('Showroom');
      await expect.poll(() => framesRendered(page)).toBeGreaterThan(laterPanelFrames);
    });
  }
});
