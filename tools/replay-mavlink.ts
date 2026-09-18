/**
 * Re-encode a replay scenario as MAVLink 2 and rebuild its frames through MavlinkTelemetry.
 *
 * The dataset converters write HudFrame objects directly, which skips the adapter that real
 * installations use. This tool closes that gap: it serialises every sample as MAVLink, decodes
 * the bytes again, and lets the public adapter produce the frames. Panels that MAVLink cannot
 * carry, such as the AR scene, merge back afterwards.
 *
 * Rotor commands, stick positions and flight mode come from the recorded angular rates and
 * specific force, because no public dataset pairs camera imagery with logged motor telemetry.
 * The scenario names every such field under `derived`, and the tool refuses to invent battery
 * readings unless you ask for them with --demo-power.
 *
 * Usage:
 *   npx tsx tools/replay-mavlink.ts \
 *     --scenario .datasets/uzh-fpv/replay/outdoor_forward_1_snapdragon_with_gt.json \
 *     --imu .datasets/uzh-fpv/outdoor_forward_1_snapdragon_with_gt/imu.txt
 */
import { readFile, writeFile } from 'node:fs/promises';
import { MavLinkProtocolV2, minimal, common } from 'node-mavlink';
import { MavlinkTelemetry } from '../src/adapters.js';
import type { ServoOutputMapping } from '../src/adapters.js';
import type { HudFrame, StickInput } from '../src/types.js';
import { roundScenario } from './replay-ar.js';
import type { ReplayFrame, ReplayScenario } from './replay-ar.js';
import { decodeBytes } from './wire.js';

const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]!;
  if (!key.startsWith('--')) throw new Error(`Expected a --flag, received ${key}`);
  args.set(key.slice(2), process.argv[i + 1] ?? '');
}
const scenarioPath = args.get('scenario');
const imuPath = args.get('imu');
if (!scenarioPath) throw new Error('Pass --scenario with a converter output.');
const outPath = args.get('out') ?? scenarioPath.replace(/\.json$/, '-mavlink.json');
/** Synthesise a plausible battery discharge. Off by default, because no dataset records one. */
const demoPower = args.get('demo-power') === 'true';

const scenario = JSON.parse(await readFile(scenarioPath, 'utf8')) as ReplayScenario;
const frames = scenario.frames;
if (!frames.length) throw new Error('The scenario holds no frames.');

/** Recorded angular rate and specific force, expressed in the forward-left-up body frame. */
interface Inertial {
  at: number;
  gyro: [number, number, number];
  accel: [number, number, number];
}
let inertial: Inertial[] = [];
if (imuPath) {
  const epochShift = scenario.epochS;
  if (epochShift === undefined)
    throw new Error('The scenario has no epochS, so the raw log cannot be aligned.');
  const rows = (await readFile(imuPath, 'utf8'))
    .split('\n')
    .filter((line) => line.trim() && !line.startsWith('#'))
    .map((line) => line.trim().split(/\s+/).map(Number));
  // Columns: id, timestamp, angular velocity xyz, linear acceleration xyz.
  // The raw log runs on absolute dataset seconds and starts well before ground truth coverage.
  // Subtract the scenario epoch, never the log's own first sample, or the streams misalign.
  inertial = rows.map((c) => ({
    at: c[1]! - epochShift,
    gyro: [c[2]!, c[3]!, c[4]!],
    accel: [c[5]!, c[6]!, c[7]!],
  }));
}

const indexAt = (rows: readonly { at: number }[], at: number) => {
  let low = 0;
  let high = rows.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (rows[mid]!.at <= at) low = mid + 1;
    else high = mid;
  }
  return Math.max(0, low - 1);
};

/**
 * Resolve four rotor demands from the recorded rates with a standard X configuration mixer.
 *
 * Angular acceleration times inertia gives the torque each axis demands, and the body z
 * specific force gives the collective. Motors sit at front-right, front-left, rear-left and
 * rear-right, with the front-right and rear-left pair turning counterclockwise.
 */
