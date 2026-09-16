import { describe, expect, it } from 'vitest';
import { BoxGeometry, DoubleSide, Mesh, MeshBasicMaterial } from 'three';
import { ArVisibilityResolver, createHeightfieldProvider } from '../src/terrain.js';
import type {
  ArVisibilityAnswer,
  ArVisibilityProvider,
  TerrainHeightfield,
} from '../src/terrain.js';
import type { HudArScene, HudWorldPoint } from '../src/index.js';
import { createMeshVisibilityProvider } from '../examples/three-visibility.js';
import { arTerrainScene } from '../demo/ar-scene.js';

const grid = (heights: number[] = [0, 0, 0, 0]): TerrainHeightfield => ({
  referenceFrame: 'test',
  origin: [0, 0],
  columns: 2,
  rows: 2,
  cellSizeM: 10,
  heights,
});
const evaluate = (
  provider: ArVisibilityProvider,
  observer: HudWorldPoint,
  target: HudWorldPoint,
  referenceFrame = 'test',
  signal = new AbortController().signal,
) =>
  provider.evaluate(
    { referenceFrame, at: 6, observer, targets: [{ id: 'target', position: target }] },
    signal,
  );
const scene = (): HudArScene => ({
  referenceFrame: 'test',
  camera: { at: 6, position: [0, 0, 10], viewProjection: [] },
  objects: [{ id: 'target', kind: 'waypoint', label: 'TARGET', at: 6, position: [0, 10, 10] }],
});
const state = (resolver: ArVisibilityResolver, s = scene(), time = 6) =>
  resolver.apply(s, time).objects[0]!.visibility!.state;

describe('heightfield visibility', () => {
  it('interpolates all four cell corners and includes the far boundary', async () => {
    const provider = createHeightfieldProvider(grid([0, 0, 0, 20]), { toleranceM: 0 });
    expect((await evaluate(provider, [5, 5, 6], [5, 5, 5.1]))[0]!.state).toBe('visible');
    expect((await evaluate(provider, [5, 5, 6], [5, 5, 4.9]))[0]!.state).toBe('occluded');
    expect((await evaluate(provider, [10, 10, 25], [10, 10, 20]))[0]!.state).toBe('visible');
  });

  it('distinguishes the near side, far side and a ray above a nearby ridge', async () => {
    const provider = createHeightfieldProvider({
      ...grid(),
      columns: 3,
      cellSizeM: 2,
      heights: [0, 4, 0, 0, 4, 0],
    });
    expect((await evaluate(provider, [0, 1, 1], [0.25, 1, 1]))[0]!.state).toBe('visible');
    expect((await evaluate(provider, [0, 1, 1], [4, 1, 1]))[0]!.state).toBe('occluded');
    expect((await evaluate(provider, [0, 1, 8], [4, 1, 8]))[0]!.state).toBe('visible');
  });

  it('preserves unknown coverage and does not interpolate across nodata', async () => {
    for (const [missing, noData] of [
      [NaN, undefined],
      [-9999, -9999],
    ] as const) {
      const provider = createHeightfieldProvider({ ...grid([0, 0, 0, missing]), noData });
      expect((await evaluate(provider, [0, 0, 10], [5, 5, 10]))[0]!.state).toBe('unknown');
      expect((await evaluate(provider, [0, 0, 10], [10, 0, 10]))[0]!.state).toBe('visible');
    }
    expect(
      (await evaluate(createHeightfieldProvider(grid()), [0, 0, 5], [11, 0, 5]))[0]!.reason,
    ).toBe('missing-terrain');
    // A known obstruction establishes blockage even when the rest of the ray is unmapped.
    expect(
      (await evaluate(createHeightfieldProvider(grid([8, 8, 8, 8])), [-5, 0, 2], [5, 0, 2]))[0]!
        .state,
    ).toBe('occluded');
  });

  it('reports frame, range and sample limits without claiming a clear ray', async () => {
    expect(
      (await evaluate(createHeightfieldProvider(grid()), [0, 0, 1], [10, 0, 1], 'other'))[0]!
        .reason,
    ).toBe('reference-frame-mismatch');
    expect(
      (
        await evaluate(
          createHeightfieldProvider(grid(), { maxDistanceM: 2 }),
          [0, 0, 1],
          [10, 0, 1],
        )
      )[0]!.reason,
    ).toBe('range-limit');
    expect(
      (
        await evaluate(createHeightfieldProvider(grid(), { maxSamples: 2 }), [0, 0, 1], [10, 0, 1])
      )[0]!.reason,
    ).toBe('sample-budget');
    const abort = new AbortController();
    abort.abort();
    expect(
      (
        await evaluate(
          createHeightfieldProvider(grid()),
          [0, 0, 1],
          [10, 0, 1],
          'test',
          abort.signal,
        )
      )[0]!.reason,
    ).toBe('aborted');
  });

  it('rejects malformed input and isolates its terrain samples from caller mutations', async () => {
    for (const invalid of [
      { cellSizeM: 0 },
      { rows: 1 },
      { origin: [NaN, 0] as const },
      { heights: [0] },
    ])
      expect(() => createHeightfieldProvider({ ...grid(), ...invalid })).toThrow(RangeError);
    expect(() => createHeightfieldProvider(grid(), { stepM: 0 })).toThrow(RangeError);
    expect(
      (await evaluate(createHeightfieldProvider(grid()), [NaN, 0, 1], [10, 0, 1]))[0]!.state,
    ).toBe('unknown');
    const heights = [0, 0, 0, 0];
    const origin: [number, number] = [0, 0];
    const provider = createHeightfieldProvider({ ...grid(heights), origin });
    heights.fill(100);
    origin[0] = 100;
    expect((await evaluate(provider, [0, 0, 2], [10, 0, 2]))[0]!.state).toBe('visible');
  });

  it('drives the gallery from actual synthetic terrain calculations', async () => {
    const example = await arTerrainScene(6, 4 / 3);
    expect(example.objects.map((o) => o.visibility!.state)).toEqual([
      'visible',
      'occluded',
      'unknown',
    ]);
  });
});

