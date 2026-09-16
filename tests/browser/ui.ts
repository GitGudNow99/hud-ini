import { expect, type Locator, type Page } from '@playwright/test';

/** Select through Spectrum's visible picker and listbox, including keyboard-focus behavior. */
export async function pick(page: Page, id: string, value: string) {
  await page.locator(`#${id}`).click();
  const option = page
    .getByRole('listbox')
    .locator(`[role="option"][data-key=${JSON.stringify(value)}]`);
  await expect(option).toBeVisible();
  await option.click();
  await expect(page.getByRole('listbox')).toBeHidden();
  await expect(page.locator(`#${id}`)).toHaveAttribute('aria-expanded', 'false');
}

export async function selectVehicle(page: Page, preset: string) {
  await expect(page.locator('#vehicle-lab')).toBeVisible();
  if (await page.locator('#mobile-profile').isVisible()) await pick(page, 'mobile-profile', preset);
  else await page.locator(`[data-preset=${JSON.stringify(preset)}] a`).click();
}

/** Exercise the checkbox through its focusable input rather than its decorative visual. */
export async function setChecked(checkbox: Locator, checked: boolean) {
  if ((await checkbox.isChecked()) !== checked) {
    await checkbox.focus();
    await checkbox.press('Space');
  }
  await expect(checkbox).toBeChecked({ checked });
}