const inertia: [number, number, number] = [0.0025, 0.0025, 0.0045];
const mass = 0.8;
function rotorDemands(at: number): [number, number, number, number] {
  if (!inertial.length) return [0.5, 0.5, 0.5, 0.5];
  const i = indexAt(inertial, at);
  const span = 0.02;
  const before = inertial[indexAt(inertial, Math.max(inertial[0]!.at, at - span))]!;
  const after = inertial[indexAt(inertial, at + span)]!;
  const dt = Math.max(1e-3, after.at - before.at);
  const alpha = [0, 1, 2].map((k) => (after.gyro[k]! - before.gyro[k]!) / dt);
  // Convert to the roll-right, pitch-up, yaw-right sense the mixer expects.
  const rollRight = inertia[0] * alpha[0]!;
  const pitchUp = -inertia[1] * alpha[1]!;
  const yawRight = -inertia[2] * alpha[2]!;
  const collective = Math.min(1, Math.max(0, (mass * inertial[i]!.accel[2]!) / (mass * 2 * 9.81)));
  const kr = 9,
    kp = 9,
    ky = 5;
  const mix = (roll: number, pitch: number, yaw: number) =>
    Math.min(
      1,
      Math.max(0, collective + roll * kr * rollRight + pitch * kp * pitchUp + yaw * ky * yawRight),
    );
  return [mix(-1, -1, 1), mix(1, -1, -1), mix(1, 1, 1), mix(-1, 1, -1)];
}

/**
 * Full-scale rate per axis, taken as the 98th percentile of the recorded magnitude. A fixed
 * guess leaves the sticks near centre, because this pilot never reaches a racing rate limit.
 */
const fullScale = [0, 1, 2].map((axis) => {
  const magnitudes = inertial.map((s) => Math.abs(s.gyro[axis]!)).sort((a, b) => a - b);
  return magnitudes.length ? Math.max(0.1, magnitudes[Math.floor(magnitudes.length * 0.98)]!) : 1;
});

/** Stick positions in an acrobatic mode track the demanded rates, so report the measured ones. */
function sticks(at: number, throttle: number): StickInput | undefined {
  if (!inertial.length) return undefined;
  const g = inertial[indexAt(inertial, at)]!.gyro;
  const clamp = (v: number, axis: number) => Math.min(1, Math.max(-1, v / fullScale[axis]!));
  return {
    at,
    label: 'DERIVED RATES',
    left: [clamp(-g[2]!, 2), throttle * 2 - 1],
    right: [clamp(g[0]!, 0), clamp(-g[1]!, 1)],
    leftLabel: 'YAW / THR',
    rightLabel: 'ROLL / PITCH',
  };
}

const rotorLabels = ['M1 FR', 'M2 FL', 'M3 RL', 'M4 RR'];
const positions: [number, number][] = [
  [0.72, -0.72],
  [-0.72, -0.72],
  [-0.72, 0.72],
  [0.72, 0.72],
];
const servoOutputs: ServoOutputMapping[] = rotorLabels.map((label, i) => ({
  id: `motor${i + 1}`,
  label,
  channel: i + 1,
  kind: 'propulsion',
  unit: '%',
  min: 0,
  max: 100,
  pwmMin: 1000,
  pwmMax: 2000,
  indicator: { position: positions[i]!, glyph: 'rotor', label: String(i + 1) },
}));

const protocol = new MavLinkProtocolV2(1, 1);
const packets: Buffer[] = [];
const times: number[] = [];
let sequence = 0;
const send = (message: Parameters<MavLinkProtocolV2['serialize']>[0], time: number) => {
  packets.push(protocol.serialize(message, sequence++ % 256));
  times.push(time);
};

