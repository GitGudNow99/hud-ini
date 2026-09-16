# Terrain visibility integration

Use `@gitgudnow99/hud-ini/terrain` to classify AR anchors against your terrain data while keeping your application's renderer, terrain source and transport independent of hud-ini.

Install the [hud-ini npm package](https://www.npmjs.com/package/@gitgudnow99/hud-ini) with `npm install @gitgudnow99/hud-ini`. The terrain entry point is included in the package. See the [installation guide](../README.md#installation) for requirements.

## Start with a height grid

The built-in provider consumes resident height samples. It has no runtime dependencies and performs no downloads. Your application owns terrain loading, licensing, credentials and geographic conversion.

```ts
import { ArVisibilityResolver, createHeightfieldProvider } from '@gitgudnow99/hud-ini/terrain';
import type { HudArScene, HudFrame } from '@gitgudnow99/hud-ini';

const provider = createHeightfieldProvider({
  referenceFrame: 'site-enu-v1',
  origin: [-10, 0],
  columns: 3,
  rows: 5,
  cellSizeM: 10,
  heights: new Float32Array([0, 0, 0, 0, 0, 0, 8, 8, 8, 0, 0, 0, 0, 0, 0]),
});
const visibility = new ArVisibilityResolver(provider, { maxAgeS: 1 });

// Call when you have a new calibrated camera/object snapshot.
function onCameraSnapshot(scene: HudArScene, displayTime: number) {
  // scene.referenceFrame must be 'site-enu-v1'.
  void visibility.update(scene, displayTime);
}

// Call on each display update, including during a telemetry outage.
function withVisibility(frame: HudFrame): HudFrame {
  return frame.ar ? { ...frame, ar: visibility.apply(frame.ar, frame.time) } : frame;
}

// Pass withVisibility(frame) to HudIni, your web component, or renderHud().
// Call visibility.destroy() when this view is removed.
```

In this grid, a camera at `[0, 0, 2]` looking towards an anchor at `[0, 40, 2]` encounters an 8 m ridge. Raising both positions above the ridge produces a clear sampled ray. The [heightfield example](../examples/heightfield.ts) contains a larger synthetic ridge with known missing coverage and an executable static-snapshot helper.

For a static render, `await visibility.update(scene, time)` before `visibility.apply(scene, time)`. For live video, keep rendering while the request runs. Never await terrain services in the Canvas drawing callback. Schedule evaluations at a cadence your source can complete; starting another evaluation cancels its predecessor.

## Coordinate and timing contract

| Input            | Contract                                                                                                            |
| ---------------- | ------------------------------------------------------------------------------------------------------------------- |
| World positions  | Metres in local east, north, up order.                                                                              |
| `referenceFrame` | Nonempty application-defined identity for the shared origin and vertical datum. Both scene and provider must agree. |
| Grid origin      | East/north coordinates of sample column 0, row 0.                                                                   |
| Sample order     | East increases across columns; north increases across rows.                                                         |
| Sample heights   | Up in the same vertical datum as the camera and AR objects.                                                         |
| Camera           | Optical centre of the displayed camera, including mounting and gimbal offsets.                                      |
| Projection       | The actual displayed view/projection, including crop, aspect, pose and zoom, in hud-ini's OpenGL matrix convention. |
| Times            | Seconds in the same clock as `HudFrame.time`. Camera and object timestamps describe source observations.            |

Do not mix ellipsoid height, sea-level height, home-relative altitude and terrain-relative altitude. Convert geographic terrain, vehicle and object data into one local frame before calling the provider. Rebase large-area worlds in the host and change the reference identity when the origin changes. Local straight rays do not include Earth curvature or atmospheric refraction.

The resolver stores a copy of the evaluated observer and anchor positions. A result applies only to the same reference frame and exact positions while the source and result timestamps remain current. Panning or zooming from an unchanged optical centre can reuse a result. Moving either point makes it unknown until reevaluated. Dynamic geometry changes also require `invalidate()`.

Freshness is measured from the oldest camera/object input time, never from response arrival. `apply()` cannot refresh an old result. A delayed response, a future timestamp or a stopped telemetry stream cannot extend visibility validity. Match the renderer's `staleAfterS` to the resolver's `maxAgeS`; a shorter renderer timeout expires metadata earlier.

The resolver accepts at most 128 objects per evaluation, matching the Canvas scene limit. Give objects stable unique IDs. Missing responses and duplicate IDs remain unknown. Methods return new scene/object records without mutating caller data.

## Height-grid behavior and limits

The provider copies the grid on creation. It samples the straight camera-to-anchor segment, including both endpoints, and bilinearly interpolates each height. It does not skip the first part of a ray. A surface more than the tolerance above the ray establishes an obstruction. Contact within tolerance does not.

| Option         | Default          | Meaning                                             |
| -------------- | ---------------- | --------------------------------------------------- |
| `stepM`        | Half a grid cell | Maximum horizontal distance between ray samples.    |
| `toleranceM`   | 0.25 m           | Height excess required to count an intersection.    |
| `maxDistanceM` | 10,000 m         | Maximum three-dimensional ray length.               |
| `maxSamples`   | 4096             | Maximum samples per ray, including endpoints.       |
| `noData`       | None             | Optional sentinel in addition to nonfinite samples. |

`noData` belongs to the grid; the other options are the provider factory's second argument. Choose resolution and tolerance from your terrain source and camera/position uncertainty. A sample budget or range limit returns unknown; it never silently increases the sample spacing to claim a clear path.

Nonfinite samples, an out-of-grid segment or nodata needed for interpolation produce unknown unless another known segment establishes an obstruction. Interpolation never fills missing samples. A clear result means no obstruction was found at the configured sampling resolution. Thin objects between samples can be missed. A single-height surface cannot represent bridges, overhangs or tunnels. Use a mesh provider for those structures.

When terrain changes, create a new height-grid provider and resolver, and destroy the previous resolver. The copied grid is immutable. For a custom provider whose data changes in place, call `invalidate()` before reevaluation.

## Bring your own provider

Implement this interface for a mesh engine, worker or service:

```ts
import type { ArVisibilityProvider } from '@gitgudnow99/hud-ini/terrain';

// Your transport implements this contract. Keep its URL/authentication in your application.
export function terrainService(evaluate: ArVisibilityProvider['evaluate']): ArVisibilityProvider {
  return { evaluate };
}
```

`evaluate(request, signal)` receives a plain-data request:

```ts
{
  referenceFrame: 'site-enu-v1',
  at: 12,
  observer: [0, 0, 2],
  targets: [{ id: 'wp-3', position: [0, 40, 2] }],
}
```

Return an array, or a promise of an array, containing `{ id, state, reason? }` for each target. `state` is `visible`, `occluded` or `unknown`. Every answer refers to the supplied snapshot. Report unknown for unavailable tiles, unsupported reference frames or inconclusive geometry. The optional reason is diagnostic data, not an operator instruction.

The resolver supplies an `AbortSignal`, catches provider failures and discards superseded responses even if the provider ignores cancellation. Forward cancellation into your worker or HTTP request to avoid wasted work. Validate service response schemas and apply your own request deadlines at the transport boundary. The request contains no renderer objects and can be structured-cloned; send cancellation separately by request ID when using workers.

The [mesh provider example](../examples/three-visibility.ts) runs against caller-owned Three.js geometry. Its explicit `hasCoverage(observer, target)` callback prevents an empty raycast result from implying clear terrain when tiles are missing. Known intersections still establish occlusion. The example uses east/up/south engine coordinates and converts from the package's ENU input.

Copy the chosen example into your application; example files are not package entry points. The mesh and depth examples require your application's `three` dependency and `@types/three` for TypeScript. Neither dependency is added to the Canvas core or terrain module.

Only pass surfaces that block the camera view. Exclude observing-vehicle meshes, overlays, target-owned meshes and helpers. Set face sides intentionally for surfaces that must block from either direction. Raycasting depends on mesh material sides and near/far limits. This example does not perform solid-volume containment tests; detect a camera inside terrain or a building in the host. See the [Raycaster contract](https://threejs.org/docs/pages/Raycaster.html).

## Display policy

`HudArObject.visibility` contains `{ state, scope: 'anchor', at, reason? }`. The resolver supplies this field. A host can also supply it directly, but then owns snapshot association and freshness.

| Result                            | Default display                                                            |
| --------------------------------- | -------------------------------------------------------------------------- |
| Visible                           | Normal AR symbol and geometry.                                             |
| Occluded                          | Dimmed, dashed geometry and `OCC` label. Extended shapes use `ANCHOR OCC`. |
| Unknown or expired classification | Visible geometry with `LOS ?`.                                             |
| Metadata omitted                  | Original, unclassified display. This does not assert visibility.           |

`HudOptions.arOcclusion` accepts `dim` (default), `hide` or `off`. `hide` removes an entire anchor-occluded object; unknown objects remain visible. `off` ignores classification. The existing explicit `object.visible: false` filter wins under every policy. Camera/object expiry still removes stale geometry. With `arLabels: false`, status text is absent; use a host inspector if you need to distinguish unknown from unclassified without labels.

For point markers and most shapes, the anchor is `position`. For routes and corridors it is the last retained path point. Classification describes that anchor only. A corridor can have a hidden endpoint and a visible near section. Do not use its single anchor state as proof that the whole corridor is hidden.

## Partial occlusion in a host 3D renderer

Use a shared depth pass to hide only the part of a route or vehicle behind terrain. hud-ini exports `arGeometry(object)`, which returns the same anchor and metric line segments used by its Canvas renderer. The [depth example](../examples/three-depth.ts) converts those segments into Three.js [LineSegments](https://threejs.org/docs/pages/LineSegments.html) with [depth testing](https://threejs.org/docs/pages/Material.html#depthTest) enabled.

1. Add the example's wireframes to the same calibrated scene as the blocking terrain/buildings. Keep that group in the same world frame.
2. Render terrain depth before the AR lines, retaining the depth buffer. For a transparent 3D overlay on real video, render calibrated blocking geometry with color writes disabled but depth writes enabled.
3. Leave line depth testing enabled. The example disables line depth writes so AR lines do not become new terrain obstructions.
4. Disable duplicate Canvas geometry with `panels.ar: false`. If retaining only Canvas point markers, enable `arMarkers` and disable `arRoutes` and `arVolumes`.
5. Update/recreate wireframes when geometry changes and dispose their owned buffers/materials when removed. The example returns `dispose()`. Apply camera/object freshness in the host's 3D lifecycle too.

The example handles line geometry. The host owns 3D point symbols, labels, selection, picking and renderer lifecycle. Do not hide an entire wireframe from a single anchor classification when using partial depth occlusion. Ground-coincident lines need an explicit surface offset or depth-bias strategy selected for the terrain resolution.

The Canvas 2D renderer accepts no depth texture or per-pixel mask. The depth example integrates with the host's 3D rendering pass.

For real video, supply calibrated terrain/buildings or a registered depth source. An RGB frame or one rangefinder beam does not supply a scene-wide depth map. Align camera intrinsics, optical pose, video crop, time and depth encoding. Tile holes remain missing data; GPU depth testing alone does not classify them as unknown.

## Validate your integration

The package tests height interpolation, close obstructions, missing coverage, frame mismatches, sampling limits, moving anchors/cameras, expiry, cancellation and late responses. A browser test verifies that a wall hides the middle of a route while its two ends remain visible in the host depth example. The default vehicle lab uses anchor classification, not this partial-depth renderer.

Repeat these cases against your terrain source and displayed camera. Include tile replacement, camera movement, an object on the near side of a wall, one behind it, partial geometry, and missing terrain. The package's synthetic examples do not establish calibration accuracy for a future host project.
