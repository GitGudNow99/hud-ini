import { describe, expect, it } from 'vitest';
import { common, MavLinkProtocolV2 } from 'node-mavlink';
import { MavlinkTelemetry } from '../src/adapters.js';
import type { MavlinkEnvelope } from '../src/adapters.js';
import { readValue } from '../src/index.js';
import { decodeBytes } from '../tools/wire.js';

const packet = (
  message: string,
  time: number,
  fields: Record<string, number>,
): MavlinkEnvelope => ({ systemId: 42, componentId: 1, message, time, fields });

describe('tape target and trend telemetry', () => {
  it('keeps desired heading separate from waypoint bearing and honors yaw references', async () => {
    const feed = new MavlinkTelemetry({ systemId: 42 });
    feed.ingest(packet('NAV_CONTROLLER_OUTPUT', 1, { nav_bearing: -10, target_bearing: 30 }));
    expect(feed.snapshot(1)).toMatchObject({
      targetHeadingDeg: { value: 350, at: 1 },
      targetBearingDeg: { value: 30, at: 1 },
    });
    const message = Object.assign(new common.PositionTargetLocalNed(), {
      coordinateFrame: 1,
      typeMask: 0,
      yaw: Math.PI / 6,
    });
    const [wire] = await decodeBytes(new MavLinkProtocolV2(42, 1).serialize(message, 0));
    feed.ingest({ ...wire!, time: 2 });
    expect(readValue(feed.snapshot(2).targetHeadingDeg, 2)).toBeCloseTo(30);
    feed.ingest(packet('NAV_CONTROLLER_OUTPUT', 1.5, { nav_bearing: 90 }));
    expect(feed.snapshot(2).targetHeadingDeg!.at).toBe(2);
    for (const [time, coordinate_frame, type_mask] of [
      [3, 8, 0],
      [4, 1, 1024],
    ]) {
      feed.ingest({
        ...wire!,
        time: time!,
        fields: { ...wire!.fields, coordinate_frame: coordinate_frame!, type_mask: type_mask! },
      });
      expect(readValue(feed.snapshot(time!).targetHeadingDeg, time!)).toBeUndefined();
    }
    feed.ingest(
      packet('POSITION_TARGET_GLOBAL_INT', 5, {
        coordinate_frame: 3,
        type_mask: 0,
        yaw: -Math.PI / 2,
      }),
    );
    expect(readValue(feed.snapshot(5).targetHeadingDeg, 5)).toBe(270);
    expect(readValue(feed.snapshot(7).targetHeadingDeg, 7)).toBeUndefined();
  });

  it('converts body angular rates to heading rate and suppresses the vertical singularity', () => {
    const feed = new MavlinkTelemetry({ systemId: 42 });
    feed.ingest(
      packet('ATTITUDE', 1, {
        roll: Math.PI / 6,
        pitch: Math.PI / 3,
        pitchspeed: 0.2,
        yawspeed: 0.1,
      }),
    );
    expect(readValue(feed.snapshot(1).headingRateDegS, 1)).toBeCloseTo(21.38307362);
    expect(readValue(feed.snapshot(1).turnRateDegS, 1)).toBeCloseTo(5.72957795);
    feed.ingest(packet('ATTITUDE', 2, { roll: 0, pitch: 0, pitchspeed: 0, yawspeed: -0.1 }));
    expect(readValue(feed.snapshot(2).headingRateDegS, 2)).toBeCloseTo(-5.72957795);
    feed.ingest(
      packet('ATTITUDE', 3, { roll: 0, pitch: Math.PI / 2, pitchspeed: 0, yawspeed: 0.1 }),
    );
    expect(readValue(feed.snapshot(3).headingRateDegS, 3)).toBeUndefined();
    feed.ingest(packet('ATTITUDE', 4, { yawspeed: 0.1 }));
    expect(readValue(feed.snapshot(4).headingRateDegS, 4)).toBeUndefined();
  });

  it('decodes reported targets, respects masks and retains altitude references', async () => {
    const feed = new MavlinkTelemetry({ systemId: 42 });
    const message = Object.assign(new common.PositionTargetGlobalInt(), {
      coordinateFrame: 0,
      typeMask: 0,
      alt: 160,
      vx: 3,
      vy: 4,
    });
    const [wire] = await decodeBytes(new MavLinkProtocolV2(42, 1).serialize(message, 0));
    feed.ingest({ ...wire!, time: 2 });
    expect(feed.snapshot(2)).toMatchObject({
      targetAltitudeM: { value: 160, at: 2 },
      targetAltitudeDatum: 'MSL',
      targetGroundSpeedMps: { value: 5, at: 2 },
    });
    expect(readValue(feed.snapshot(4).targetAltitudeM, 4)).toBeUndefined();
    feed.ingest({ ...wire!, time: 3, fields: { ...wire!.fields, type_mask: 4 | 8 } });
    expect(readValue(feed.snapshot(3).targetAltitudeM, 3)).toBeUndefined();
    expect(readValue(feed.snapshot(3).targetGroundSpeedMps, 3)).toBeUndefined();
    feed.ingest({ ...wire!, time: 4, fields: { ...wire!.fields, coordinate_frame: 3 } });
    expect(feed.snapshot(4).targetAltitudeDatum).toBe('REL HOME');
    expect(feed.ingest({ ...wire!, time: 5, componentId: 100 })).toBe(false);
    expect(feed.ingest({ ...wire!, time: 5, message: 'SET_POSITION_TARGET_GLOBAL_INT' })).toBe(
      false,
    );
  });

  it('keeps local origins separate and does not change the datum on late cross-message updates', () => {
    const feed = new MavlinkTelemetry({ systemId: 42 });
    feed.ingest(
      packet('POSITION_TARGET_GLOBAL_INT', 5, {
        coordinate_frame: 3,
        type_mask: 0,
        alt: 60,
        vx: 5,
        vy: 0,
      }),
    );
    feed.ingest(
      packet('POSITION_TARGET_LOCAL_NED', 4, {
        coordinate_frame: 1,
        type_mask: 0,
        z: -20,
        vx: 1,
        vy: 0,
      }),
    );
    expect(feed.snapshot(5)).toMatchObject({
      targetAltitudeDatum: 'REL HOME',
      targetAltitudeM: { value: 60, at: 5 },
    });
    feed.ingest(
      packet('POSITION_TARGET_LOCAL_NED', 6, {
        coordinate_frame: 1,
        type_mask: 0,
        z: -20,
        vx: 0,
        vy: 0,
      }),
    );
    expect(feed.snapshot(6)).toMatchObject({
      targetAltitudeDatum: 'LOCAL ORIGIN',
      targetAltitudeM: { value: 20 },
      targetGroundSpeedMps: { value: 0 },
    });
    feed.ingest(
      packet('POSITION_TARGET_LOCAL_NED', 7, {
        coordinate_frame: 99,
        type_mask: 0,
        z: -20,
        vx: 1,
        vy: 0,
      }),
    );
    expect(readValue(feed.snapshot(7).targetAltitudeM, 7)).toBeUndefined();
    expect(readValue(feed.snapshot(7).targetGroundSpeedMps, 7)).toBeUndefined();
  });

  it('handles ArduPlane airspeed-error units and requires a recent airspeed sample', () => {
    for (const autopilot of [3, 12]) {
      const feed = new MavlinkTelemetry({ systemId: 42 });
      feed.ingest(packet('HEARTBEAT', 1, { type: 1, autopilot }));
      feed.ingest(packet('VFR_HUD', 2, { airspeed: 20 }));
      feed.ingest(packet('NAV_CONTROLLER_OUTPUT', 2.1, { aspd_error: autopilot === 3 ? 500 : 5 }));
      expect(readValue(feed.snapshot(2.1).targetAirSpeedMps, 2.1)).toBe(25);
      expect(feed.snapshot(2.1).targetAirSpeedMps!.at).toBe(2);
      feed.ingest(packet('NAV_CONTROLLER_OUTPUT', 3, { aspd_error: 5 }));
      expect(readValue(feed.snapshot(3).targetAirSpeedMps, 3)).toBeUndefined();
    }
  });

  it('derives speed trends only from timed samples of the same message source', () => {
    const feed = new MavlinkTelemetry({ systemId: 42 });
    feed.ingest(packet('VFR_HUD', 1, { airspeed: 20, groundspeed: 10, climb: 2 }));
    expect(readValue(feed.snapshot(1).groundAccelerationMps2, 1)).toBeUndefined();
    feed.ingest(packet('VFR_HUD', 1.5, { airspeed: 19, groundspeed: 11, climb: 2 }));
    expect(readValue(feed.snapshot(1.5).groundAccelerationMps2, 1.5)).toBe(2);
    expect(readValue(feed.snapshot(1.5).airAccelerationMps2, 1.5)).toBe(-2);
    feed.ingest(
      packet('GLOBAL_POSITION_INT', 1.6, {
        vx: 900,
        vy: 0,
        vz: -100,
        relative_alt: 50000,
        alt: 150000,
      }),
    );
    expect(readValue(feed.snapshot(1.6).groundAccelerationMps2, 1.6)).toBeUndefined();
    expect(feed.snapshot(1.6)).toMatchObject({
      climbMps: { value: 1 },
      altitudeM: { value: 50 },
      altitudeMslM: { value: 150 },
    });
    feed.ingest(packet('VFR_HUD', 5, { airspeed: 30, groundspeed: 40 }));
    expect(readValue(feed.snapshot(5).groundAccelerationMps2, 5)).toBeUndefined();
    feed.ingest(packet('VFR_HUD', 5.5, { airspeed: NaN, groundspeed: NaN }));
    expect(readValue(feed.snapshot(5.5).airAccelerationMps2, 5.5)).toBeUndefined();
  });
});
