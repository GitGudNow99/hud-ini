import { expect, test } from '@playwright/test';

test('catalogue cards fill their columns and detail content shares one alignment', async ({
  page,
}, info) => {
  await page.goto('/#components');
  await expect(page.locator('[data-component="heading"] canvas')).toBeVisible();
  for (const width of [2048, 1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const geometry = await page.locator('#component-grid').evaluate((grid) => {
      const cards = [...grid.querySelectorAll<HTMLElement>('[data-component]')];
      const first = cards[0]!.getBoundingClientRect();
      const row = cards.filter(
        (card) => Math.abs(card.getBoundingClientRect().top - first.top) < 1,
      );
      return {
        width: grid.getBoundingClientRect().width,
        count: row.length,
        gap: Number.parseFloat(getComputedStyle(grid).columnGap),
        cards: row.map((card) => {
          const bounds = card.getBoundingClientRect();
          const preview = card.querySelector('[data-background]')!.getBoundingClientRect();
          const title = card.querySelector('[slot="title"]')!.getBoundingClientRect();
          const description = card.querySelector('[slot="description"]')!.getBoundingClientRect();
          return {
            width: bounds.width,
            title: title.top,
            description: description.top,
            spacing: title.top - preview.bottom,
          };
        }),
      };
    });
    const columnWidth = (geometry.width - geometry.gap * (geometry.count - 1)) / geometry.count;
    for (const card of geometry.cards) {
      expect(Math.abs(card.width - columnWidth)).toBeLessThan(1);
      expect(card.spacing).toBeGreaterThanOrEqual(12);
      expect(Math.abs(card.title - geometry.cards[0]!.title)).toBeLessThan(1);
      expect(Math.abs(card.description - geometry.cards[0]!.description)).toBeLessThan(1);
    }
    await page.screenshot({ path: info.outputPath(`catalogue-${width}.png`) });
  }
  await page.getByRole('link', { name: /^Heading ribbon/ }).click();
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const title = await page
      .getByRole('heading', { name: 'Heading ribbon', exact: true })
      .boundingBox();
    const preview = await page.locator('#component-detail-preview').boundingBox();
    const tabs = await page.getByRole('tablist', { name: 'Component details' }).boundingBox();
    expect(Math.abs(title!.x - preview!.x)).toBeLessThan(1);
    expect(Math.abs(tabs!.x - preview!.x)).toBeLessThan(1);
    expect(preview!.height).toBeLessThanOrEqual(260);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`detail-${width}.png`) });
  }
});

test('playback buttons, scrubber and time readout stay centered at desktop and narrow widths', async ({
  page,
}, info) => {
  await page.goto('/#lab/boat');
  await expect(page.locator('#hud canvas')).toBeVisible();
  for (const width of [2048, 1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    const slider = page.getByRole('slider', { name: 'Scenario time', exact: true });
    await slider.focus();
    await slider.press('ArrowRight');
    await expect(slider).toHaveValue(width === 2048 ? '6.1' : width === 1440 ? '6.2' : '6.3');
    const center = (box: { y: number; height: number }) => box.y + box.height / 2;
    const play = await page.locator('#play').boundingBox();
    const scrubber = await slider.boundingBox();
    const output = await page.locator('#seek output').boundingBox();
    const restart = await page.locator('#restart').boundingBox();
    expect(Math.abs(center(play!) - center(scrubber!))).toBeLessThanOrEqual(2);
    expect(Math.abs(center(play!) - center(output!))).toBeLessThanOrEqual(2);
    expect(Math.abs(center(play!) - center(restart!))).toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.screenshot({ path: info.outputPath(`playback-${width}.png`) });
  }
});
