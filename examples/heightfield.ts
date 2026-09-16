import { createHeightfieldProvider, ArVisibilityResolver } from 'hud-ini/terrain';
import type { HudArScene } from 'hud-ini';

/** Package-owned synthetic ridge, with an explicit gap in terrain coverage to the east. */
export function ridgeProvider() {
  const columns = 41,
    rows = 61,
    cellSizeM = 5;
  const heights = Float32Array.from({ length: columns * rows }, (_, i) => {
    const east = (i % columns) * cellSizeM - 100;
    const north = Math.floor(i / columns) * cellSizeM;
    if (east > 45) return NaN;
    return Math.max(0, 22 - Math.abs(north - 120) * 1.1);
  });
  return createHeightfieldProvider({
    referenceFrame: 'example-enu-v1',
    origin: [-100, 0],
    columns,
    rows,
    cellSizeM,
    heights,
  });
}

/** For a static snapshot; a live host retains one resolver and calls update/apply separately. */
export async function evaluateRidgeScene(scene: HudArScene): Promise<HudArScene> {
  const resolver = new ArVisibilityResolver(ridgeProvider());
  try {
    await resolver.update(scene);
    return resolver.apply(scene, scene.camera.at);
  } finally {
    resolver.destroy();
  }
}
