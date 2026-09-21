import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { startWorld } from './helpers';

/** Spec §8: a repo world and the panel over it must both survive an axe pass. */
test.describe('accessibility', () => {
  test('a repo world has no automatically detectable violations', async ({ page }) => {
    await page.goto('/p/novaverta');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-phase', 'ready');

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('the settings dialog has no automatically detectable violations', async ({ page }) => {
    await startWorld(page);
    await page.locator('button[data-role="settings"]').click();
    await expect(page.getByRole('dialog', { name: 'Einstellungen' })).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('the description panel over a repo world has none either', async ({ page }) => {
    await page.goto('/p/novaverta/info');
    await expect(page.getByRole('dialog')).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      // The panel embeds the project's own live demo in a sandboxed, cross-origin iframe
      // (`novaverta`'s GitHub Pages site). That page is a separate project with its own
      // accessibility surface; gitplore's own definition of done covers the panel that frames
      // it, not a third-party document it merely links to.
      .exclude('iframe')
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('the project menu has no violations in the hub or a repository world', async ({ page }) => {
    const scanMenu = () =>
      new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();

    await startWorld(page);
    await page.keyboard.press('KeyM');
    const hubMenu = page.getByRole('dialog', { name: 'Projekte' });
    await expect(hubMenu).toBeVisible();
    await expect(hubMenu.locator('.distance').first()).toBeVisible();
    expect((await scanMenu()).violations).toEqual([]);

    await startWorld(page, '/p/novaverta');
    await page.keyboard.press('KeyM');
    const repoMenu = page.getByRole('dialog', { name: 'Projekte' });
    const current = repoMenu.locator('li[data-slug="novaverta"]');
    await expect(repoMenu).toBeVisible();
    await expect(current).toHaveAttribute('aria-current', 'location');
    await expect(current.locator('.current-badge')).toHaveText('Du bist hier');
    expect((await scanMenu()).violations).toEqual([]);
  });

  test("a README's task lists survive the same pass", async ({ page }) => {
    // Deslopify is the only README with GFM task lists, and `marked` renders those as bare
    // disabled checkboxes — form controls with no accessible name. Scanning only novaverta hid
    // eleven `label` violations from this suite until a Lighthouse run found them.
    await page.goto('/p/deslopify/info');
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.locator('.markdown input[type="checkbox"]').first()).toBeVisible();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .exclude('iframe')
      .analyze();

    expect(results.violations).toEqual([]);
  });

  test('the document declares the language it is actually written in', async ({ page }) => {
    // WCAG 3.1.1. The interface is German throughout, so an `en` document made every screen
    // reader pronounce it with an English voice. axe cannot detect a wrong language, only a
    // missing one, which is why this is asserted rather than scanned.
    await page.goto('/projects');

    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });

  test('the camp obelisk opens a contact dialog that traps focus and hands it back', async ({
    page,
  }) => {
    await startWorld(page);
    const prompt = page.locator('app-hud .prompt');
    await expect(prompt).toBeEmpty();

    // The obelisk stands right of the spawn, a step ahead of it: sidestep until it is offered,
    // as a visitor would, and stop within a frame of the prompt appearing.
    await page.keyboard.down('KeyD');
    await page.waitForFunction(
      () =>
        document.querySelector('app-hud .prompt')?.textContent?.includes('Kontakt und Lebenslauf'),
      undefined,
      { polling: 'raf', timeout: 30_000 },
    );
    await page.keyboard.up('KeyD');
    await expect(prompt).toContainText('Kontakt und Lebenslauf');

    await page.keyboard.press('KeyE');
    await expect(page).toHaveURL(/\/kontakt$/);
    const dialog = page.getByRole('dialog', { name: 'Jamie Jahn' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('aria-modal', 'true');
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'ui');

    const close = dialog.locator('button[data-role="close"]');
    const mail = dialog.locator('a[data-role="mail"]');
    const cv = dialog.locator('a[data-role="document"]');
    await expect(close).toBeFocused();
    await expect(mail).toHaveAttribute('href', 'mailto:jamiejahn68@gmail.com');
    await expect(cv).toHaveText('Lebenslauf, PDF, 144 kB');
    await expect(cv).toHaveAttribute('download', '');
    const cvResponse = await page.request.get(await cv.getAttribute('href').then((href) => href!));
    expect(cvResponse.status()).toBe(200);
    // The local test server serves no PDF type, so the file's own magic number says it arrived.
    expect((await cvResponse.body()).subarray(0, 5).toString('latin1')).toBe('%PDF-');

    // Tab walks the dialog's controls and wraps from the last back to the first, both ways.
    const focusable = dialog.locator('a[href], button');
    const count = await focusable.count();
    for (let i = 1; i < count; i++) {
      await page.keyboard.press('Tab');
      await expect(focusable.nth(i)).toBeFocused();
    }
    await page.keyboard.press('Tab');
    await expect(close).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(focusable.nth(count - 1)).toBeFocused();

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    expect(results.violations).toEqual([]);

    // Escape closes it; the world takes the keys back and the focus returns to the canvas.
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.locator('app-world-page canvas')).toBeFocused();
    await expect(page.locator('app-world-page')).toHaveAttribute('data-input-mode', 'world');
    await expect(prompt).toContainText('Kontakt und Lebenslauf');
  });
});
