import type { HudAlert, HudFrame, HudGuidance, Reading } from './types.js';

export type ReadingStatus = 'valid' | 'missing' | 'invalid' | 'stale' | 'future';

export function readingStatus(
  reading: Reading | undefined,
  time: number,
  staleAfterS = 1,
): ReadingStatus {
  if (!reading) return 'missing';
  if (
    reading.valid === false ||
    !Number.isFinite(reading.value) ||
    !Number.isFinite(reading.at) ||
    !Number.isFinite(time)
  )
    return 'invalid';
  if (reading.at - time > 1e-6) return 'future';
  return time - reading.at > Math.max(0, staleAfterS) ? 'stale' : 'valid';
}

export function readValue(
  reading: Reading | undefined,
  time: number,
  staleAfterS = 1,
): number | undefined {
  return readingStatus(reading, time, staleAfterS) === 'valid' ? reading?.value : undefined;
}

export function wrapHeading(degrees: number): number {
  return ((degrees % 360) + 360) % 360;
}

/** Highest severity first, then newest event. Never mutate the host's alert list. */
export function activeAlerts(frame: HudFrame): HudAlert[] {
  const rank = { emergency: 0, critical: 1, warning: 2, info: 3 };
  return (frame.alerts ?? [])
    .filter((alert) => {
      const end = alert.expiresAt ?? alert.at + 10;
      return (
        Number.isFinite(frame.time) &&
        Number.isFinite(alert.at) &&
        Number.isFinite(end) &&
        alert.at <= frame.time &&
        frame.time < end &&
        alert.message.trim().length > 0 &&
        Object.hasOwn(rank, alert.severity)
      );
    })
    .sort((a, b) => rank[a.severity] - rank[b.severity] || b.at - a.at);
}

export function readGuidance(frame: HudFrame, staleAfterS = 1): HudGuidance | undefined {
  const guidance = frame.guidance;
  return guidance?.instruction.trim() &&
    readingStatus({ value: 0, at: guidance.at, valid: guidance.valid }, frame.time, staleAfterS) ===
      'valid'
    ? guidance
    : undefined;
}

/** Return the last completed sample; never show a sample from the future. */
export function sampleIndexAt(samples: readonly { time: number }[], time: number): number {
  if (!Number.isFinite(time)) return -1;
  let lo = 0;
  let hi = samples.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (samples[mid]!.time <= time + 1e-9) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

export function telemetrySummary(frame: HudFrame, staleAfterS = 1): string {
  const value = (reading: Reading | undefined) => {
    const result = readValue(reading, frame.time, staleAfterS);
    return result === undefined ? 'unavailable' : result.toFixed(1);
  };
  const camera = frame.panDeg || frame.tiltDeg || frame.zoomRatio;
  const mode =
    frame.heartbeatAt === undefined ||
    readingStatus({ value: 0, at: frame.heartbeatAt }, frame.time, staleAfterS) === 'valid'
      ? `${frame.mode ?? ''}${frame.armed === undefined ? '' : frame.armed ? '. Armed' : '. Disarmed'}`
      : 'Mode unavailable';
  const position = camera
    ? `Pan ${value(frame.panDeg)} degrees. Tilt ${value(frame.tiltDeg)} degrees. Zoom ${value(frame.zoomRatio)} times.`
    : `Altitude ${value(frame.altitudeM)} metres. Depth ${value(frame.depthM)} metres. Ground speed ${value(frame.groundSpeedMps)} metres per second. Course ${value(frame.courseDeg)} degrees.`;
  const outputs =
    frame.outputs
      ?.map(
        (output) =>
          `${output.label} command ${value(output.command)} ${output.unit}. Feedback ${value(output.feedback)} ${output.unit}.`,
      )
      .join(' ') ?? '';
  const alerts = activeAlerts(frame)
    .map((alert) => `${alert.severity}: ${alert.message}.`)
    .join(' ');
  const guidance = readGuidance(frame, staleAfterS);
  const instructions = guidance
    ? `Autopilot guidance: ${guidance.instruction}. ${guidance.detail ?? ''}`
    : frame.guidance
      ? 'Autopilot guidance unavailable.'
      : '';
  const ranges =
    frame.rangefinders
      ?.map((sensor) => `${sensor.direction} range ${value(sensor.distanceM)} metres.`)
      .join(' ') ?? '';
  const cameraStatus = frame.camera
    ? `Camera ${
        frame.camera.at !== undefined &&
        readingStatus({ value: 0, at: frame.camera.at }, frame.time, staleAfterS) === 'valid'
          ? (frame.camera.mode ?? 'mode unavailable')
          : 'unavailable'
      }. Temperature min ${value(frame.camera.minC)}, max ${value(frame.camera.maxC)} Celsius.`
    : '';
  const gps =
    frame.gpsFix || frame.gpsSatellites
      ? `GNSS fix ${value(frame.gpsFix)}, satellites ${value(frame.gpsSatellites)}, HDOP ${value(frame.gpsHdop)}.`
      : '';
  const link =
    frame.rcSignalPct || frame.rcRssi || frame.radioRssi
      ? `${frame.rcSignalPct ? `RC signal ${value(frame.rcSignalPct)} percent.` : `RC RSSI ${value(frame.rcRssi)} device units.`} Radio RSSI ${value(frame.radioRssi)} device units.`
      : '';
  const health = frame.sensorHealth
    ? readingStatus({ value: 0, at: frame.sensorHealth.at }, frame.time, staleAfterS) === 'valid'
      ? frame.sensorHealth.items.map((item) => `${item.label} ${item.state}.`).join(' ')
      : 'Sensor health unavailable.'
    : '';
  const bearings =
    frame.bearingMarkers
      ?.filter((marker) => readValue(marker.bearingDeg, frame.time, staleAfterS) !== undefined)
      .map((marker) => `${marker.label} bearing ${value(marker.bearingDeg)} degrees.`)
      .join(' ') ?? '';
  const targets = [
    frame.targetHeadingDeg ? `Target heading ${value(frame.targetHeadingDeg)} degrees.` : '',
    frame.targetAltitudeM
      ? `Target altitude ${value(frame.targetAltitudeM)} metres ${frame.targetAltitudeDatum ?? ''}.`
      : '',
    frame.targetAirSpeedMps
      ? `Target airspeed ${value(frame.targetAirSpeedMps)} metres per second.`
      : '',
    frame.targetGroundSpeedMps
      ? `Target ground speed ${value(frame.targetGroundSpeedMps)} metres per second.`
      : '',
  ].join(' ');
  const ar = frame.ar
    ? readingStatus({ value: 0, at: frame.ar.camera.at }, frame.time, staleAfterS) === 'valid'
      ? frame.ar.objects
          .filter(
            (o) =>
              o.visible !== false &&
              readingStatus({ value: 0, at: o.at }, frame.time, staleAfterS) === 'valid',
          )
          .map((o) => {
            const los = o.visibility
              ? readingStatus({ value: 0, at: o.visibility.at }, frame.time, staleAfterS) ===
                'valid'
                ? o.visibility.state
                : 'unknown'
              : undefined;
            return `AR ${o.label}.${los ? ` Anchor line of sight ${los}.` : ''}`;
          })
          .join(' ')
      : 'AR camera unavailable.'
    : '';
  return `${frame.label}. ${frame.source}. ${mode}. Heading ${value(frame.headingDeg)} degrees. ${position} ${outputs} ${frame.alert ?? ''} ${alerts} ${instructions} ${ranges} ${cameraStatus} ${gps} ${link} ${health} ${bearings} ${targets} ${ar}`;
}
