import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { MavLinkProtocolV2, minimal, standard, common } from 'node-mavlink';
import { vehiclePresets } from '../src/presets.js';
import { MavlinkTelemetry } from '../src/adapters.js';
import { decodeBytes } from './wire.js';
import { scenarioOutputs } from './scenario-outputs.js';

const output = new URL('../demo/public/fixtures/', import.meta.url);
await mkdir(output, { recursive: true });
const digest = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');
const manifest: Record<string, unknown>[] = [];
const duration = 30,
  rate = 10;
const modeNumbers: Record<string, number> = {
  copter: 5,
  plane: 10,
  rover: 10,
  sub: 16,
  tracker: 10,
  blimp: 3,
  generic: 0,
};
for (const preset of vehiclePresets.filter((p) => p.id !== 'ptz')) {
  for (const mavType of preset.mavTypes) {
    const id = `${preset.id}-${mavType}`;
    const servoOutputs = scenarioOutputs(preset, mavType);
    const protocol = new MavLinkProtocolV2(42, 1);
    const packets: Buffer[] = [];
    const times: number[] = [];
    let sequence = 0;
    const send = (message: Parameters<MavLinkProtocolV2['serialize']>[0], time: number) => {
      packets.push(protocol.serialize(message, sequence++ % 256));
      times.push(time);
    };
    for (let tick = 0; tick <= duration * rate; tick++) {
      const t = tick / rate;
      const moving = preset.id !== 'tracker';
      const speed = !moving
        ? 0
        : preset.domain === 'air'
          ? preset.id === 'plane' || preset.id === 'vtol'
            ? 24
            : 9
          : preset.domain === 'surface'
            ? 4.5
            : preset.domain === 'underwater'
              ? 1.3
              : 3;
      const radius = preset.domain === 'air' ? 180 : 65;
      const angle = (speed / radius) * t + 0.6;
      const north = moving ? radius * Math.cos(angle) : 0,
        east = moving ? radius * Math.sin(angle) : 0;
      const course = moving ? ((angle * 180) / Math.PI + 90) % 360 : 70 + 30 * Math.sin(t / 8);
      const heading = preset.id === 'boat' ? (course + 354) % 360 : course;
      const roll =
        preset.domain === 'air'
          ? 7 * Math.sin(t / 6)
          : preset.domain === 'surface'
            ? 2 * Math.sin(t * 1.8)
            : 0;
      const pitch =
        preset.domain === 'air'
          ? 3 + 2 * Math.sin(t / 5)
          : preset.domain === 'surface'
            ? Math.sin(t * 1.4)
            : preset.id === 'tracker'
              ? 15 + 5 * Math.sin(t / 7)
              : 0;
      const altitude =
        preset.domain === 'air'
          ? 48 + 4 * Math.sin(t / 5)
          : preset.domain === 'underwater'
            ? -8 - 1.2 * Math.sin(t / 5)
            : 0;
      const climb =
        preset.domain === 'air'
          ? 0.8 * Math.cos(t / 5)
          : preset.domain === 'underwater'
            ? -0.24 * Math.cos(t / 5)
            : 0;
      if (tick % rate === 0) {
        const hb = new minimal.Heartbeat();
        Object.assign(hb, {
          type: mavType,
          autopilot: 3,
          baseMode: 129,
          customMode: modeNumbers[preset.family] ?? 0,
          systemStatus: 4,
          mavlinkVersion: 3,
        });
        send(hb, t);
        const status = new common.SysStatus();
        Object.assign(status, {
          batteryRemaining: 86 - Math.floor(t / 10),
          voltageBattery: 24000,
          currentBattery: 800,
        });
        send(status, t);
      }
      const attitude = new common.Attitude();
      Object.assign(attitude, {
        timeBootMs: tick * 100,
        roll: (roll * Math.PI) / 180,
        pitch: (pitch * Math.PI) / 180,
        yaw: (heading * Math.PI) / 180,
        yawspeed: moving ? speed / radius : ((30 / 8) * Math.cos(t / 8) * Math.PI) / 180,
      });
      send(attitude, t);
      const position = new standard.GlobalPositionInt();
      Object.assign(position, {
        timeBootMs: tick * 100,
        lat: Math.round((59.9 + north / 111320) * 1e7),
        lon: Math.round((10.7 + east / (111320 * Math.cos((59.9 * Math.PI) / 180))) * 1e7),
        alt: Math.round(altitude * 1000),
        relativeAlt: Math.round(altitude * 1000),
        vx: Math.round(speed * 100 * Math.cos((course * Math.PI) / 180)),
        vy: Math.round(speed * 100 * Math.sin((course * Math.PI) / 180)),
        vz: Math.round(-climb * 100),
        hdg: Math.round(heading * 100),
      });
      send(position, t);
      const vfr = new common.VfrHud();
      Object.assign(vfr, {
        airspeed: preset.domain === 'air' ? speed + 1.5 : 0,
        groundspeed: speed,
        heading: Math.round(heading),
        throttle: moving ? 52 + Math.round(10 * Math.sin(t / 5)) : 0,
        alt: altitude,
        climb,
      });
      send(vfr, t);
      const nav = new common.NavControllerOutput();
      Object.assign(nav, {
        targetBearing: Math.round((heading + 15) % 360),
        wpDist: Math.round(160 - ((t * speed) % 140)),
      });
      send(nav, t);
      if (servoOutputs.length) {
        const servos = new common.ServoOutputRaw();
        Object.assign(servos, { timeUsec: tick * 100000, port: 0 });
        for (const [i, output] of servoOutputs.entries()) {
          const normalized =
            output.kind === 'propulsion'
              ? 0.55 + 0.07 * Math.sin(t / 5 + i * 0.6)
              : 0.24 * Math.sin(t / 4 + i * 0.5);
          const pwm =
            output.pwmNeutral === undefined ? 1000 + normalized * 1000 : 1500 + normalized * 500;
          Object.assign(servos, { [`servo${output.channel}Raw`]: Math.round(pwm) });
        }
        send(servos, t);
      }
    }
    const wire = Buffer.concat(packets);
    const decoded = await decodeBytes(wire);
    if (decoded.length !== times.length)
      throw new Error(
        `MAVLink roundtrip lost packets for ${id}: ${decoded.length}/${times.length}`,
      );
    decoded.forEach((packet, i) => {
      packet.time = times[i]!;
    });
    const adapter = new MavlinkTelemetry({
      systemId: 42,
      servoOutputs,
      label: `${preset.id.toUpperCase()} 01`,
      depthOriginM: preset.id === 'submarine' ? 0 : undefined,
    });
    const frames = [];
    for (let i = 0; i < decoded.length; i++) {
      adapter.ingest(decoded[i]!);
      if (decoded[i + 1]?.time !== decoded[i]!.time)
        frames.push(adapter.snapshot(decoded[i]!.time, 'demo'));
    }
    const content = JSON.stringify({
      schema: 'hud-ini.scenario.v1',
      id,
      preset: preset.id,
      mavType,
      duration,
      rate,
      servoOutputs,
      source:
        'Deterministic kinematic scenario, encoded and decoded through MAVLink 2. No physics or autopilot firmware.',
      frames,
    });
    await writeFile(new URL(`${id}.json`, output), content);
    await writeFile(new URL(`${id}.mavlink`, output), wire);
    manifest.push({
      id,
      preset: preset.id,
      label: `${preset.label} / ${minimal.MavType[mavType]}`,
      mavType,
      frames: frames.length,
      packets: decoded.length,
      jsonSha256: digest(content),
      wireSha256: digest(wire),
    });
  }
}
await writeFile(
  new URL('manifest.json', output),
  JSON.stringify(
    {
      schema: 'hud-ini.fixtures.v1',
      duration,
      rate,
      generatorSha256: digest(await readFile(new URL(import.meta.url))),
      outputMappingSha256: digest(
        await readFile(new URL('./scenario-outputs.ts', import.meta.url)),
      ),
      scenarios: manifest,
    },
    null,
    2,
  ),
);
console.log(`Generated ${manifest.length} scenarios with verified MAVLink 2 roundtrips.`);
