import { BufferGeometry, Float32BufferAttribute, LineBasicMaterial, LineSegments } from 'three';
import { arGeometry } from '@gitgudnow99/hud-ini';
import type { HudArObject } from '@gitgudnow99/hud-ini';

/** Add to the host's terrain scene to depth-test each wireframe fragment. */
export function createArWireframe(object: HudArObject) {
  const shape = arGeometry(object);
  if (!shape?.segments.length || object.visible === false) return undefined;
  const positions = shape.segments.flatMap(([a, b]) =>
    [a, b].flatMap(([east, north, up]) => [east, up, -north]),
  );
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  const material = new LineBasicMaterial({
    color: object.color ?? '#49ded8',
    depthTest: true,
    depthWrite: false,
    toneMapped: false,
  });
  const lines = new LineSegments(geometry, material);
  // Terrain must populate depth first, including a depth-only terrain pass over real video.
  lines.renderOrder = 1;
  return {
    lines,
    dispose() {
      lines.removeFromParent();
      geometry.dispose();
      material.dispose();
    },
  };
}
