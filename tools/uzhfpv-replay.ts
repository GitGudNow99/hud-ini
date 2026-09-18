/**
 * Convert a UZH-FPV Drone Racing sequence into a hud-ini replay scenario.
 *
 * The dataset pairs a Snapdragon Flight fisheye camera and IMU with laser-tracked ground truth
 * at 500 Hz, so it exercises attitude, turn rate and augmented reality projection under motion
 * that synthetic fixtures do not reach. The dataset carries a CC BY-NC-SA 3.0 license, so keep
 * the sequence and every derived recording out of the repository. See docs/replay.md.
 *
 * Usage:
 *   npx tsx tools/uzhfpv-replay.ts \
 *     --sequence .datasets/uzh-fpv/outdoor_forward_1_snapdragon_with_gt \
 *     --calib .datasets/uzh-fpv/outdoor_forward_calib_snapdragon \
 *     --out .datasets/uzh-fpv/replay
 */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { HudArObject, HudWorldPoint, Reading } from '../src/types.js';
import { roundScenario } from './replay-ar.js';
import type { ReplayFrame, ReplayScenario } from './replay-ar.js';

const run = promisify(execFile);

type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]!;
  if (!key.startsWith('--')) throw new Error(`Expected a --flag, received ${key}`);
  args.set(key.slice(2), process.argv[i + 1] ?? '');
}
const sequence = args.get('sequence');
const calib = args.get('calib');
if (!sequence || !calib) throw new Error('Pass --sequence and --calib with unzipped directories.');
const outDir = args.get('out') ?? join(sequence, '..', 'replay');
const id = args.get('id') ?? sequence.split('/').filter(Boolean).pop()!;
/** Vertical field of view of the rectilinear image this tool renders from the fisheye source. */
const outFovDeg = Number(args.get('fov') ?? 70);
const outWidth = Number(args.get('width') ?? 1280);
const outHeight = Number(args.get('height') ?? 720);
/** Contrast applied to the recording only. The camera meters the sky and flattens the ground. */
const contrast = Number(args.get('contrast') ?? 1);
/** Constant output frame rate. The recorded images arrive near 28 Hz with jitter. */
const fps = Number(args.get('fps') ?? 30);
/** Encoder quality for the published recording. A lower value keeps more detail. */
const crf = args.get('crf') ?? '20';
/**
 * Seconds of ground truth to drop from the start. Coverage opens while the vehicle still sits
 * on the calibration board being handled, where the pose carries the least support.
 */
const skipS = Number(args.get('skip') ?? 0);

// Vector and matrix helpers. Matrices are row-major triples of row vectors.
const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const scale = (a: Vec3, k: number): Vec3 => [a[0] * k, a[1] * k, a[2] * k];
const norm = (a: Vec3) => Math.hypot(a[0], a[1], a[2]);
const unit = (a: Vec3): Vec3 => scale(a, 1 / Math.max(1e-12, norm(a)));
const apply = (m: Mat3, v: Vec3): Vec3 => [dot(m[0], v), dot(m[1], v), dot(m[2], v)];
const transpose = (m: Mat3): Mat3 => [
  [m[0][0], m[1][0], m[2][0]],
  [m[0][1], m[1][1], m[2][1]],
  [m[0][2], m[1][2], m[2][2]],
];
const multiply = (a: Mat3, b: Mat3): Mat3 => {
  const bt = transpose(b);
  return [
    [dot(a[0], bt[0]), dot(a[0], bt[1]), dot(a[0], bt[2])],
    [dot(a[1], bt[0]), dot(a[1], bt[1]), dot(a[1], bt[2])],
    [dot(a[2], bt[0]), dot(a[2], bt[1]), dot(a[2], bt[2])],
  ];
};

/** Build a rotation matrix from a quaternion given in the dataset's x, y, z, w order. */
function rotationFromQuaternion(x: number, y: number, z: number, w: number): Mat3 {
  return [
    [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
    [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
    [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
  ];
}

/**
 * Read the values this tool needs from a Kalibr camera chain file. The file holds one flat
 * mapping per camera, so a targeted reader avoids a YAML dependency.
 */
async function readCam0(path: string) {
  const text = await readFile(path, 'utf8');
  const block = text.slice(text.indexOf('cam0:'), text.indexOf('cam1:') + 1 || undefined);
  const numbers = (source: string) => source.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/gi)!.map(Number);
  const rows = [...block.matchAll(/^\s*-\s*\[([^\]]*)\]/gm)].map((m) => numbers(m[1]!));
  if (rows.length < 4) throw new Error(`No T_cam_imu matrix found in ${path}`);
  const intrinsics = numbers(/intrinsics:\s*\[([^\]]*)\]/.exec(block)![1]!);
  const resolution = numbers(/resolution:\s*\[([^\]]*)\]/.exec(block)![1]!);
  const timeshift = Number(/timeshift_cam_imu:\s*(\S+)/.exec(block)![1]);
  return {
    rotationCamFromImu: rows.slice(0, 3).map((r) => r.slice(0, 3)) as Mat3,
    focal: [intrinsics[0]!, intrinsics[1]!] as [number, number],
    principal: [intrinsics[2]!, intrinsics[3]!] as [number, number],
    width: resolution[0]!,
    height: resolution[1]!,
    timeshift,
  };
}

