/**
 * Convert the Zurich Urban Micro Aerial Vehicle Dataset into a hud-ini replay scenario.
 *
 * The dataset records a tethered Fotokite over Zurich with a GoPro Hero 4 and a Pixhawk PX4
 * autopilot. Every aerial image carries a GPS row, so the recorded video and the recorded
 * telemetry share one clock. See docs/replay.md for provenance, licensing and limits.
 *
 * Usage:
 *   npx tsx tools/agz-replay.ts --dataset <AGZ directory> --out demo/public/replay
 */
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join, resolve } from 'node:path';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { Reading } from '../src/types.js';
import { roundScenario } from './replay-ar.js';
import type { ReplayFrame, ReplayScenario } from './replay-ar.js';

const run = promisify(execFile);

interface GpsRow {
  at: number;
  imgId: number;
  latDeg: number;
  lonDeg: number;
  altMslM: number;
  fixType: number;
  ephM: number;
  velNMps: number;
  velEMps: number;
  velDMps: number;
  satellites: number;
}

/**
 * Columns of OnboardPose.csv that carry data. Vel_x, Vel_y, Vel_z, Azimuth, Height and GPS_on
 * hold one constant value across all 135098 rows, so this tool reads velocity from GPS instead.
 */
interface PoseRow {
  at: number;
  qw: number;
  qx: number;
  qy: number;
  qz: number;
  yawRateRadS: number;
  tetherAngleRad: number;
  tetherRateRadS: number;
  tetherForceN: number;
}

interface BaroRow {
  at: number;
  altitudeM: number;
  temperatureC: number;
}

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]!;
  if (!key.startsWith('--')) throw new Error(`Expected a --flag, received ${key}`);
  args.set(key.slice(2), process.argv[i + 1] ?? '');
}
const dataset = args.get('dataset');
if (!dataset) throw new Error('Pass --dataset with the directory that contains "Log Files".');
const outDir = args.get('out') ?? 'demo/public/replay';
const id = args.get('id') ?? 'agz-zurich';
const fps = Number(args.get('fps') ?? 30);
/** Encoder quality and output width for the published recording. Lower crf keeps more detail. */
const crf = args.get('crf') ?? '23';
const scaleWidth = args.has('scale') ? Number(args.get('scale')) : undefined;
const requestedStart = args.has('start') ? Number(args.get('start')) : undefined;
const requestedCount = args.has('count') ? Number(args.get('count')) : undefined;

/** Read a dataset CSV, skipping the header row and the trailing empty fields it pads with. */
async function readCsv(name: string): Promise<string[][]> {
  const text = await readFile(join(dataset!, 'Log Files', `${name}.csv`), 'utf8');
  return text
    .split('\n')
    .slice(1)
    .map((line) => line.split(',').map((cell) => cell.trim()))
    .filter((cells) => cells[0] !== undefined && cells[0] !== '');
}

const num = (cells: string[], index: number) => Number(cells[index]);

const gps: GpsRow[] = (await readCsv('OnboardGPS')).map((c) => ({
  at: num(c, 0) / 1e6,
  imgId: num(c, 1),
  latDeg: num(c, 2),
  lonDeg: num(c, 3),
  altMslM: num(c, 4),
  fixType: num(c, 7),
  ephM: num(c, 8),
  velNMps: num(c, 10),
  velEMps: num(c, 11),
  velDMps: num(c, 12),
  satellites: num(c, 13),
}));

const pose: PoseRow[] = (await readCsv('OnboardPose')).map((c) => ({
  at: num(c, 0) / 1e6,
  qw: num(c, 14),
  qx: num(c, 15),
  qy: num(c, 16),
  qz: num(c, 17),
  yawRateRadS: num(c, 3),
  tetherAngleRad: num(c, 21),
  tetherRateRadS: num(c, 22),
  tetherForceN: num(c, 23),
}));

const baro: BaroRow[] = (await readCsv('BarometricPressure')).map((c) => ({
  at: num(c, 0) / 1e6,
  altitudeM: num(c, 2),
  temperatureC: num(c, 3),
}));