describe('async visibility lifecycle', () => {
  const clear: ArVisibilityProvider = {
    evaluate: (request) => request.targets.map(({ id }) => ({ id, state: 'visible' })),
  };

  it('binds results to exact camera and target positions and reference frame', async () => {
    const resolver = new ArVisibilityResolver(clear);
    const original = scene();
    await resolver.update(original);
    expect(state(resolver, original)).toBe('visible');
    expect(original.objects[0]!.visibility).toBeUndefined();
    const moved = scene();
    moved.camera.position = [0, 1, 10];
    expect(state(resolver, moved)).toBe('unknown');
    expect(state(resolver, { ...scene(), referenceFrame: 'other' })).toBe('unknown');
    const targetMoved = scene();
    targetMoved.objects = [{ ...targetMoved.objects[0]!, kind: 'waypoint', position: [0, 11, 10] }];
    expect(state(resolver, targetMoved)).toBe('unknown');
    // Rotation/zoom changes alone do not alter the line of sight from a fixed observer.
    original.camera.viewProjection = [2, 3, 4];
    expect(state(resolver, original)).toBe('visible');
    resolver.destroy();
    expect(state(resolver)).toBe('unknown');
  });

  it('expires by input time and rejects future data and stale source timestamps', async () => {
    const resolver = new ArVisibilityResolver(clear);
    await resolver.update(scene());
    const current = scene();
    current.camera.at = 8;
    current.objects = current.objects.map((o) => ({ ...o, at: 8 }));
    expect(state(resolver, current, 8)).toBe('unknown');
    expect(state(resolver, scene(), 5)).toBe('unknown');
    await resolver.update(scene(), 8);
    expect(state(resolver)).toBe('unknown');
  });

  it('aborts previous requests and discards late responses even if the provider ignores abort', async () => {
    const pending: { finish: (a: ArVisibilityAnswer[]) => void; signal: AbortSignal }[] = [];
    const resolver = new ArVisibilityResolver({
      evaluate: (_, signal) => new Promise((finish) => pending.push({ finish, signal })),
    });
    const oldUpdate = resolver.update(scene());
    const moved = scene();
    moved.camera.position = [0, 2, 10];
    const newUpdate = resolver.update(moved);
    expect(pending[0]!.signal.aborted).toBe(true);
    pending[1]!.finish([{ id: 'target', state: 'occluded' }]);
    await newUpdate;
    pending[0]!.finish([{ id: 'target', state: 'visible' }]);
    await oldUpdate;
    expect(state(resolver, moved)).toBe('occluded');
    const invalidated = resolver.update(moved);
    resolver.invalidate();
    pending[2]!.finish([{ id: 'target', state: 'visible' }]);
    await invalidated;
    expect(state(resolver, moved)).toBe('unknown');
  });

  it('keeps missing, duplicate and failed provider answers unknown', async () => {
    for (const provider of [
      { evaluate: () => [] },
      {
        evaluate: () => [
          { id: 'target', state: 'visible' },
          { id: 'target', state: 'visible' },
        ],
      },
      {
        evaluate: () => {
          throw new Error('offline');
        },
      },
    ] as ArVisibilityProvider[]) {
      const resolver = new ArVisibilityResolver(provider);
      await resolver.update(scene());
      expect(state(resolver)).toBe('unknown');
    }
    const resolver = new ArVisibilityResolver(clear);
    const duplicate = scene();
    duplicate.objects = [...duplicate.objects, ...duplicate.objects];
    await resolver.update(duplicate);
    expect(state(resolver, duplicate)).toBe('unknown');
    await resolver.update({ ...scene(), referenceFrame: undefined });
    expect(state(resolver)).toBe('unknown');
  });
});

describe('example mesh provider', () => {
  it('uses real wall intersections, camera motion, and explicit geometry coverage', async () => {
    const geometry = new BoxGeometry(20, 20, 1);
    const material = new MeshBasicMaterial({ side: DoubleSide });
    const wall = new Mesh(geometry, material);
    wall.position.set(0, 10, -20);
    const provider = createMeshVisibilityProvider({
      referenceFrame: 'test',
      occluders: [wall],
      hasCoverage: (_, target) => target[1] < 80,
    });
    expect((await evaluate(provider, [0, 0, 10], [0, 10, 10]))[0]!.state).toBe('visible');
    expect((await evaluate(provider, [0, 0, 10], [0, 40, 10]))[0]!.state).toBe('occluded');
    expect((await evaluate(provider, [0, 0, 40], [0, 40, 40]))[0]!.state).toBe('visible');
    expect((await evaluate(provider, [0, 0, 40], [0, 100, 40]))[0]!.state).toBe('unknown');
    geometry.dispose();
    material.dispose();
  });
});