let lastSecond = -1;
for (const frame of frames) {
  const t = frame.time;
  const value = (reading: HudFrame['rollDeg']) => reading?.value ?? 0;
  const demands = rotorDemands(t);
  const throttle = demands.reduce((a, b) => a + b, 0) / 4;

  if (Math.floor(t) !== lastSecond) {
    lastSecond = Math.floor(t);
    const heartbeat = new minimal.Heartbeat();
    Object.assign(heartbeat, {
      type: scenario.mavType,
      autopilot: 3,
      baseMode: 129,
      customMode: 0,
      systemStatus: 4,
      mavlinkVersion: 3,
    });
    send(heartbeat, t);

    const status = new common.SysStatus();
    // Declare only the sensors this recording actually carries.
    const present = 1 | 2 | (frame.gpsFix ? 32 : 0) | (frame.altitudeMslM ? 8 : 0);
    Object.assign(status, {
      onboardControlSensorsPresent: present,
      onboardControlSensorsEnabled: present,
      onboardControlSensorsHealth: present,
      voltageBattery: demoPower ? Math.round(16800 - 1400 * (t / scenario.duration)) : 65535,
      currentBattery: demoPower ? Math.round(1800 + 900 * throttle) : -1,
      batteryRemaining: demoPower ? Math.round(94 - 34 * (t / scenario.duration)) : -1,
    });
    send(status, t);
  }

  const attitude = new common.Attitude();
  const gyro = inertial.length ? inertial[indexAt(inertial, t)]!.gyro : [0, 0, 0];
  Object.assign(attitude, {
    timeBootMs: Math.round(t * 1000),
    roll: (value(frame.rollDeg) * Math.PI) / 180,
    pitch: (value(frame.pitchDeg) * Math.PI) / 180,
    yaw: (value(frame.headingDeg) * Math.PI) / 180,
    rollspeed: gyro[0]!,
    pitchspeed: -gyro[1]!,
    yawspeed: -gyro[2]!,
  });
  send(attitude, t);

  const vfr = new common.VfrHud();
  Object.assign(vfr, {
    airspeed: -1,
    groundspeed: value(frame.groundSpeedMps),
    heading: Math.round(value(frame.headingDeg)),
    throttle: Math.round(throttle * 100),
    alt: value(frame.altitudeM),
    climb: value(frame.climbMps),
  });
  send(vfr, t);

  const servos = new common.ServoOutputRaw();
  Object.assign(servos, { timeUsec: Math.round(t * 1e6), port: 0 });
  demands.forEach((demand, i) => {
    Object.assign(servos, { [`servo${i + 1}Raw`]: Math.round(1000 + demand * 1000) });
  });
  send(servos, t);
}

const wire = Buffer.concat(packets);
const decoded = await decodeBytes(wire);
if (decoded.length !== times.length)
  throw new Error(`MAVLink roundtrip lost packets: ${decoded.length} of ${times.length}`);
decoded.forEach((packet, i) => {
  packet.time = times[i]!;
});

const adapter = new MavlinkTelemetry({
  systemId: 1,
  servoOutputs,
  label: frames[0]!.label,
});
const rebuilt: ReplayFrame[] = [];
for (let i = 0; i < decoded.length; i++) {
  adapter.ingest(decoded[i]!);
  if (decoded[i + 1]?.time !== decoded[i]!.time) {
    const time = decoded[i]!.time;
    const snapshot = adapter.snapshot(time, 'replay');
    const origin = frames[rebuilt.length] ?? frames[frames.length - 1]!;
    const throttle = (snapshot.throttlePct?.value ?? 50) / 100;
    // MAVLink carries no camera pose and no stick telemetry, so restore them beside the frame.
    rebuilt.push({ ...snapshot, pose: origin.pose, controls: sticks(time, throttle) });
  }
}

const derived = [
  'outputs: rotor demands resolved from recorded angular acceleration and specific force',
  'throttlePct: mean of the four resolved rotor demands',
  'controls: stick positions taken from the recorded angular rates',
  'mode and armed state: asserted by the encoder, not recorded by the dataset',
  ...(demoPower ? ['batteryVoltageV, batteryCurrentA, batteryPct: synthesised for display'] : []),
];
await writeFile(
  outPath,
  JSON.stringify(
    roundScenario<ReplayScenario>({
      ...scenario,
      id: `${scenario.id}-mavlink`,
      pipeline: 'Encoded as MAVLink 2, decoded, and rebuilt through MavlinkTelemetry.',
      derived,
      frames: rebuilt,
    }),
  ),
);
console.log(
  `Encoded ${packets.length} MAVLink 2 packets and rebuilt ${rebuilt.length} frames.\n` +
    `Derived: ${derived.length} field groups. Battery ${demoPower ? 'synthesised' : 'left unavailable'}.\n` +
    `Wrote ${outPath}`,
);
