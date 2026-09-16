import type { HudArCamera, HudArObject, HudWorldPoint } from './types.js';

type ClipPoint = [number, number, number, number];
export type ArScreenPoint = readonly [number, number];
type Segment = readonly [HudWorldPoint, HudWorldPoint];
const finitePoint = (p: HudWorldPoint) => p.length === 3 && p.every(Number.isFinite);

function clipPoint(point: HudWorldPoint, camera: HudArCamera): ClipPoint | undefined {
  const m = camera.viewProjection;
  if (m.length !== 16 || !m.every(Number.isFinite) || !finitePoint(point)) return;
  const [x, y, z] = point;
  return [0, 1, 2, 3].map(
    (i) => m[i]! * x + m[i + 4]! * y + m[i + 8]! * z + m[i + 12]!,
  ) as ClipPoint;
}
const planes = (p: ClipPoint) => [
  p[3] + p[0],
  p[3] - p[0],
  p[3] + p[1],
  p[3] - p[1],
  p[3] + p[2],
  p[3] - p[2],
  p[3] - 1e-6,
];
const screen = (p: ClipPoint, width: number, height: number): ArScreenPoint => [
  ((p[0] / p[3] + 1) * width) / 2,
  ((1 - p[1] / p[3]) * height) / 2,
];

/** Project a visible world point into CSS pixels; reject points outside the camera frustum. */
export function projectArPoint(
  point: HudWorldPoint,
  camera: HudArCamera,
  width: number,
  height: number,
): ArScreenPoint | undefined {
  if (!(width > 0 && height > 0)) return;
  const p = clipPoint(point, camera);
  return p && planes(p).every((v) => v >= 0) ? screen(p, width, height) : undefined;
}

/** Clip in homogeneous space before dividing, including segments crossing the near plane. */
export function projectArSegment(
  a: HudWorldPoint,
  b: HudWorldPoint,
  camera: HudArCamera,
  width: number,
  height: number,
): readonly [ArScreenPoint, ArScreenPoint] | undefined {
  if (!(width > 0 && height > 0)) return;
  const ca = clipPoint(a, camera),
    cb = clipPoint(b, camera);
  if (!ca || !cb) return;
  let start = 0,
    end = 1;
  const pa = planes(ca),
    pb = planes(cb);
  for (let i = 0; i < pa.length; i++) {
    const da = pa[i]!,
      db = pb[i]!;
    if (da < 0 && db < 0) return;
    if (da < 0) start = Math.max(start, da / (da - db));
    if (db < 0) end = Math.min(end, da / (da - db));
  }
  if (start > end) return;
  const at = (t: number) => ca.map((v, i) => v + (cb[i]! - v) * t) as ClipPoint;
  return [screen(at(start), width, height), screen(at(end), width, height)];
}

/** Wireframe vertices remain in metres; perspective comes solely from the host camera. */
export function arGeometry(
  object: HudArObject,
): { anchor: HudWorldPoint; segments: Segment[] } | undefined {
  const segments: Segment[] = [];
  const edge = (a: HudWorldPoint, b: HudWorldPoint) => segments.push([a, b]);
  if ('points' in object) {
    const points = object.points.slice(0, 64);
    if (points.length < 2 || !points.every(finitePoint)) return;
    if (object.kind === 'route') points.slice(1).forEach((p, i) => edge(points[i]!, p));
    else {
      if (![object.widthM, object.heightM].every((v) => Number.isFinite(v) && v > 0)) return;
      let previous: HudWorldPoint[] | undefined;
      points.forEach((p, i) => {
        const a = points[Math.max(0, i - 1)]!,
          b = points[Math.min(points.length - 1, i + 1)]!;
        const distance = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const east = distance > 1e-6 ? (b[1] - a[1]) / distance : 1;
        const north = distance > 1e-6 ? -(b[0] - a[0]) / distance : 0;
        const corners: HudWorldPoint[] = [
          [-1, -1],
          [1, -1],
          [1, 1],
          [-1, 1],
        ].map(([side, up]) => [
          p[0] + (east * side! * object.widthM) / 2,
          p[1] + (north * side! * object.widthM) / 2,
          p[2] + (up! * object.heightM) / 2,
        ]);
        corners.forEach((p, j) => {
          edge(p, corners[(j + 1) % 4]!);
          if (previous) edge(previous[j]!, p);
        });
        previous = corners;
      });
    }
    return { anchor: points[points.length - 1]!, segments };
  }
  const p = object.position;
  if (!finitePoint(p)) return;
  if (object.kind === 'landing-zone') {
    if (!(Number.isFinite(object.radiusM) && object.radiusM > 0)) return;
    const at = (angle: number, r = object.radiusM): HudWorldPoint => [
      p[0] + Math.cos(angle) * r,
      p[1] + Math.sin(angle) * r,
      p[2],
    ];
    for (let i = 0; i < 48; i++) edge(at((i * Math.PI) / 24), at(((i + 1) * Math.PI) / 24));
    // The H is geometry on the landing plane, so it foreshortens with the ring.
    const v = (x: number, y: number): HudWorldPoint => [
      p[0] + x * object.radiusM,
      p[1] + y * object.radiusM,
      p[2],
    ];
    edge(v(-0.35, -0.45), v(-0.35, 0.45));
    edge(v(0.35, -0.45), v(0.35, 0.45));
    edge(v(-0.35, 0), v(0.35, 0));
  } else if (object.kind === 'vehicle' || object.kind === 'box') {
    if (
      !finitePoint(object.sizeM) ||
      !object.sizeM.every((v) => v > 0) ||
      !Number.isFinite(object.headingDeg ?? 0)
    )
      return;
    const yaw = ((object.headingDeg ?? 0) * Math.PI) / 180;
    const at = (x: number, y: number, z: number): HudWorldPoint => [
      p[0] + x * Math.cos(yaw) + y * Math.sin(yaw),
      p[1] - x * Math.sin(yaw) + y * Math.cos(yaw),
      p[2] + z,
    ];
    const [x, y, z] = object.sizeM.map((v) => v / 2) as [number, number, number];
    const corners = [-z, z].flatMap((up) => [
      at(-x, -y, up),
      at(x, -y, up),
      at(x, y, up),
      at(-x, y, up),
    ]);
    for (let i = 0; i < 4; i++) {
      edge(corners[i]!, corners[(i + 1) % 4]!);
      edge(corners[i + 4]!, corners[((i + 1) % 4) + 4]!);
      edge(corners[i]!, corners[i + 4]!);
    }
    if (object.kind === 'vehicle') {
      edge(at(0, -y * 0.4, z), at(0, y * 0.7, z));
      edge(at(-x * 0.4, y * 0.2, z), at(0, y * 0.7, z));
      edge(at(x * 0.4, y * 0.2, z), at(0, y * 0.7, z));
    }
  }
  return { anchor: p, segments };
}