/**
 * Return the last sample recorded at or before the requested time. A reading that carries a
 * later timestamp than the frame reads as a clock mismatch, so never round forward.
 */
function latestIndex(rows: readonly { at: number }[], at: number): number {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (rows[mid]!.at <= at) low = mid + 1;
    else high = mid;
  }
  return Math.max(0, low - 1);
}
function latest<T extends { at: number }>(rows: readonly T[], at: number): T {
  return rows[latestIndex(rows, at)]!;
}

/** Convert a PX4 north-east-down body quaternion into degrees of roll, pitch and heading. */
function attitude(p: PoseRow) {
  const { qw: w, qx: x, qy: y, qz: z } = p;
  const sinPitch = Math.max(-1, Math.min(1, 2 * (w * y - z * x)));
  const deg = (radians: number) => (radians * 180) / Math.PI;
  return {
    rollDeg: deg(Math.atan2(2 * (w * x + y * z), 1 - 2 * (x * x + y * y))),
    pitchDeg: deg(Math.asin(sinPitch)),
    headingDeg: (deg(Math.atan2(2 * (w * z + x * y), 1 - 2 * (y * y + z * z))) + 360) % 360,
  };
}

const images = (await readdir(join(dataset, 'MAV Images')))
  .filter((name) => name.endsWith('.jpg'))
  .map((name) => Number(name.slice(0, -4)))
  .sort((a, b) => a - b);
if (!images.length) throw new Error('No images found under "MAV Images".');

const byImageId = new Map(gps.map((row) => [row.imgId, row]));
// Every stream starts at its own time. Begin once attitude and pressure both have a sample.
const logsReadyAt = Math.max(pose[0]!.at, baro[0]!.at);
const start = requestedStart ?? images[0]!;
const available = images.filter(
  (n) => n >= start && (byImageId.get(n)?.at ?? -Infinity) >= logsReadyAt,
);
const selected = available.slice(0, requestedCount ?? available.length);
if (!selected.length) throw new Error(`No images with complete log coverage at or after ${start}.`);

const epoch = byImageId.get(selected[0]!)!.at;
const reading = (value: number, at: number, now = Infinity): Reading => ({
  value,
  at: Math.min(at - epoch, now),
});
const wrapTo180 = (deg: number) => ((((deg + 180) % 360) + 360) % 360) - 180;

const baroDatum = latest(baro, epoch).altitudeM;

/**
 * Resample onto a constant rate grid.
 *
 * Recorded image intervals jitter around the nominal rate. Handing those intervals to the
 * concat demuxer as per-file durations loses sync, because it quantises them to its own
 * timebase and drops frames. Choosing the output times first, then picking the nearest
 * recorded image, keeps the media clock and the telemetry clock identical by construction.
 */
const gpsRows = selected.map((imgId) => byImageId.get(imgId)!);
const lastAt = gpsRows[gpsRows.length - 1]!.at;
const grid = Array.from({ length: Math.floor((lastAt - epoch) * fps) + 1 }, (_, k) => k / fps);
const nearestRow = (at: number) => {
  const i = latestIndex(gpsRows, at);
  const before = gpsRows[i]!;
  const after = gpsRows[Math.min(gpsRows.length - 1, i + 1)]!;
  return Math.abs(before.at - at) <= Math.abs(after.at - at) ? before : after;
};

