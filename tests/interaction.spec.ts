import { readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { startWorld } from './helpers';

const SYNCED_COUNT = JSON.parse(readFileSync('public/content/repos.json', 'utf8')).length as number;

/**
 * M3 (IMPLEMENTATION_PLAN.md §10): walk to a portal, use it, come back at its exit point. The
 * suite polls for the prompt rather than timing the walk, because software rendering runs the
 * simulation slower than wall-clock time.
 */

test.describe('landmarks and interaction', () => {
  test('walking up to the portal shows a prompt, E opens the project, Esc returns to the portal', async ({
    page,
  }) => {
    await startWorld(page);
    const prompt = page.locator('app-hud .prompt');
    await expect(prompt).toBeEmpty();

    // The deslopify portal stands straight ahead (-Z) of the spawn.
    await page.keyboard.down('ShiftLeft');
    await page.keyboard.down('KeyW');
    await expect(prompt).toContainText('Deslopify betreten', { timeout: 30_000 });
    await page.keyboard.up('KeyW');
    await page.keyboard.up('ShiftLeft');
    await expect(page.locator('app-hud .area')).toHaveText('Deslopify');

    await page.keyboard.press('KeyE');
    await expect(page).toHaveURL(/\/p\/deslopify$/);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Deslopify');

    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Back in the world at the portal's exit point: the area still names the project ...
    await expect(page.locator('app-hud .area')).toHaveText('Deslopify');
    // ... and the player faces away from the portal, so no prompt.
    await expect(prompt).toBeEmpty();
  });

  test('the menu fast-travels to a landmark and opens a project', async ({ page }) => {
    await startWorld(page);

    await page.keyboard.press('KeyM');
    const menu = page.getByRole('dialog', { name: 'Projekte' });
    await expect(menu).toBeVisible();
    await expect(menu.locator('li')).toHaveCount(SYNCED_COUNT);

    await menu.locator('button[data-role="travel"][data-slug="novaverta"]').click();
    await expect(menu).toHaveCount(0);
    await expect(page.locator('app-hud .area')).toHaveText('Phönix Industriedienstleistungen');
    // Fast travel faces the landmark, so it can be used at once.
    await expect(page.locator('app-hud .prompt')).toContainText('ansehen');

    await page.keyboard.press('KeyE');
    await expect(page).toHaveURL(/\/p\/novaverta$/);
  });

  test('the menu button in the HUD opens the menu and Esc closes it', async ({ page }) => {
    await startWorld(page);

    await page.locator('button[data-role="menu"]').click();
    await expect(page.getByRole('dialog', { name: 'Projekte' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a deep link places the player at that landmark', async ({ page }) => {
    await page.goto('/p/deslopify');
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.locator('button[data-role="close"]').click();
    await page.locator('button[data-role="start"]').click();

    await expect(page.locator('app-hud .area')).toHaveText('Deslopify');
  });
});
