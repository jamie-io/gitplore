import { expect, test } from '@playwright/test';
import { startWorld } from './helpers';

test.describe('walking between worlds', () => {
  test('using a portal changes the world, and the way back returns to it', async ({ page }) => {
    await startWorld(page);
    await expect(page.locator('app-hud .area')).toContainText('Lichtung');

    await page.keyboard.press('KeyM');
    await page.locator('button[data-role="travel"][data-slug="deslopify"]').click();
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await expect(page.locator('app-hud .prompt')).toContainText('betreten');

    await page.keyboard.press('KeyE');

    await expect(page).toHaveURL(/\/p\/deslopify$/);
    await expect(page.locator('app-hud .area')).toContainText('Dschungel');

    // The return portal stands at the arrival point, right behind the visitor: turning to face it
    // is enough, no walking needed.
    await page.keyboard.down('ArrowLeft');
    await expect(page.locator('app-hud .prompt')).toContainText('Zurück', { timeout: 20_000 });
    await page.keyboard.up('ArrowLeft');
    await page.keyboard.press('KeyE');

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('app-hud .area')).toContainText('Deslopify');
  });

  test('a deep link builds the repo world without the start world first', async ({ page }) => {
    await page.goto('/p/deslopify');

    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');
    await expect(page.locator('app-hud .area')).toContainText('Dschungel — Deslopify');
  });

  test('a deep link to the description opens the panel over that world', async ({ page }) => {
    await page.goto('/p/deslopify/info');

    await expect(page.getByRole('dialog', { name: 'Deslopify' })).toBeVisible();
    await expect(page.locator('app-world-page canvas')).toBeVisible();
  });

  test('the browser’s back button walks back across worlds', async ({ page }) => {
    await startWorld(page);
    await page.keyboard.press('KeyM');
    await page.locator('a[data-role="open"][data-slug="novaverta"]').click();
    await expect(page.locator('app-hud .area')).toContainText('Showroom');

    await page.goBack();

    await expect(page).toHaveURL(/\/$/);
    await expect(page.locator('app-hud .area')).toContainText('Lichtung');
  });

  test('the exhibit in a repo world opens that project’s description', async ({ page }) => {
    await page.goto('/p/novaverta');
    await page.locator('button[data-role="start"]').click();
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await page.locator('app-world-page canvas').focus();

    await page.keyboard.down('KeyW');
    await expect(page.locator('app-hud .prompt')).toContainText('ansehen', { timeout: 20_000 });
    await page.keyboard.up('KeyW');
    await page.keyboard.press('KeyE');

    await expect(page).toHaveURL(/\/p\/novaverta\/info$/);
    await expect(page.getByRole('dialog', { name: /Phönix/ })).toBeVisible();
  });
});
