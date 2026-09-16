import { expect, test } from '@playwright/test';
const rendererUrl = `/@fs${new URL('../../src/render.ts', import.meta.url).pathname}`;
const depthUrl = `/@fs${new URL('../../examples/three-depth.ts', import.meta.url).pathname}`;
const threeUrl = `/@fs${new URL('../../node_modules/three/build/three.module.js', import.meta.url).pathname}`;

test('occluded anchors dim or hide, while unknown and expired visibility stay visible', async ({
  page,
}) => {
  await page.goto('/#lab');
  const samples = await page.evaluate(async (url) => {
    const { renderHud } = await import(url);
    const canvas = document.createElement('canvas');
    canvas.width = 1050;
    canvas.height = 700;
    const ctx = canvas.getContext('2d')!;
    return ['visible', 'dim', 'hide', 'unknown', 'expired', 'off', 'host-hidden'].map((mode) => {
      renderHud(
        ctx,
        {
          time: 6,
          source: 'demo',
          label: 'TEST',
          ar: {
            camera: {
              at: 6,
              position: [0, 0, 0],
              viewProjection: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1],
            },
            objects: [
              {
                id: 'target',
                kind: 'waypoint',
                label: 'TARGET',
                at: 6,
                position: [0, 0, 0],
                color: '#ff00ff',
                visible: mode !== 'host-hidden',
                visibility: {
                  state:
                    mode === 'visible' ? 'visible' : mode === 'unknown' ? 'unknown' : 'occluded',
                  scope: 'anchor',
                  at: mode === 'expired' ? 1 : 6,
                },
              },
            ],
          },
        },
        { width: 1050, height: 700 },
        {
          arOcclusion:
            mode === 'hide' || mode === 'unknown' || mode === 'expired'
              ? 'hide'
              : mode === 'off' || mode === 'host-hidden'
                ? 'off'
                : 'dim',
          panels: { ar: true, arLabels: false, reticle: false, attitude: false },
        },
      );
      const pixels = ctx.getImageData(510, 335, 30, 30).data;
      let alpha = 0;
      for (let i = 0; i < pixels.length; i += 4)
        if (pixels[i]! > 80 && pixels[i + 1]! < 50 && pixels[i + 2]! > 80) alpha += pixels[i + 3]!;
      return alpha;
    });
  }, rendererUrl);
  expect(samples[0]).toBeGreaterThan(0);
  expect(samples[1]).toBeGreaterThan(0);
  expect(samples[1]).toBeLessThan(samples[0]!);
  expect(samples[2]).toBe(0);
  expect(samples.slice(3, 6)).toEqual([samples[0], samples[0], samples[0]]);
  expect(samples[6]).toBe(0);
});

test('host depth example hides only the middle of a route behind a wall', async ({
  page,
}, info) => {
  await page.goto('/#lab');
  const samples = await page.evaluate(
    async ({ depthUrl, threeUrl }) => {
      const T = await import(threeUrl);
      const { createArWireframe } = await import(depthUrl);
      const canvas = document.createElement('canvas');
      canvas.id = 'depth-example';
      document.body.replaceChildren(canvas);
      const renderer = new T.WebGLRenderer({
        canvas,
        antialias: false,
        preserveDrawingBuffer: true,
      });
      renderer.setSize(400, 200);
      const scene = new T.Scene();
      const camera = new T.PerspectiveCamera(50, 2, 0.1, 100);
      camera.position.set(0, 0, 10);
      const wall = new T.Mesh(
        new T.BoxGeometry(2, 4, 1),
        new T.MeshBasicMaterial({ color: '#333333' }),
      );
      wall.position.z = 2;
      scene.add(wall);
      const wire = createArWireframe({
        id: 'path',
        kind: 'route',
        label: 'PATH',
        at: 0,
        color: '#ff00ff',
        points: [
          [-4, 0, 0],
          [4, 0, 0],
        ],
      })!;
      scene.add(wire.lines);
      const copy = document.createElement('canvas');
      copy.width = 400;
      copy.height = 200;
      const ctx = copy.getContext('2d')!;
      const read = () => {
        renderer.render(scene, camera);
        ctx.drawImage(canvas, 0, 0);
        return [130, 200, 270].map((x) => {
          const pixels = ctx.getImageData(x - 4, 96, 8, 8).data;
          return pixels.some(
            (v, i) => i % 4 === 0 && v > 150 && pixels[i + 1]! < 50 && pixels[i + 2]! > 150,
          );
        });
      };
      const withDepth = read();
      wire.lines.material.depthTest = false;
      const withoutDepth = read();
      wire.lines.material.depthTest = true;
      read();
      wire.dispose();
      wall.geometry.dispose();
      wall.material.dispose();
      renderer.dispose();
      return { withDepth, withoutDepth };
    },
    { depthUrl, threeUrl },
  );
  expect(samples.withDepth).toEqual([true, false, true]);
  expect(samples.withoutDepth).toEqual([true, true, true]);
  await page.locator('#depth-example').screenshot({ path: info.outputPath('partial-depth.png') });
});
