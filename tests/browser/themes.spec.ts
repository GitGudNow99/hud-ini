import { pick } from './ui';
import { expect, test } from '@playwright/test';

const indexUrl = `/@fs${new URL('../../src/index.ts', import.meta.url).pathname}`;

test('Spectrum color controls update the HUD and return focus on dismissal', async ({ page }) => {
  await page.goto('/#lab');
  await expect(page.locator('#hud canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Theme settings' }).click();
  const accent = page.getByRole('textbox', { name: /^Accent/ });
  const before = await accent.inputValue();
  const trigger = page.getByRole('button', { name: 'Accent color picker', exact: true });
  await trigger.click();
  const hue = page.getByRole('slider', { name: 'Hue', exact: true });
  await hue.focus();
  await hue.press('ArrowRight');
  await expect(accent).not.toHaveValue(before);
  const theme = await page.evaluate(async (url) => {
    const { hudThemeFromCss } = await import(url);
    return hudThemeFromCss(document.documentElement);
  }, indexUrl);
  expect(theme.accent).toBe(await accent.inputValue());
  await page.keyboard.press('Escape');
  await expect(hue).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('custom HUD theme updates pixels, persists and exports CSS and JSON', async ({
  page,
  context,
}, info) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/#lab');
  await expect(page.locator('#hud canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Theme settings' }).click();
  const before = await page
    .locator('#hud canvas')
    .evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await page.getByRole('textbox', { name: /^Accent/ }).fill('#ff42c8');
  await page.getByRole('textbox', { name: /^Text / }).fill('#e9e4ff');
  await expect
    .poll(() => page.locator('#hud canvas').evaluate((c) => (c as HTMLCanvasElement).toDataURL()))
    .not.toBe(before);
  const theme = await page.evaluate(async (url) => {
    const { hudThemeFromCss } = await import(url);
    return hudThemeFromCss(document.documentElement);
  }, indexUrl);
  expect(theme.accent).toBe('#ff42c8');
  expect(theme.ink).toBe('#e9e4ff');
  await pick(page, 'theme-preset', 'custom');
  await expect(page.getByRole('textbox', { name: /^Accent/ })).toHaveValue('#ff42c8');
  await page.locator('#theme-name').fill('Purple mission');
  await page.getByRole('button', { name: 'Save theme', exact: true }).click();
  await expect(page.locator('#theme-preset')).toHaveText('Purple mission');
  await page.getByRole('button', { name: 'Export / import theme' }).click();
  await expect(
    page.getByRole('dialog', { name: 'Use your theme in another project' }),
  ).toBeVisible();
  await expect(page.locator('#theme-css')).toContainText('--hud-ini-accent: #ff42c8;');
  await page.getByRole('button', { name: 'Copy CSS', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('.hud-ini-theme');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSS' }).click();
  expect((await download).suggestedFilename()).toBe('hud-ini-theme.css');
  await page.getByRole('tab', { name: 'JSON', exact: true }).click();
  const exported = JSON.parse((await page.locator('#theme-json').textContent())!);
  expect(exported.theme.accent).toBe('#ff42c8');
  expect(exported.name).toBe('Purple mission');
  await page
    .getByRole('dialog', { name: 'Use your theme in another project' })
    .screenshot({ path: info.outputPath('theme-export.png') });
  await page.keyboard.press('Escape');
  await page.screenshot({ path: info.outputPath('custom-theme-lab.png') });
  await page.reload();
  await page.getByRole('button', { name: 'Theme settings' }).click();
  await expect(page.getByRole('textbox', { name: /^Accent/ })).toHaveValue('#ff42c8');
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: 'Components', exact: true }).click();
  await page.getByRole('button', { name: 'Pause previews' }).click();
  const preview = page.locator('[data-component="heading"] canvas');
  const purple = await preview.evaluate((c) => (c as HTMLCanvasElement).toDataURL());
  await page.getByRole('radio', { name: 'Vehicle lab', exact: true }).click();
  await page.getByRole('button', { name: 'Theme settings' }).click();
  await page.getByRole('button', { name: 'Reset', exact: true }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('radio', { name: 'Components', exact: true }).click();
  await expect
    .poll(() => preview.evaluate((c) => (c as HTMLCanvasElement).toDataURL()))
    .not.toBe(purple);
});

test('CSS themes inherit per container and an invalid import cannot replace the active theme', async ({
  page,
}) => {
  await page.goto('/#lab');
  const inherited = await page.evaluate(async (url) => {
    const { hudThemeFromCss } = await import(url);
    const parent = document.createElement('div'),
      child = document.createElement('canvas');
    parent.style.setProperty('--hud-ini-accent', '#123abc');
    parent.style.setProperty('--hud-ini-outline', '#100020');
    parent.append(child);
    document.body.append(parent);
    const first = hudThemeFromCss(child);
    parent.style.setProperty('--hud-ini-accent', '#fefefe');
    const updated = hudThemeFromCss(child);
    parent.remove();
    return { first, updated };
  }, indexUrl);
  expect(inherited.first.accent).toBe('#123abc');
  expect(inherited.first.outline).toBe('#100020');
  expect(inherited.updated.accent).toBe('#fefefe');
  await page.getByRole('button', { name: 'Theme settings' }).click();
  await page.getByRole('button', { name: 'Export / import theme' }).click();
  await page.locator('input[type=file]').setInputFiles({
    name: 'custom.json',
    mimeType: 'application/json',
    buffer: Buffer.from(
      JSON.stringify({
        name: 'Imported orange',
        theme: { accent: '#ff8800', outline: '#221100' },
      }),
    ),
  });
  await expect(page.locator('#theme-css')).toContainText('--hud-ini-accent: #ff8800;');
  await page.locator('input[type=file]').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ theme: { accent: 'definitely-not-a-color' } })),
  });
  await expect(
    page.getByRole('dialog', { name: 'Use your theme in another project' }),
  ).toContainText('Import failed');
  await expect(page.locator('#theme-css')).toContainText('--hud-ini-accent: #ff8800;');
});
