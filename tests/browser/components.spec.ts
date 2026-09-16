import { setChecked, pick, selectVehicle } from './ui';
import { expect, test } from '@playwright/test';

test('component kitchen sink exposes real panels, variants, inspection and data states', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/#components');
  await expect(page.locator('[data-component]')).toHaveCount(70);
  await expect(page.getByRole('radio', { name: 'Components', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  );
  const empty = await page.locator('[data-component] canvas').evaluateAll(
    (canvases) =>
      canvases.filter((el) => {
        const canvas = el as HTMLCanvasElement;
        const pixels = canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        return !pixels.some((value, index) => index % 4 === 3 && value > 0);
      }).length,
  );
  expect(empty).toBe(0);
  await page.getByRole('radio', { name: 'Alerts and guidance', exact: true }).click();
  await expect(page.locator('[data-component]')).toHaveCount(9);
  await page.locator('#component-search').fill('emergency');
  await expect(page.locator('[data-component]')).toHaveCount(1);
  await page.getByRole('link', { name: /^Emergency/ }).click();
  await expect(page.locator('#component-detail')).toBeVisible();
  await page.getByRole('tab', { name: 'Sample data' }).click();
  await expect(page.locator('#component-detail-data')).toContainText('Propulsion failure');
  await page.getByRole('tab', { name: 'Code', exact: true }).click();
  await expect(page.locator('#component-detail-code')).toContainText('"messages": true');
  await page.getByRole('link', { name: 'All components', exact: true }).click();
  await page.locator('#component-search').fill('');
  await pick(page, 'component-background', 'white');
  await expect(page.locator('[data-background]').first()).toHaveCSS(
    'background-color',
    'rgb(255, 255, 255)',
  );
  await pick(page, 'component-state', 'stale');
  await expect(page.locator('[data-component="return"] canvas')).toHaveAttribute(
    'aria-label',
    /guidance unavailable/,
  );
  await expect(page.locator('[data-component="return"] canvas')).not.toHaveAttribute(
    'aria-label',
    /RETURN TO HOME/,
  );
  await page.getByRole('radio', { name: 'Vehicle lab', exact: true }).click();
  await expect(page.locator('#vehicle-lab')).toBeVisible();
  await expect(page.locator('#profiles [slot=icon] svg')).toHaveCount(11);
  expect(errors).toEqual([]);
});

test('emergency and guidance states stay readable on mobile and expire during input loss', async ({
  page,
}, info) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/#lab');
  await page.locator('#load-status').waitFor({ state: 'hidden' });
  await selectVehicle(page, 'multirotor');
  await page.locator('#load-status').waitFor({ state: 'hidden' });
  await pick(page, 'display-state', 'emergency');
  await expect(page.locator('#hud canvas')).toHaveAttribute(
    'aria-label',
    /emergency: Propulsion failure/,
  );
  await expect(page.locator('#hud canvas')).toHaveAttribute(
    'aria-label',
    /OPERATOR CONTROL REQUIRED/,
  );
  await page.locator('#viewport').screenshot({ path: info.outputPath('emergency-mobile.png') });
  await pick(page, 'display-state', 'return');
  await expect(page.locator('#hud canvas')).toHaveAttribute('aria-label', /RETURN TO HOME/);
  await setChecked(page.getByRole('checkbox', { name: 'Freeze telemetry', exact: true }), true);
  await expect(page.locator('#hud canvas')).toHaveAttribute('aria-label', /guidance unavailable/, {
    timeout: 5000,
  });
  await expect(page.locator('#hud canvas')).not.toHaveAttribute('aria-label', /RETURN TO HOME/);
  await page.getByRole('radio', { name: 'Components', exact: true }).click();
  await expect(page.locator('[data-component]')).toHaveCount(70);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('components-mobile.png') });
});
