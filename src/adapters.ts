import type { HudFrame, Reading } from './types.js';
import { wrapHeading } from './telemetry.js';

export interface PtzSample {
  at: number;
  panDeg?: number;
  tiltDeg?: number;
  zoomRatio?: number;
  headingDeg?: number;
  valid?: boolean;
}

/** Input angles must already be calibrated; ONVIF normalized coordinates are not degrees. */
export function fromPtz(
  sample: PtzSample,
  time: number,
  label = 'PTZ CAMERA',
  source: HudFrame['source'] = 'live',
): HudFrame {
  const reading = (value: number | undefined): Reading | undefined =>
    value === undefined ? undefined : { value, at: sample.at, valid: sample.valid };
  return {
    time,
    label,
    source,
    mode: 'PTZ',
    panDeg: reading(sample.panDeg),
    tiltDeg: reading(sample.tiltDeg),
    zoomRatio: reading(sample.zoomRatio),
    headingDeg: reading(
      sample.headingDeg === undefined ? undefined : wrapHeading(sample.headingDeg),
    ),
  };
}

export { MavlinkTelemetry } from './mavlink.js';
export type { MavlinkEnvelope, MavlinkOptions, ServoOutputMapping } from './mavlink.js';
