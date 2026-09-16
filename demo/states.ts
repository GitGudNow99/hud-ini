import type { HudFrame, HudPanel, VehiclePresetId } from '../src/index.js';

export const instrumentPanels: readonly [HudPanel, string][] = [
  ['frame', 'Corner frame'],
  ['identity', 'Vehicle identity'],
  ['heading', 'Compass'],
  ['bearingMarkers', 'Compass markers'],
  ['ar', 'AR objects (3D)'],
  ['arMarkers', 'AR waypoints and home'],
  ['arRoutes', 'AR routes and landing zones'],
  ['arVolumes', 'AR vehicles and volumes'],
  ['arLabels', 'AR object labels'],
  ['attitude', 'Attitude'],
  ['tapes', 'Primary readouts'],
  ['targets', 'Target markers'],
  ['trends', 'Six-second trends'],
  ['reticle', 'Reticle'],
  ['actuators', 'Vehicle drawing'],
  ['controls', 'Control sticks'],
  ['optics', 'Optics'],
  ['position', 'Coordinates'],
  ['power', 'Power'],
  ['status', 'Mode and data status'],
  ['messages', 'Warnings and alerts'],
  ['guidance', 'Autopilot guidance'],
  ['inset', 'Camera inset'],
  ['rangefinder', 'Rangefinder'],
  ['camera', 'EO / IR camera'],
  ['gps', 'GNSS quality'],
  ['link', 'RC and radio signal'],
  ['health', 'Sensor health'],
];

export type SensorExample =
  'nominal' | 'down' | 'infrared' | 'range-invalid' | 'eo' | 'gps-no-fix' | 'sensor-fault';

/** Package-owned display samples, separate from the recorded vehicle trajectory. */
export function sensorExample(frame: HudFrame, example: SensorExample = 'nominal'): HudFrame {
  const at = frame.time;
  const r = (value: number) => ({ value, at });
  return {
    ...frame,
    targetHeadingDeg: r(165),
    headingRateDegS: r(2.5),
    targetAltitudeM: r(65),
    targetAltitudeDatum: frame.altitudeDatum,
    targetAirSpeedMps: r(27),
    targetGroundSpeedMps: r(6),
    airAccelerationMps2: r(0.22),
    groundAccelerationMps2: r(0.12),
    bearingMarkers: [
      { id: 'home', label: 'HOME', symbol: 'home', bearingDeg: r(108) },
      { id: 'waypoint', label: 'WP 03', symbol: 'diamond', selected: true, bearingDeg: r(156) },
      { id: 'poi', label: 'POI', symbol: 'circle', bearingDeg: r(172) },
    ],
    rangefinders: [
      {
        id: 'forward',
        label: 'FORWARD SENSOR',
        direction: example === 'down' ? 'DOWN' : 'FWD',
        technology: example === 'infrared' ? 'infrared' : 'laser',
        minM: 0.3,
        maxM: 100,
        distanceM: {
          ...r(example === 'down' ? 12.6 : example === 'infrared' ? 2.8 : 48.2),
          valid: example !== 'range-invalid',
        },
        qualityPct: r(example === 'range-invalid' ? 1 : 92),
      },
    ],
    camera: {
      at,
      mode: example === 'eo' ? 'EO' : 'IR',
      palette: example === 'eo' ? undefined : 'WHITE HOT',
      recording: r(1),
      ...(example === 'eo' ? {} : { minC: r(18.4), maxC: r(42.6) }),
    },
    gpsFix: r(example === 'gps-no-fix' ? 1 : 6),
    gpsSatellites: r(example === 'gps-no-fix' ? 3 : 18),
    gpsHdop: r(example === 'gps-no-fix' ? 8.1 : 0.7),
    rcSignalPct: r(84),
    radioRssi: r(184),
    radioRemoteRssi: r(168),
    sensorHealth: {
      at,
      items: ['GYRO', 'ACCEL', 'MAG', 'BARO', 'GPS', 'AHRS', 'RANGE', 'RC'].map((label) => ({
        id: label,
        label,
        state: example === 'sensor-fault' && label === 'AHRS' ? 'fault' : 'ok',
      })),
    },
  };
}

export const displayStates = [
  ['nominal', 'Nominal'],
  ['info', 'Information'],
  ['warning', 'Warning'],
  ['critical', 'Critical'],
  ['emergency', 'Emergency'],
  ['return', 'Return to home'],
  ['hold', 'Hold position'],
  ['land', 'Land / stop'],
  ['guidance-stale', 'Stale guidance'],
  ['data-stale', 'Telemetry lost'],
] as const;
export type DisplayState = (typeof displayStates)[number][0];

export function stateFrame(
  frame: HudFrame,
  state: DisplayState,
  preset: VehiclePresetId,
): HudFrame {
  const at = frame.time;
  const result = { ...frame };
  const air = ['multirotor', 'plane', 'vtol', 'helicopter', 'blimp', 'generic'].includes(preset);
  if (state === 'info' || state === 'warning' || state === 'critical' || state === 'emergency') {
    result.alerts = [
      {
        id: `demo-${state}`,
        severity: state,
        at,
        source: 'AUTOPILOT',
        message:
          state === 'info'
            ? 'Mission updated'
            : state === 'warning'
              ? 'GNSS accuracy degraded'
              : state === 'critical'
                ? 'Battery reserve low'
                : 'Propulsion failure',
      },
    ];
    if (state === 'emergency')
      result.guidance = { at, instruction: 'OPERATOR CONTROL REQUIRED', source: 'AUTOPILOT' };
  }
  if (['return', 'hold', 'land', 'guidance-stale'].includes(state)) {
    result.guidance = {
      at: state === 'guidance-stale' ? at - 5 : at,
      source: 'AUTOPILOT',
      instruction:
        state === 'hold'
          ? 'HOLD POSITION'
          : state === 'land'
            ? air
              ? 'LAND AT DESIGNATED SITE'
              : 'STOP AND HOLD'
            : 'RETURN TO HOME',
      detail:
        state === 'hold'
          ? 'Position hold active'
          : state === 'land'
            ? 'Approach phase active'
            : 'BRG 245° · DIST 820 m',
    };
  }
  if (state === 'data-stale') result.time += 5;
  return result;
}

export function testCamera(): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = 252;
  canvas.height = 188;
  const ctx = canvas.getContext('2d')!;
  const colors = ['#dee8ed', '#adbac2', '#7d8e98', '#4b606d', '#1b2e38'];
  for (const [i, color] of colors.entries()) {
    ctx.fillStyle = color;
    ctx.fillRect(i * 51, 0, 51, 188);
  }
  ctx.strokeStyle = '#49ded8';
  ctx.lineWidth = 2;
  ctx.strokeRect(89, 58, 74, 74);
  ctx.beginPath();
  ctx.moveTo(126, 36);
  ctx.lineTo(126, 152);
  ctx.moveTo(68, 94);
  ctx.lineTo(184, 94);
  ctx.stroke();
  return canvas;
}
