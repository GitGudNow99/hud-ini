import { expect, test } from '@playwright/test';
const rendererUrl = `/@fs${new URL('../../src/render.ts', import.meta.url).pathname}`;

test('tape cues convert altitude datum, project trends, expire and respect switches', async ({
  page,
}) => {
  await page.goto('/#lab');
  const samples = await page.evaluate(
    async ({ rendererUrl }) => {
      const { renderHud } = await import(rendererUrl);
      const ctx = document.createElement('canvas').getContext('2d')!;
      const fill = ctx.fillText.bind(ctx),
        stroke = ctx.stroke.bind(ctx),
        move = ctx.moveTo.bind(ctx),
        line = ctx.lineTo.bind(ctx),
        rect = ctx.fillRect.bind(ctx);
      let labels: string[] = [],
        lines: { x: number; y: number }[][] = [],
        points: { x: number; y: number }[] = [],
        readouts: { x: number; y: number; width: number; height: number }[] = [];
      ctx.fillRect = (x, y, width, height) => {
        if (width === 62 && height === 28) readouts.push({ x, y, width, height });
        rect(x, y, width, height);
      };
      ctx.fillText = (label, x, y) => {
        labels.push(label);
        fill(label, x, y);
      };
      ctx.moveTo = (x, y) => {
        points = [{ x, y }];
        move(x, y);
      };
      ctx.lineTo = (x, y) => {
        points.push({ x, y });
        line(x, y);
      };
      ctx.stroke = (path?: Path2D) => {
        if (ctx.getLineDash().length && points.length === 2) lines.push([...points]);
        if (path) stroke(path);
        else stroke();
      };
      const r = (value: number) => ({ value, at: 5 });
      return [
        { time: 5, datum: 'MSL', enabled: true },
        { time: 7, datum: 'MSL', enabled: true },
        { time: 5, datum: 'AGL', enabled: true },
        { time: 5, datum: 'MSL', enabled: false },
      ].map(({ time, datum, enabled }) => {
        labels = [];
        lines = [];
        readouts = [];
        renderHud(
          ctx,
          {
            time,
            label: 'TAPE TEST',
            source: 'demo',
            groundSpeedMps: r(10),
            targetGroundSpeedMps: r(13),
            groundAccelerationMps2: r(0.5),
            altitudeM: r(100),
            altitudeDatum: 'REL HOME',
            altitudeMslM: r(200),
            targetAltitudeM: r(225),
            targetAltitudeDatum: datum,
            climbMps: r(2),
          },
          { width: 1050, height: 700 },
          { preset: 'multirotor', panels: { targets: enabled, trends: enabled, attitude: false } },
        );
        return { labels, lines, readouts };
      });
    },
    { rendererUrl },
  );
  expect(samples[0]!.labels).toEqual(expect.arrayContaining(['T 13.0', 'T 125', '+6s']));
  expect(samples[0]!.lines).toHaveLength(4);
  for (const [start, end] of samples[0]!.lines) {
    expect(end!.y).toBeLessThan(start!.y);
    expect(
      samples[0]!.readouts.some(
        (box) => start!.x > box.x && start!.x < box.x + box.width && start!.y === box.y,
      ),
    ).toBe(true);
  }
  expect(samples[1]!.labels.some((label) => label.startsWith('T ') || label === '+6s')).toBe(false);
  expect(samples[1]!.lines).toHaveLength(0);
  expect(samples[2]!.labels).not.toContain('T 125');
  expect(samples[2]!.labels).toContain('T 13.0');
  expect(samples[3]!.labels.some((label) => label.startsWith('T ') || label === '+6s')).toBe(false);
  expect(samples[3]!.lines).toHaveLength(0);
});