let previous: { at: number; headingDeg: number } | undefined;
const frames: ReplayFrame[] = grid.map((gridTime) => {
  const g = nearestRow(epoch + gridTime);
  const p = latest(pose, g.at);
  const b = latest(baro, g.at);
  const { rollDeg, pitchDeg, headingDeg } = attitude(p);
  const groundSpeedMps = Math.hypot(g.velNMps, g.velEMps);
  const courseDeg = (Math.atan2(g.velEMps, g.velNMps) * 180) / Math.PI;
  const headingRate = previous
    ? wrapTo180(headingDeg - previous.headingDeg) / Math.max(1e-3, p.at - previous.at)
    : 0;
  previous = { at: p.at, headingDeg };
  return {
    time: gridTime,
    source: 'replay',
    label: 'FOTOKITE AGZ',
    mode: 'REPLAY',
    vehicleType: 2,
    headingDeg: reading(headingDeg, p.at, gridTime),
    headingRateDegS: reading(headingRate, p.at, gridTime),
    rollDeg: reading(rollDeg, p.at, gridTime),
    pitchDeg: reading(pitchDeg, p.at, gridTime),
    altitudeM: reading(b.altitudeM - baroDatum, b.at, gridTime),
    altitudeMslM: reading(g.altMslM, g.at, gridTime),
    altitudeDatum: 'BARO',
    groundSpeedMps: reading(groundSpeedMps, g.at, gridTime),
    climbMps: reading(-g.velDMps, g.at, gridTime),
    courseDeg: reading((courseDeg + 360) % 360, g.at, gridTime),
    latitudeDeg: reading(g.latDeg, g.at, gridTime),
    longitudeDeg: reading(g.lonDeg, g.at, gridTime),
    gpsFix: reading(g.fixType, g.at, gridTime),
    gpsSatellites: reading(g.satellites, g.at, gridTime),
    gpsHdop: reading(g.ephM, g.at, gridTime),
    // The gyro reports body yaw rate, which the frame keeps separate from heading change.
    turnRateDegS: reading((p.yawRateRadS * 180) / Math.PI, p.at, gridTime),
    outputs: [
      {
        id: 'tether-force',
        label: 'Tether',
        unit: 'N',
        min: 0,
        max: 5,
        kind: 'propulsion',
        feedback: reading(p.tetherForceN, p.at, gridTime),
      },
      {
        id: 'tether-angle',
        label: 'Tether angle',
        unit: '°',
        min: -60,
        max: 60,
        kind: 'axis',
        feedback: reading((p.tetherAngleRad * 180) / Math.PI, p.at, gridTime),
      },
      {
        id: 'tether-rate',
        label: 'Tether rate',
        unit: '°/s',
        min: -45,
        max: 45,
        kind: 'axis',
        feedback: reading((p.tetherRateRadS * 180) / Math.PI, p.at, gridTime),
      },
    ],
  };
});

await mkdir(outDir, { recursive: true });
const last = frames[frames.length - 1]!;
const scenario: ReplayScenario = {
  schema: 'hud-ini.replay.v2',
  id,
  preset: 'multirotor',
  mavType: 2,
  fps,
  video: `${id}.mp4`,
  duration: last.time,
  source:
    'Zurich Urban Micro Aerial Vehicle Dataset (Majdik, Till and Scaramuzza, IJRR 2017). ' +
    'Recorded telemetry from a Pixhawk PX4 autopilot and an onboard GPS receiver, ' +
    'time synchronized with the recorded GoPro Hero 4 images by the dataset authors.',
  camera: {
    verticalFovDeg: 62,
    width: scaleWidth ?? 1920,
    height: Math.round(((scaleWidth ?? 1920) * 1080) / 1920),
    nearM: 0.1,
    farM: 400,
    note: 'Lens distortion remains uncorrected in the video.',
  },
  frames,
};
await writeFile(join(outDir, `${id}.json`), JSON.stringify(roundScenario(scenario)));

// One entry per output frame at a constant interval, matching the resampled telemetry grid.
// The list holds absolute paths to the source images, so keep it out of the output
// directory. That directory ships with the website.
const listDir = await mkdtemp(join(tmpdir(), 'hud-ini-replay-'));
const listPath = join(listDir, `${id}.ffconcat`);
await writeFile(
  listPath,
  `ffconcat version 1.0\n` +
    grid
      .map((gridTime) => {
        const imgId = nearestRow(epoch + gridTime).imgId;
        const file = resolve(dataset, 'MAV Images', `${String(imgId).padStart(5, '0')}.jpg`);
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
  ...(scaleWidth ? ['-vf', `scale=${scaleWidth}:-2:flags=lanczos`] : []),
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

console.log(
  `Wrote ${frames.length} frames covering ${last.time.toFixed(1)} s ` +
    `(images ${selected[0]} to ${selected[selected.length - 1]}) to ${outDir}/${id}.json and ${id}.mp4`,
);
