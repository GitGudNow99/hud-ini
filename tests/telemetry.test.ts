import { describe, expect, it } from 'vitest';
import {
  readValue,
  readingStatus,
  sampleIndexAt,
  presetForMavType,
  telemetrySummary,
} from '../src/index.js';
import { MavlinkTelemetry, fromPtz } from '../src/adapters.js';
import type { MavlinkEnvelope, ServoOutputMapping } from '../src/adapters.js';

const packet = (message: string, fields: Record<string, number>, time = 4): MavlinkEnvelope => ({
  systemId: 42,
  componentId: 1,
  time,
  message,
  fields,
});
const rudder: ServoOutputMapping = {
  id: 'rudder',
  label: 'Rudder',
  kind: 'steering',
  unit: '°',
  min: -35,
  max: 35,
  channel: 1,
  pwmMin: 1000,
  pwmNeutral: 1500,
  pwmMax: 2000,
};

describe('readings', () => {
  it('preserves zero and distinguishes invalid, stale and future samples', () => {
    expect(readValue({ value: 0, at: 4 }, 4)).toBe(0);
    expect(readingStatus(undefined, 4)).toBe('missing');
    expect(readingStatus({ value: NaN, at: 4 }, 4)).toBe('invalid');
    expect(readingStatus({ value: 1, at: 4, valid: false }, 4)).toBe('invalid');
    expect(readingStatus({ value: 1, at: 2 }, 4)).toBe('stale');
    expect(readingStatus({ value: 1, at: 5 }, 4)).toBe('future');
  });
  it('replay selects only completed samples', () => {
    expect(sampleIndexAt([{ time: 1 }, { time: 2 }, { time: 3 }], 1.99)).toBe(0);
    expect(sampleIndexAt([{ time: 1 }], 0.9)).toBe(-1);
  });
});
describe('MAVLink isolation and units', () => {
  it('rejects other vehicles, components and old packets', () => {
    const feed = new MavlinkTelemetry({ systemId: 42 });
    expect(feed.ingest({ ...packet('ATTITUDE', { yaw: 1 }), systemId: 41 })).toBe(false);
    expect(feed.ingest({ ...packet('ATTITUDE', { yaw: 1 }), componentId: 2 })).toBe(false);
    feed.ingest(packet('ATTITUDE', { yaw: Math.PI / 2, roll: 0, pitch: 0.1 }, 5));
    expect(feed.ingest(packet('ATTITUDE', { yaw: 0 }, 4))).toBe(false);
    feed.ingest(packet('GLOBAL_POSITION_INT', { hdg: 18000 }, 4));
    expect(feed.snapshot(5).headingDeg?.value).toBe(90);
    expect(feed.snapshot(5).pitchDeg?.value).toBeCloseTo(5.72958);
  });
  it('keeps course distinct from heading and requires a depth datum', () => {
    const p = packet('GLOBAL_POSITION_INT', {
      hdg: 8000,
      vx: 0,
      vy: 450,
      vz: -25,
      alt: -8000,
      relative_alt: 12000,
    });
    const feed = new MavlinkTelemetry({ systemId: 42 });
    feed.ingest(p);
    const frame = feed.snapshot(4);
    expect(frame.headingDeg?.value).toBe(80);
    expect(frame.courseDeg?.value).toBe(90);
    expect(frame.groundSpeedMps?.value).toBe(4.5);
    expect(frame.climbMps?.value).toBe(0.25);
    expect(frame.altitudeM?.value).toBe(12);
    expect(frame.depthM).toBeUndefined();
    const sub = new MavlinkTelemetry({ systemId: 42, depthOriginM: 1 });
    sub.ingest(p);
    expect(sub.snapshot(4).depthM?.value).toBe(9);
  });
  it('preserves battery sentinels and stationary course as unavailable', () => {
    const feed = new MavlinkTelemetry({ systemId: 42 });
    feed.ingest(
      packet('SYS_STATUS', { battery_remaining: -1, voltage_battery: 65535, current_battery: -1 }),
    );
    feed.ingest(packet('GLOBAL_POSITION_INT', { vx: 0, vy: 0, hdg: 65535 }));
    const f = feed.snapshot(4);
    expect(readValue(f.batteryPct, 4)).toBeUndefined();
    expect(readValue(f.batteryVoltageV, 4)).toBeUndefined();
    expect(readValue(f.courseDeg, 4)).toBeUndefined();
    expect(readValue(f.groundSpeedMps, 4)).toBe(0);
  });
  it('uses ArduPilot family modes without interpreting PX4 custom_mode', () => {
    const feed = new MavlinkTelemetry({ systemId: 42 });
    feed.ingest(packet('HEARTBEAT', { type: 11, autopilot: 3, base_mode: 129, custom_mode: 10 }));
    expect(feed.snapshot(4).mode).toBe('AUTO');
    feed.ingest(
      packet('HEARTBEAT', { type: 11, autopilot: 12, base_mode: 129, custom_mode: 10 }, 5),
    );
    expect(feed.snapshot(5).mode).toBe('AUTOPILOT 12');
  });
});
describe('actuator calibration', () => {
  it('maps configured PWM to command, never to measured rudder feedback', () => {
    const feed = new MavlinkTelemetry({ systemId: 42, servoOutputs: [rudder] });
    feed.ingest(packet('SERVO_OUTPUT_RAW', { port: 0, servo1_raw: 1750 }));
    const output = feed.snapshot(4).outputs![0]!;
    expect(output.command?.value).toBe(17.5);
    expect(output.feedback).toBeUndefined();
    expect(telemetrySummary(feed.snapshot(4))).toContain(
      'Rudder command 17.5 °. Feedback unavailable',
    );
    expect(readValue(output.command, 6)).toBeUndefined();
  });
  it('does not invent assignments or clamp out of calibration outputs', () => {
    const feed = new MavlinkTelemetry({ systemId: 42, servoOutputs: [rudder] });
    feed.ingest(packet('SERVO_OUTPUT_RAW', { port: 1, servo1_raw: 1500 }));
    expect(feed.snapshot(4).outputs![0]!.command).toBeUndefined();
    feed.ingest(packet('SERVO_OUTPUT_RAW', { port: 0, servo1_raw: 2200 }));
    expect(readValue(feed.snapshot(4).outputs![0]!.command, 4)).toBeUndefined();
    expect(
      () => new MavlinkTelemetry({ systemId: 42, servoOutputs: [{ ...rudder, pwmNeutral: 1000 }] }),
    ).toThrow();
  });
});
it('maps all vehicle families and keeps unknown component types generic', () => {
  for (const [type, id] of [
    [2, 'multirotor'],
    [29, 'multirotor'],
    [3, 'helicopter'],
    [1, 'plane'],
    [47, 'vtol'],
    [10, 'rover'],
    [11, 'boat'],
    [12, 'submarine'],
    [5, 'tracker'],
    [7, 'blimp'],
    [30, 'ptz'],
    [41, 'generic'],
    [45, 'generic'],
  ] as const)
    expect(presetForMavType(type).id).toBe(id);
});
it('takes calibrated PTZ input and allows its clock to expire', () => {
  const f = fromPtz({ at: 1, panDeg: 0, tiltDeg: -10, zoomRatio: 2 }, 3);
  expect(f.panDeg?.value).toBe(0);
  expect(readValue(f.panDeg, 3)).toBeUndefined();
  expect(f.headingDeg).toBeUndefined();
});
