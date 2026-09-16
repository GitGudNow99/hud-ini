import { describe, expect, it } from 'vitest';
import { common, MavLinkProtocolV2 } from 'node-mavlink';
import { MavlinkTelemetry } from '../src/adapters.js';
import { readValue, telemetrySummary } from '../src/index.js';
import { decodeBytes } from '../tools/wire.js';

describe('sensor and payload telemetry', () => {
  it('preserves directional range sensors independently through a MAVLink wire round trip', async () => {
    const feed = new MavlinkTelemetry({ systemId: 42 });
    const message = Object.assign(new common.DistanceSensor(), {
      id: 1,
      type: 0,
      orientation: 0,
      minDistance: 30,
      maxDistance: 10000,
      currentDistance: 4820,
      signalQuality: 92,
    });
    const [packet] = await decodeBytes(new MavLinkProtocolV2(42, 1).serialize(message, 0));
    feed.ingest({ ...packet!, time: 10 });
    feed.ingest({
      ...packet!,
      time: 9,
      fields: { ...packet!.fields, id: 2, type: 2, orientation: 25, current_distance: 280 },
    });
    expect(feed.snapshot(10).rangefinders).toMatchObject([
      { id: '1', direction: 'FWD', technology: 'laser', distanceM: { value: 48.2, at: 10 } },
      { id: '2', direction: 'DOWN', technology: 'infrared', distanceM: { at: 9 } },
    ]);
    expect(feed.snapshot(10).rangefinders![1]!.distanceM!.value).toBeCloseTo(2.8);
    expect(feed.snapshot(10).altitudeM).toBeUndefined();
    expect(feed.ingest({ ...packet!, time: 8 })).toBe(false);
    for (const [signal_quality, current_distance] of [
      [0, 1230],
      [1, 1230],
      [92, 10001],
    ] as const) {
      feed.ingest({
        ...packet!,
        time: 11,
        fields: { ...packet!.fields, signal_quality, current_distance },
      });
      const sensor = feed.snapshot(11).rangefinders![0]!;
      expect(readValue(sensor.distanceM, 11)).toBe(signal_quality === 0 ? 12.3 : undefined);
      if (signal_quality === 0) expect(readValue(sensor.qualityPct, 11)).toBeUndefined();
    }
    expect(telemetrySummary(feed.snapshot(20))).not.toMatch(/48\.2|12\.3|2\.8/);
  });

  it('accepts only the selected camera and keeps stream, recording and thermal clocks independent', async () => {
    const feed = new MavlinkTelemetry({
      systemId: 42,
      camera: { componentId: 100, deviceId: 0, streamId: 2 },
    });
    const thermal = Object.assign(new common.CameraThermalRange(), {
      streamId: 2,
      cameraDeviceId: 0,
      min: 18.4,
      max: 42.6,
    });
    const [packet] = await decodeBytes(new MavLinkProtocolV2(42, 100).serialize(thermal, 0));
    expect(feed.ingest({ ...packet!, time: 1 })).toBe(true);
    for (const changed of [
      { systemId: 43 },
      { componentId: 101 },
      { fields: { ...packet!.fields, stream_id: 1 } },
      { fields: { ...packet!.fields, camera_device_id: 1 } },
    ])
      expect(feed.ingest({ ...packet!, time: 2, ...changed })).toBe(false);
    const stream = Object.assign(new common.VideoStreamStatus(), {
      streamId: 2,
      cameraDeviceId: 0,
      flags: 7,
    });
    const [status] = await decodeBytes(new MavLinkProtocolV2(42, 100).serialize(stream, 1));
    feed.ingest({ ...status!, time: 2 });
    const frame = feed.snapshot(2.5);
    expect(frame.camera?.mode).toBe('IR');
    expect(frame.camera?.minC?.at).toBe(1);
    expect(readValue(frame.camera?.minC, 2.5)).toBeUndefined();
    expect(telemetrySummary(frame)).toContain('Camera IR. Temperature min unavailable');
    expect(feed.ingest({ ...status!, time: 3, message: 'HEARTBEAT' })).toBe(false);
    expect(new MavlinkTelemetry({ systemId: 42 }).ingest({ ...packet!, time: 1 })).toBe(false);
    feed.ingest({ ...packet!, time: 3, fields: { ...packet!.fields, min: 50, max: 40 } });
    expect(readValue(feed.snapshot(3).camera?.maxC, 3)).toBeUndefined();
    expect(telemetrySummary(feed.snapshot(10))).toContain('Camera unavailable');
  });

  it('retains radio units and clears protocol sentinels rather than inventing signal quality', async () => {
    const feed = new MavlinkTelemetry({ systemId: 42, radioComponentId: 68 });
    const radio = Object.assign(new common.RadioStatus(), { rssi: 184, remrssi: 255 });
    const [packet] = await decodeBytes(new MavLinkProtocolV2(42, 68).serialize(radio, 0));
    expect(feed.ingest({ ...packet!, time: 1 })).toBe(true);
    const rc = Object.assign(new common.RcChannels(), { rssi: 127 });
    const [rcPacket] = await decodeBytes(new MavLinkProtocolV2(42, 1).serialize(rc, 1));
    feed.ingest({ ...rcPacket!, time: 1 });
    const frame = feed.snapshot(1);
    expect(readValue(frame.radioRssi, 1)).toBe(184);
    expect(readValue(frame.radioRemoteRssi, 1)).toBeUndefined();
    expect(readValue(frame.rcRssi, 1)).toBe(127);
    expect(frame.rcSignalPct).toBeUndefined();
    expect(telemetrySummary(frame)).toContain('RC RSSI 127.0 device units');
    expect(feed.ingest({ ...packet!, componentId: 1, time: 2 })).toBe(false);
  });

  it('preserves GNSS no-fix and distinguishes present, enabled and healthy sensors', async () => {
    const feed = new MavlinkTelemetry({ systemId: 42 });
    const gps = Object.assign(new common.GpsRawInt(), {
      fixType: 1,
      satellitesVisible: 255,
      eph: 65535,
    });
    const [gpsPacket] = await decodeBytes(new MavLinkProtocolV2(42, 1).serialize(gps, 0));
    feed.ingest({ ...gpsPacket!, time: 1 });
    expect(readValue(feed.snapshot(1).gpsFix, 1)).toBe(1);
    expect(readValue(feed.snapshot(1).gpsSatellites, 1)).toBeUndefined();
    expect(readValue(feed.snapshot(1).gpsHdop, 1)).toBeUndefined();
    feed.ingest({
      systemId: 42,
      componentId: 1,
      time: 1,
      message: 'SYS_STATUS',
      fields: {
        onboard_control_sensors_present: 1 | 2 | 4 | 32,
        onboard_control_sensors_enabled: 1 | 2 | 32,
        onboard_control_sensors_health: 1 | 4 | 32,
      },
    });
    expect(feed.snapshot(1).sensorHealth?.items.map(({ label, state }) => [label, state])).toEqual([
      ['GYRO', 'ok'],
      ['ACCEL', 'fault'],
      ['MAG', 'disabled'],
      ['GPS', 'ok'],
    ]);
    expect(telemetrySummary(feed.snapshot(5))).toContain('Sensor health unavailable');
  });
});