const rowsOf = async (path: string) =>
  (await readFile(path, 'utf8'))
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'))
    .map((line) => line.trim().split(/\s+/));

const cam = await readCam0(
  join(
    calib,
    (await readdir(calib)).find((n) => n.startsWith('camchain-imucam'))!,
  ),
);

const truth = (await rowsOf(join(sequence, 'groundtruth.txt'))).map((c) => ({
  at: Number(c[0]),
  position: [Number(c[1]), Number(c[2]), Number(c[3])] as Vec3,
  rotation: rotationFromQuaternion(Number(c[4]), Number(c[5]), Number(c[6]), Number(c[7])),
}));
const imu = (await rowsOf(join(sequence, 'imu.txt'))).map((c) => ({
  at: Number(c[1]),
  accel: [Number(c[5]), Number(c[6]), Number(c[7])] as Vec3,
}));
const pictures = (await rowsOf(join(sequence, 'left_images.txt'))).map((c) => ({
  at: Number(c[1]),
  file: c[2]!,
}));
if (!truth.length) throw new Error('groundtruth.txt holds no samples.');

/**
 * The laser tracker defines an arbitrary world frame, so recover which way is up by averaging
 * the world-frame specific force. Level flight leaves gravity as the dominant term.
 */
const covered = imu.filter((s) => s.at >= truth[0]!.at && s.at <= truth[truth.length - 1]!.at);
let upward: Vec3 = [0, 0, 0];
for (const sample of covered) {
  const pose = truth[Math.min(truth.length - 1, indexAt(truth, sample.at))]!;
  const world = apply(pose.rotation, sample.accel);
  upward = [upward[0] + world[0], upward[1] + world[1], upward[2] + world[2]];
}
const up = unit(scale(upward, 1 / Math.max(1, covered.length)));
// East and north stay arbitrary because a laser tracker frame carries no compass reference.
const seed: Vec3 = Math.abs(up[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
const north = unit(sub(seed, scale(up, dot(seed, up))));
const east = unit(cross(north, up));
const rotationEnuFromWorld: Mat3 = [east, north, up];

/** Index of the last sample recorded at or before the requested time. */
function indexAt(rows: readonly { at: number }[], at: number): number {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (rows[mid]!.at <= at) low = mid + 1;
    else high = mid;
  }
  return Math.max(0, low - 1);
}

const origin = truth[0]!.position;
const enuPosition = (p: Vec3): Vec3 => apply(rotationEnuFromWorld, sub(p, origin));
const enuRotation = (r: Mat3): Mat3 => multiply(rotationEnuFromWorld, r);

/** Sample ground truth at a time inside its coverage, reported in the local ENU frame. */
function poseAt(at: number) {
  const pose = truth[indexAt(truth, at)]!;
  return {
    at: pose.at,
    position: enuPosition(pose.position),
    rotation: enuRotation(pose.rotation),
  };
}

/**
 * Report attitude for a forward-left-up body frame. The Snapdragon IMU carries that convention,
 * confirmed by the camera chain: the forward camera's optical axis follows the IMU x axis.
 */
function attitude(rotation: Mat3) {
  const forward: Vec3 = [rotation[0][0], rotation[1][0], rotation[2][0]];
  const left: Vec3 = [rotation[0][1], rotation[1][1], rotation[2][1]];
  const bodyUp: Vec3 = [rotation[0][2], rotation[1][2], rotation[2][2]];
  const deg = (radians: number) => (radians * 180) / Math.PI;
  return {
    headingDeg: (deg(Math.atan2(forward[0], forward[1])) + 360) % 360,
    pitchDeg: deg(Math.asin(Math.max(-1, Math.min(1, forward[2])))),
    rollDeg: deg(Math.atan2(left[2], bodyUp[2])),
  };
}

const rotationImuFromCam = transpose(cam.rotationCamFromImu);
const nearM = 0.1;
const farM = 400;

/** Convert a rotation matrix into an x, y, z, w quaternion, which is seven numbers lighter. */
function quaternionFromRotation(m: Mat3): [number, number, number, number] {
  const trace = m[0][0] + m[1][1] + m[2][2];
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    return [(m[2][1] - m[1][2]) / s, (m[0][2] - m[2][0]) / s, (m[1][0] - m[0][1]) / s, s / 4];
  }
  if (m[0][0] > m[1][1] && m[0][0] > m[2][2]) {
    const s = Math.sqrt(1 + m[0][0] - m[1][1] - m[2][2]) * 2;
    return [s / 4, (m[0][1] + m[1][0]) / s, (m[0][2] + m[2][0]) / s, (m[2][1] - m[1][2]) / s];
  }
  if (m[1][1] > m[2][2]) {
    const s = Math.sqrt(1 + m[1][1] - m[0][0] - m[2][2]) * 2;
    return [(m[0][1] + m[1][0]) / s, s / 4, (m[1][2] + m[2][1]) / s, (m[0][2] - m[2][0]) / s];
  }
  const s = Math.sqrt(1 + m[2][2] - m[0][0] - m[1][1]) * 2;
  return [(m[0][2] + m[2][0]) / s, (m[1][2] + m[2][1]) / s, s / 4, (m[1][0] - m[0][1]) / s];
}

