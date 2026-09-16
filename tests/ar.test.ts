import { describe, expect, it } from 'vitest';
import { PerspectiveCamera, Vector3 } from 'three';
import { projectArPoint, projectArSegment } from '../src/index.js';
import type { HudArCamera } from '../src/index.js';
import { arGeometry } from '../src/ar.js';
import { arCamera } from '../demo/ar-scene.js';

describe('world-space AR', () => {
  it('matches the scene camera through attitude, zoom and aspect changes', () => {
    for (const [width, height, fov, pitch, roll] of [
      [1050, 700, 55, -0.2, 0.15],
      [390, 520, 35, 0.1, -0.1],
      [1600, 800, 80, 0, 0],
    ]) {
      const camera = new PerspectiveCamera(fov!, width! / height!, 0.1, 3000);
      camera.position.set(5, 20, -8);
      camera.rotation.set(pitch!, 0.25, roll!, 'YXZ');
      camera.updateMatrixWorld();
      const world = new Vector3(0, 0, -120).applyMatrix4(camera.matrixWorld);
      const reference = world.clone().project(camera);
      const actual = projectArPoint(
        [world.x, -world.z, world.y],
        arCamera(camera, 6),
        width!,
        height!,
      )!;
      expect(actual[0]).toBeCloseTo(((reference.x + 1) * width!) / 2, 8);
      expect(actual[1]).toBeCloseTo(((1 - reference.y) * height!) / 2, 8);
      const behind = new Vector3(0, 0, 10).applyMatrix4(camera.matrixWorld);
      expect(
        projectArPoint([behind.x, -behind.z, behind.y], arCamera(camera, 6), width!, height!),
      ).toBeUndefined();
    }
  });

  it('clips crossing segments at the actual camera frustum and rejects malformed matrices', () => {
    const camera = new PerspectiveCamera(55, 1, 0.1, 1000);
    const pose = arCamera(camera, 6);
    const crossing = projectArSegment([-1, -1, 0], [1, 10, 0], pose, 600, 600)!;
    expect(crossing).toBeDefined();
    expect(crossing.flat().every((n) => Number.isFinite(n) && n >= -1e-6 && n <= 600 + 1e-6)).toBe(
      true,
    );
    expect(projectArSegment([0, -1, 0], [1, -10, 0], pose, 600, 600)).toBeUndefined();
    expect(
      projectArPoint([0, 1, 0], { ...pose, viewProjection: [1, 2] }, 600, 600),
    ).toBeUndefined();
    expect(projectArPoint([NaN, 1, 0], pose, 600, 600)).toBeUndefined();
  });

  it('preserves metric landing planes, oriented bounds and perspective scale', () => {
    const base = { id: 'test', label: 'TEST', at: 6 };
    const landing = arGeometry({
      ...base,
      kind: 'landing-zone',
      position: [10, 100, 3],
      radiusM: 12,
    })!;
    expect(landing.segments.flat().every((point) => point[2] === 3)).toBe(true);
    const box = arGeometry({
      ...base,
      kind: 'box',
      position: [0, 100, 0],
      sizeM: [4, 10, 2],
      headingDeg: 90,
    })!;
    const xs = box.segments.flat().map((p) => p[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10);
    const pose: HudArCamera = arCamera(new PerspectiveCamera(55, 1, 0.1, 1000), 6);
    const near = projectArPoint([5, 50, 0], pose, 600, 600)!;
    const far = projectArPoint([5, 100, 0], pose, 600, 600)!;
    expect(near[0] - 300).toBeCloseTo(2 * (far[0] - 300));
    expect(
      arGeometry({
        ...base,
        kind: 'corridor',
        points: [
          [0, 10, 0],
          [0, 30, 0],
        ],
        widthM: 8,
        heightM: 4,
      })!.segments,
    ).toHaveLength(12);
    expect(
      arGeometry({ ...base, kind: 'box', position: [0, 1, 0], sizeM: [-1, 2, 3] }),
    ).toBeUndefined();
  });
});
