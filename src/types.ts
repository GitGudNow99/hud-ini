/** Seconds in the same clock domain as HudFrame.time. Values are never interpolated. */
export interface Reading {
  value: number;
  at: number;
  valid?: boolean;
}

export interface StickInput {
  at: number;
  label: string;
  left: readonly [number, number];
  right: readonly [number, number];
  leftLabel: string;
  rightLabel: string;
}

export interface ActuatorBank {
  at: number;
  label: string;
  items: readonly { label: string; value: number; fraction: number }[];
}

export type HudAlertSeverity = 'info' | 'warning' | 'critical' | 'emergency';

/** Event times share the frame clock. Alerts expire after 10 seconds unless expiresAt is set. */
export interface HudAlert {
  id: string;
  severity: HudAlertSeverity;
  message: string;
  at: number;
  expiresAt?: number;
  source?: string;
}

/** Host-issued guidance is display-only and expires with telemetry freshness. */
export interface HudGuidance {
  at: number;
  valid?: boolean;
  instruction: string;
  detail?: string;
  source?: string;
}

/** Distance along the sensor beam, never an inferred altitude above terrain. */
export interface HudRangefinder {
  id: string;
  label: string;
  direction: string;
  technology?: 'laser' | 'ultrasound' | 'infrared' | 'radar' | 'unknown';
  distanceM?: Reading;
  minM?: number;
  maxM?: number;
  qualityPct?: Reading;
}

/** Camera metadata and radiometry retain independent update times. */
export interface HudCamera {
  at?: number;
  mode?: 'EO' | 'IR' | 'FUSION';
  palette?: string;
  recording?: Reading;
  minC?: Reading;
  maxC?: Reading;
  spotC?: Reading;
}

export interface HudSensorHealth {
  at: number;
  items: readonly { id: string; label: string; state: 'ok' | 'fault' | 'disabled' }[];
}

/** North-referenced bearing in the same heading datum as the vehicle. */
export interface HudBearingMarker {
  id: string;
  label: string;
  bearingDeg: Reading;
  symbol?: 'diamond' | 'triangle' | 'circle' | 'cross' | 'home';
  selected?: boolean;
  color?: string;
}

/** Local Cartesian metres: east, north, up. Camera and objects share one origin. */
export type HudWorldPoint = readonly [number, number, number];

/** Column-major OpenGL clip-from-ENU matrix, including the displayed camera projection. */
export interface HudArCamera {
  at: number;
  position: HudWorldPoint;
  viewProjection: readonly number[];
}

/** Line of sight to one anchor, not per-pixel visibility of the object's entire shape. */
export interface HudArVisibility {
  state: 'visible' | 'occluded' | 'unknown';
  scope: 'anchor';
  /** Time of the evaluated input snapshot, never the response arrival time. */
  at: number;
  reason?: string;
}

export type HudArObject = {
  id: string;
  label: string;
  at: number;
  selected?: boolean;
  color?: string;
  /** Explicit host filter. False always hides the object, independent of line of sight. */
  visible?: boolean;
  visibility?: HudArVisibility;
} & (
  | { kind: 'waypoint' | 'home' | 'poi'; position: HudWorldPoint }
  | { kind: 'route'; points: readonly HudWorldPoint[] }
  | { kind: 'corridor'; points: readonly HudWorldPoint[]; widthM: number; heightM: number }
  | { kind: 'landing-zone'; position: HudWorldPoint; radiusM: number }
  | { kind: 'vehicle' | 'box'; position: HudWorldPoint; sizeM: HudWorldPoint; headingDeg?: number }
);

export interface HudArScene {
  /** Identifies the shared ENU origin and vertical datum. Required by terrain providers. */
  referenceFrame?: string;
  camera: HudArCamera;
  objects: readonly HudArObject[];
}

/** Command and sensor feedback are independent readings in the declared engineering unit. */
export interface ActuatorOutput {
  id: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  kind?: 'steering' | 'propulsion' | 'axis';
  /** Schematic coordinates: x right, y aft, each in [-1, 1]. Supplied by the host. */
  indicator?: {
    position: readonly [number, number];
    glyph: 'rotor' | 'thruster' | 'vertical' | 'surface' | 'rudder' | 'drive';
    label?: string;
    angleDeg?: number;
  };
  command?: Reading;
  feedback?: Reading;
}