// Keep the images whose ground truth exists once the camera clock is aligned with the IMU clock.
const first = truth[0]!.at;
const last = truth[truth.length - 1]!.at;
const selected = pictures.filter((p) => {
  const at = p.at + cam.timeshift;
  return at >= first && at <= last;
});
if (selected.length < 2) throw new Error('No images fall inside the ground truth coverage.');
const epoch = selected[0]!.at + cam.timeshift + skipS;
if (epoch >= selected[selected.length - 1]!.at)
  throw new Error('--skip covers the whole sequence.');

// A route drawn along the flown path gives the projection a visible reference in the scene.
const routePoints: HudWorldPoint[] = Array.from({ length: 64 }, (_, i) => {
  const pose = truth[Math.round((i * (truth.length - 1)) / 63)]!;
  return enuPosition(pose.position) as HudWorldPoint;
});
const homePoint = enuPosition(truth[0]!.position) as HudWorldPoint;

/**
 * Resample onto a constant rate grid.
 *
 * The recorded images arrive near 28 Hz with jitter. Handing those intervals to the concat
 * demuxer as per-file durations loses sync, because it quantises them to its own timebase and
 * drops frames, which drifts the picture seconds away from the telemetry. Choosing the output
 * times first, then picking the nearest image and sampling the pose at that same instant, keeps
 * the media clock and the telemetry clock identical by construction.
 */
const grid = Array.from(
  { length: Math.floor((selected[selected.length - 1]!.at - epoch) * fps) + 1 },
  (_, k) => k / fps,
);
const nearestPicture = (at: number) => {
  const i = indexAt(selected, at);
  const after = selected[Math.min(selected.length - 1, i + 1)]!;
  const before = selected[i]!;
  return Math.abs(before.at - at) <= Math.abs(after.at - at) ? before : after;
};

const velocityWindow = 0.05;
let previousHeading: { at: number; headingDeg: number } | undefined;
const frames: ReplayFrame[] = grid.map((time) => {
  const at = epoch + time;
  const pose = poseAt(at);
  const before = poseAt(Math.max(first, at - velocityWindow));
  const after = poseAt(Math.min(last, at + velocityWindow));
  const span = Math.max(1e-3, after.at - before.at);
  const velocity: Vec3 = scale(sub(after.position, before.position), 1 / span);
  const { headingDeg, pitchDeg, rollDeg } = attitude(pose.rotation);
  const wrap = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;
  const headingRate = previousHeading
    ? wrap(headingDeg - previousHeading.headingDeg) /
      Math.max(1e-3, pose.at - previousHeading.at + 1e-9)
    : 0;
  previousHeading = { at: pose.at, headingDeg };
  const reading = (value: number): Reading => ({ value, at: Math.min(time, pose.at - epoch) });
  return {
    time,
    source: 'replay',
    // The identity panel reserves a short field, so drop the sensor and ground truth suffix.
    label: id
      .replace(/_(snapdragon|davis).*$/, '')
      .replace(/_/g, ' ')
      .toUpperCase(),
    mode: 'REPLAY',
    vehicleType: 2,
    headingDeg: reading(headingDeg),
    headingRateDegS: reading(headingRate),
    rollDeg: reading(rollDeg),
    pitchDeg: reading(pitchDeg),
    altitudeM: reading(pose.position[2]),
    altitudeDatum: 'TRACKER',
    groundSpeedMps: reading(Math.hypot(velocity[0], velocity[1])),
    climbMps: reading(velocity[2]),
    courseDeg: reading(((Math.atan2(velocity[0], velocity[1]) * 180) / Math.PI + 360) % 360),
    turnRateDegS: reading(headingRate),
    // The scene is fixed, so the scenario keeps it once and each frame carries only a pose.
    pose: {
      position: pose.position,
      rotation: quaternionFromRotation(multiply(pose.rotation, rotationImuFromCam)),
    },
  };
});

