import { sampleIndexAt } from '../src/index.js';
import type { HudFrame, HudOptions, HudArScene } from '../src/index.js';
import { fromPtz } from '../src/adapters.js';
import { arGalleryScene, arTerrainScene } from './ar-scene.js';
import { instrumentPanels, sensorExample, stateFrame, testCamera } from './states.js';
import { hudTheme } from './theme.js';
import { loadFixture } from './fixtures.js';
import type { Scenario, Specimen, Fixture } from './catalogue.js';

/** Authored preview motion. These samples do not represent autopilot validation. */
export class PreviewData {
  private samples = new Map<string, Fixture>();
  private inset = testCamera();
  private cameraPattern = testCamera();
  private source = document.createElement('canvas');
  /** Canvas draws run serially, so all specimens share one full-size render surface. */
  surface(width: number, height: number) {
    if (this.source.width !== width) this.source.width = width;
    if (this.source.height !== height) this.source.height = height;
    return this.source;
  }
  private terrainScene?: HudArScene;
  constructor(private scenarios: readonly Scenario[]) {}
  async load() {
    const [fixtures, terrain] = await Promise.all([
      Promise.all(this.scenarios.map(async (s) => [s.id, await loadFixture(s.id)] as const)),
      arTerrainScene(6, 480 / 360),
    ]);
    this.samples = new Map(fixtures);
    this.terrainScene = terrain;
  }
  frame(item: Specimen, elapsed = 0, dataState = 'current'): HudFrame {
    const scenario = item.scenario ?? this.scenarios.find((s) => s.preset === item.preset)?.id;
    const time = item.id === 'ar-terrain' ? 6 : 6 + (elapsed % 18);
    let frame = structuredClone(
      scenario
        ? this.samples.get(scenario)!.frames[
            sampleIndexAt(this.samples.get(scenario)!.frames, time)
          ]!
        : fromPtz(
            {
              at: time,
              panDeg: 25 + Math.sin(elapsed * 0.3) * 15,
              tiltDeg: -12 + Math.sin(elapsed * 0.5) * 8,
              zoomRatio: 2.5 + Math.sin(elapsed * 0.4) * 0.5,
              headingDeg: 110 + Math.sin(elapsed * 0.3) * 15,
            },
            time,
            'CAMERA 01',
            'demo',
          ),
    );
    frame.time = time;
    frame.controls = {
      at: time,
      label: 'CONTROL INPUT',
      left: [Math.sin(elapsed * 0.7) * 0.45, 0.5 + Math.sin(elapsed * 0.5) * 0.3],
      right: [Math.sin(elapsed) * 0.45, Math.cos(elapsed * 0.8) * 0.3],
      leftLabel: 'THR / YAW',
      rightLabel: 'ROLL / PITCH',
    };

    if (item.sensorExample) frame = sensorExample(frame, item.sensorExample);
    // Deliberate display examples supplement the recorded trajectory; timestamps remain explicit.
    const wave = Math.sin(elapsed * 0.45);
    const vary = (reading: HudFrame['altitudeM'], amplitude: number) =>
      reading && { ...reading, value: reading.value + wave * amplitude, at: time };
    frame.groundSpeedMps = vary(frame.groundSpeedMps, 0.4);
    frame.airSpeedMps = vary(frame.airSpeedMps, 1.6);
    frame.altitudeM = vary(frame.altitudeM, 4);
    frame.batteryPct = vary(frame.batteryPct, 3);
    if (frame.camera?.minC) frame.camera.minC = vary(frame.camera.minC, 0.8);
    if (frame.camera?.maxC) frame.camera.maxC = vary(frame.camera.maxC, 2);
    if (item.sensorExample) {
      frame.rcSignalPct = vary(frame.rcSignalPct, 3);
      frame.radioRssi = vary(frame.radioRssi, 4);
      frame.gpsHdop = vary(frame.gpsHdop, 0.15);
      for (const range of frame.rangefinders ?? []) range.distanceM = vary(range.distanceM, 0.2);
    }
    if (item.id.startsWith('ar-')) {
      frame.ar =
        item.id === 'ar-terrain'
          ? structuredClone(this.terrainScene!)
          : arGalleryScene(frame.time, 480 / 360, item.id, elapsed);
      if (item.id === 'ar-terrain') frame.time = this.terrainScene!.camera.at;
      if (item.id === 'ar-landing')
        frame.ar.objects = frame.ar.objects.filter((o) => o.kind === 'landing-zone');
    }
    if (item.id === 'altitude-cues') frame.climbMps = { value: 3, at: frame.time };
    if (item.id === 'heading-cues') {
      frame.headingDeg = {
        value: (350 + Math.sin(elapsed * 0.3) * 24 + 360) % 360,
        at: frame.time,
      };
      frame.targetHeadingDeg = { value: 20, at: frame.time };
      frame.headingRateDegS = { value: Math.cos(elapsed * 0.3) * 7.2, at: frame.time };
    }
    if (item.bearingExample) {
      frame.headingDeg = { value: (359 + Math.sin(elapsed * 0.25) * 20 + 360) % 360, at: time };
      frame.bearingMarkers = [
        { id: 'home', label: 'HOME', symbol: 'home', bearingDeg: { value: 330, at: time } },
        {
          id: 'wp',
          label: 'WP 03',
          symbol: 'diamond',
          selected: true,
          bearingDeg: { value: 8, at: time },
        },
        { id: 'poi', label: 'POI', symbol: 'circle', bearingDeg: { value: 30, at: time } },
      ];
    }
    if (item.state) frame = stateFrame(frame, item.state, item.preset);
    if (dataState === 'stale') frame.time += 12;
    if (dataState === 'missing') {
      for (const [key, value] of Object.entries(frame))
        if (value && typeof value === 'object' && !Array.isArray(value) && 'at' in value)
          delete (frame as unknown as Record<string, unknown>)[key];
      frame.outputs = frame.outputs?.map((output) => ({
        ...output,
        command: undefined,
        feedback: undefined,
      }));
      frame.mode = undefined;
      frame.ar = undefined;
      frame.bearingMarkers = undefined;
      frame.armed = undefined;
      frame.heartbeatAt = undefined;
      frame.alerts = [];
      frame.rangefinders = frame.rangefinders?.map((sensor) => ({
        ...sensor,
        distanceM: undefined,
        qualityPct: undefined,
      }));
    }
    return frame;
  }

  options(item: Specimen, elapsed = 0, dataState = 'current', insetWidth = 240): HudOptions {
    if (item.id === 'inset') {
      const ctx = this.inset.getContext('2d')!;
      ctx.drawImage(this.cameraPattern, 0, 0);
      ctx.fillStyle = '#fff8';
      ctx.fillRect((elapsed * 24) % this.inset.width, 0, 2, this.inset.height);
    }
    const panels = Object.fromEntries(
      instrumentPanels.map(([key]) => [key, item.panels.includes(key)]),
    );
    return {
      preset: item.preset,
      panels,
      theme: hudTheme(),
      inset: {
        image: this.inset,
        at: dataState === 'missing' ? NaN : 6 + (elapsed % 18),
        label: 'TEST CAMERA',
        width: insetWidth,
      },
    };
  }
}
