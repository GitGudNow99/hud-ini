import { Raycaster, Vector3 } from 'three';
import type { Object3D } from 'three';
import type { ArVisibilityProvider } from '@gitgudnow99/hud-ini/terrain';
import type { HudWorldPoint } from '@gitgudnow99/hud-ini';

/** Example host adapter. This world uses x=east, y=up, z=south. Requires the host's Three.js. */
export function createMeshVisibilityProvider(options: {
  referenceFrame: string;
  /** Include only blocking surfaces. Exclude the observing vehicle, overlays and helpers. */
  occluders: readonly Object3D[];
  /** True only when the entire segment has loaded geometry coverage. */
  hasCoverage: (observer: HudWorldPoint, target: HudWorldPoint) => boolean;
  toleranceM?: number;
}): ArVisibilityProvider {
  const tolerance = options.toleranceM ?? 0.25;
  if (!options.referenceFrame.trim() || !Number.isFinite(tolerance) || tolerance < 0)
    throw new RangeError('Invalid mesh visibility reference or tolerance');
  const ray = new Raycaster();
  const origin = new Vector3();
  const direction = new Vector3();
  return {
    evaluate(request, signal) {
      for (const object of options.occluders) object.updateWorldMatrix(true, true);
      return request.targets.map(({ id, position }) => {
        if (signal.aborted) return { id, state: 'unknown', reason: 'aborted' };
        if (request.referenceFrame !== options.referenceFrame)
          return { id, state: 'unknown', reason: 'reference-frame-mismatch' };
        if (![...request.observer, ...position].every(Number.isFinite))
          return { id, state: 'unknown', reason: 'invalid-input' };
        origin.set(request.observer[0], request.observer[2], -request.observer[1]);
        direction.set(position[0], position[2], -position[1]).sub(origin);
        const distance = direction.length();
        if (!Number.isFinite(distance) || distance <= tolerance)
          return { id, state: 'unknown', reason: 'degenerate-ray' };
        ray.set(origin, direction.divideScalar(distance));
        ray.near = 0;
        ray.far = distance - tolerance;
        if (ray.intersectObjects([...options.occluders], true).length)
          return { id, state: 'occluded', reason: 'mesh-intersection' };
        return options.hasCoverage(request.observer, position)
          ? { id, state: 'visible' }
          : { id, state: 'unknown', reason: 'missing-geometry' };
      });
    },
  };
}