await mkdir(outDir, { recursive: true });
const objects: HudArObject[] = [
  { id: 'route', label: 'FLOWN PATH', kind: 'route', at: 0, points: routePoints },
  { id: 'home', label: 'START', kind: 'home', at: 0, position: homePoint },
  { id: 'pad', label: 'PAD', kind: 'landing-zone', at: 0, position: homePoint, radiusM: 2 },
];
const scenario: ReplayScenario = {
  schema: 'hud-ini.replay.v2',
  id,
  preset: 'multirotor',
  mavType: 2,
  video: `${id}.mp4`,
  fps,
  duration: frames[frames.length - 1]!.time,
  // Absolute dataset seconds for frame time zero, so other tools can align the raw logs.
  epochS: epoch,
  source:
    'UZH-FPV Drone Racing Dataset (Delmerico, Cieslewski, Rebecq, Faessler and Scaramuzza, ' +
    'ICRA 2019), CC BY-NC-SA 3.0. Laser-tracked ground truth at 500 Hz with Kalibr calibration. ' +
    'East and north are arbitrary because a laser tracker frame carries no compass reference.',
  camera: {
    verticalFovDeg: outFovDeg,
    width: outWidth,
    height: outHeight,
    nearM,
    farM,
    note: 'Rectified from the equidistant fisheye source to a rectilinear image.',
  },
  scene: { referenceFrame: `uzh-fpv:${id}`, objects },
  frames,
};
await writeFile(join(outDir, `${id}.json`), JSON.stringify(roundScenario(scenario)));

// Rectify the fisheye frames and hold each one for its recorded interval.
// The source follows the equidistant model, where radius equals focal length times angle.
// Using the pinhole relation here understates the field of view and misplaces every pixel.
const inFovH = ((2 * (cam.width / 2)) / cam.focal[0]! / Math.PI) * 180;
const inFovV = ((2 * (cam.height / 2)) / cam.focal[1]! / Math.PI) * 180;
const outFovH =
  (2 * Math.atan((outWidth / outHeight) * Math.tan((outFovDeg * Math.PI) / 360)) * 180) / Math.PI;
// One entry per output frame at a constant interval, matching the resampled telemetry grid.
// The list holds absolute paths to the source images, so keep it out of the output
// directory. That directory ships with the website.
const listDir = await mkdtemp(join(tmpdir(), 'hud-ini-replay-'));
const listPath = join(listDir, `${id}.ffconcat`);
await writeFile(
  listPath,
  `ffconcat version 1.0\n` +
    grid
      .map((time) => {
        const file = resolve(sequence, nearestPicture(epoch + time).file);
        return `file '${file}'\nduration ${(1 / fps).toFixed(6)}\n`;
      })
      .join(''),
);
await run('ffmpeg', [
  '-y',
  '-safe',
  '0',
  '-f',
  'concat',
  '-i',
  listPath,
  '-vf',
  `v360=fisheye:flat:ih_fov=${inFovH.toFixed(3)}:iv_fov=${inFovV.toFixed(3)}:` +
    `h_fov=${outFovH.toFixed(3)}:v_fov=${outFovDeg.toFixed(3)}:w=${outWidth}:h=${outHeight}` +
    (contrast === 1 ? '' : `,eq=contrast=${contrast}`),
  '-r',
  String(fps),
  '-fps_mode',
  'cfr',
  '-video_track_timescale',
  '90000',
  '-c:v',
  'libx264',
  '-preset',
  'slow',
  '-crf',
  crf,
  '-pix_fmt',
  'yuv420p',
  '-movflags',
  '+faststart',
  join(outDir, `${id}.mp4`),
]);

await rm(listDir, { recursive: true, force: true });

const speeds = frames.map((f) => f.groundSpeedMps!.value);
console.log(
  `Wrote ${frames.length} frames covering ${scenario.duration.toFixed(1)} s to ${outDir}.\n` +
    `Ground speed ${Math.min(...speeds).toFixed(1)} to ${Math.max(...speeds).toFixed(1)} m/s. ` +
    `Source field of view ${inFovH.toFixed(0)} by ${inFovV.toFixed(0)} degrees, ` +
    `rectified to ${outFovH.toFixed(0)} by ${outFovDeg} degrees.`,
);
