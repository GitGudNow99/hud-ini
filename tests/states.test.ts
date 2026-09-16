import { describe, expect, it } from 'vitest';
import { activeAlerts, readGuidance, telemetrySummary } from '../src/index.js';
import type { HudFrame } from '../src/index.js';
import { MavlinkTelemetry } from '../src/adapters.js';
import { common, MavLinkProtocolV2 } from 'node-mavlink';
import { decodeBytes } from '../tools/wire.js';

describe('alert and guidance lifetimes', () => {
  it('prioritizes severity, excludes future and expired events, and leaves host data untouched', () => {
    const frame: HudFrame = {
      time: 20,
      source: 'demo',
      label: 'TEST',
      alerts: [
        { id: 'info', severity: 'info', message: 'Mission updated', at: 19 },
        { id: 'emergency', severity: 'emergency', message: 'Propulsion failure', at: 18 },
        { id: 'old', severity: 'emergency', message: 'Expired', at: 10 },
        { id: 'future', severity: 'emergency', message: 'Future', at: 21 },
        { id: 'cleared', severity: 'critical', message: 'Cleared', at: 18, expiresAt: 20 },
        { id: 'invalid', severity: 'critical', message: 'Invalid', at: NaN },
        { id: 'warning', severity: 'warning', message: 'Accuracy degraded', at: 17, expiresAt: 30 },
      ],
    };
    expect(activeAlerts(frame).map((a) => a.id)).toEqual(['emergency', 'warning', 'info']);
    expect(frame.alerts?.[0]?.id).toBe('info');
    expect(telemetrySummary(frame)).not.toMatch(/Expired|Future|Cleared|Invalid/);
    expect(activeAlerts({ ...frame, time: 31 })).toEqual([]);
  });

  it('removes expired and future instructions from both visual input and accessible summaries', () => {
    const frame: HudFrame = {
      time: 6,
      source: 'demo',
      label: 'TEST',
      guidance: { at: 6, instruction: 'RETURN TO HOME', detail: 'BRG 245°' },
    };
    expect(readGuidance(frame)?.instruction).toBe('RETURN TO HOME');
    expect(telemetrySummary(frame)).toContain('RETURN TO HOME');
    for (const time of [5, 8]) {
      expect(readGuidance({ ...frame, time })).toBeUndefined();
      expect(telemetrySummary({ ...frame, time })).not.toContain('RETURN TO HOME');
    }
    expect(
      readGuidance({ ...frame, guidance: { ...frame.guidance!, valid: false } }),
    ).toBeUndefined();
  });
});

describe('MAVLink status messages', () => {
  it('preserves a real serialized STATUSTEXT message and its severity through wire decoding', async () => {
    const message = new common.StatusText();
    Object.assign(message, { severity: 0, text: 'Propulsion failure', id: 0, chunkSeq: 0 });
    const packets = await decodeBytes(new MavLinkProtocolV2(42, 1).serialize(message, 0));
    const feed = new MavlinkTelemetry({ systemId: 42 });
    expect(feed.ingest({ ...packets[0]!, time: 10 })).toBe(true);
    expect(activeAlerts(feed.snapshot(10))[0]).toMatchObject({
      severity: 'emergency',
      message: 'Propulsion failure',
      at: 10,
    });
    expect(activeAlerts(feed.snapshot(20))).toEqual([]);
    expect(feed.ingest({ ...packets[0]!, systemId: 43, time: 11 })).toBe(false);
  });

  it('assembles split UTF-8 bytes and rejects incomplete, out-of-order and timed-out messages', () => {
    const feed = new MavlinkTelemetry({ systemId: 42 });
    const bytes = new TextEncoder().encode(`${'A'.repeat(49)}ø confirmed`);
    const packet = (id: number, seq: number, text: Uint8Array, time: number) => ({
      systemId: 42,
      componentId: 1,
      time,
      message: 'STATUSTEXT',
      fields: { severity: 4, id, chunk_seq: seq },
      text,
    });
    expect(feed.ingest(packet(9, 0, bytes.slice(0, 50), 1))).toBe(true);
    expect(activeAlerts(feed.snapshot(1))).toHaveLength(0);
    expect(feed.ingest(packet(9, 1, bytes.slice(50), 1.1))).toBe(true);
    expect(activeAlerts(feed.snapshot(1.1))[0]?.message).toBe(`${'A'.repeat(49)}ø confirmed`);
    expect(feed.ingest(packet(10, 1, bytes.slice(50), 2))).toBe(false);
    feed.ingest(packet(10, 0, bytes.slice(0, 50), 3));
    expect(feed.ingest(packet(10, 1, bytes.slice(50), 6))).toBe(false);
    expect(feed.snapshot(6).alerts).toHaveLength(1);
  });
});