/** Heading is clockwise from north; roll is right-wing-down; pitch/climb are positive up. */
export interface HudFrame {
  time: number;
  source: 'live' | 'replay' | 'demo';
  label: string;
  mode?: string;
  headingDeg?: Reading;
  /** Desired north-referenced heading, separate from the bearing to a waypoint. */
  targetHeadingDeg?: Reading;
  /** Measured change of heading, positive clockwise. Not body-axis yaw rate. */
  headingRateDegS?: Reading;
  rollDeg?: Reading;
  pitchDeg?: Reading;
  altitudeM?: Reading;
  /** Absolute altitude for converting an MSL target to the displayed relative datum. */
  altitudeMslM?: Reading;
  targetAltitudeM?: Reading;
  targetAltitudeDatum?: string;
  targetGroundSpeedMps?: Reading;
  targetAirSpeedMps?: Reading;
  /** Measured scalar speed change, not body-frame accelerometer output. */
  groundAccelerationMps2?: Reading;
  airAccelerationMps2?: Reading;
  groundSpeedMps?: Reading;
  climbMps?: Reading;
  batteryPct?: Reading;
  batteryVoltageV?: Reading;
  batteryCurrentA?: Reading;
  turnRateDegS?: Reading;
  panDeg?: Reading;
  tiltDeg?: Reading;
  zoomRatio?: Reading;
  alert?: string;
  alerts?: readonly HudAlert[];
  guidance?: HudGuidance;
  controls?: StickInput;
  actuators?: ActuatorBank;
  outputs?: readonly ActuatorOutput[];
  airSpeedMps?: Reading;
  depthM?: Reading;
  courseDeg?: Reading;
  throttlePct?: Reading;
  targetBearingDeg?: Reading;
  targetDistanceM?: Reading;
  latitudeDeg?: Reading;
  longitudeDeg?: Reading;
  vehicleType?: number;
  heartbeatAt?: number;
  armed?: boolean;
  altitudeDatum?: string;
  rangefinders?: readonly HudRangefinder[];
  camera?: HudCamera;
  gpsFix?: Reading;
  gpsSatellites?: Reading;
  gpsHdop?: Reading;
  /** Host-calibrated RC strength. Raw MAVLink RSSI alone cannot provide a percentage. */
  rcSignalPct?: Reading;
  rcRssi?: Reading;
  /** Device-specific RSSI units, not dBm or percentage. */
  radioRssi?: Reading;
  radioRemoteRssi?: Reading;
  sensorHealth?: HudSensorHealth;
  bearingMarkers?: readonly HudBearingMarker[];
  ar?: HudArScene;
}

export type HudPanel =
  | 'frame'
  | 'identity'
  | 'heading'
  | 'ar'
  | 'arMarkers'
  | 'arRoutes'
  | 'arVolumes'
  | 'arLabels'
  | 'bearingMarkers'
  | 'attitude'
  | 'tapes'
  | 'targets'
  | 'trends'
  | 'controls'
  | 'actuators'
  | 'inset'
  | 'reticle'
  | 'optics'
  | 'position'
  | 'power'
  | 'status'
  | 'messages'
  | 'guidance'
  | 'rangefinder'
  | 'camera'
  | 'gps'
  | 'link'
  | 'health';
export interface HudTheme {
  ink: string;
  accent: string;
  warning: string;
  danger?: string;
  muted: string;
  panel: string;
  fontFamily: string;
  /** Contrast stroke behind instrument lines and text. */
  outline?: string;
}

export interface HudInset {
  image: CanvasImageSource;
  crop?: readonly [number, number, number, number];
  /** Preferred width in CSS pixels. Defaults to 240; constrained to available corner space. */
  width?: number;
  at: number;
  valid?: boolean;
  label: string;
  footer?: string;
}

export interface HudOptions {
  /** Anchor-occluded AR objects are dimmed by default. Unknown objects remain visible. */
  arOcclusion?: 'dim' | 'hide' | 'off';
  preset?: import('./presets.js').VehiclePresetId;
  /** Instrument scale relative to the responsive default. Medium is the default. */
  size?: 'small' | 'medium' | 'large';
  /** Constant-rate trend horizon in seconds, constrained to 1-10. Defaults to 6. */
  trendSeconds?: number;
  /** Vertical field of view of a rectilinear, body-aligned camera. Defaults to 55 degrees. */
  verticalFovDeg?: number;
  panels?: Partial<Record<HudPanel, boolean>>;
  theme?: Partial<HudTheme>;
  staleAfterS?: number;
  inset?: HudInset;
  /** Select a specific range sensor. Defaults to the first supplied sensor. */
  rangefinderId?: string;
}

export interface HudViewport {
  width: number;
  height: number;
  pixelRatio?: number;
}
