import type { HudFrame, HudPanel, VehiclePresetId } from '../src/index.js';
import type { DisplayState, SensorExample } from './states.js';

export interface Scenario {
  id: string;
  preset: VehiclePresetId;
  label: string;
  mavType: number;
}
export interface Specimen {
  id: string;
  title: string;
  description: string;
  category: string;
  panels: HudPanel[];
  preset: VehiclePresetId;
  crop: [number, number, number, number];
  scenario?: string;
  state?: DisplayState;
  cameraSize?: [number, number];
  sensorExample?: SensorExample;
  bearingExample?: boolean;
}

export interface Fixture {
  duration: number;
  frames: HudFrame[];
}

export function createSpecimens(scenarios: readonly Scenario[]): Specimen[] {
  const items: Specimen[] = [];
  const add = (
    id: string,
    title: string,
    description: string,
    category: string,
    panels: HudPanel[],
    preset: VehiclePresetId,
    crop: Specimen['crop'],
    extra: Partial<Specimen> = {},
  ) => {
    const item: Specimen = { id, title, description, category, panels, preset, crop, ...extra };
    if (panels.length === 1 && panels[0] === 'tapes') {
      item.cameraSize = [480, 300];
      item.crop = [crop[0] > 500 ? 365 : 0, 48, 115, 194];
    }
    if (panels.length === 1 && panels[0] === 'actuators')
      item.crop =
        preset === 'multirotor' || preset === 'generic' ? [26, 437, 240, 212] : [42, 490, 288, 160];
    items.push(item);
  };
  add(
    'heading',
    'Heading ribbon',
    'Wraps through north with a fixed heading index.',
    'Flight instruments',
    ['heading'],
    'plane',
    [125, 8, 230, 105],
    { cameraSize: [480, 520] },
  );
  add(
    'bearing-markers',
    'Compass markers',
    'Waypoints, home and custom bearing markers with label spacing and off-scale cues.',
    'Flight instruments',
    ['heading', 'bearingMarkers'],
    'plane',
    [125, 8, 230, 105],
    { cameraSize: [480, 520], bearingExample: true },
  );
  add(
    'heading-cues',
    'Heading target and turn trend',
    'Desired heading on the scale; the dashed line projects the current turn for six seconds.',
    'Flight instruments',
    ['heading', 'targets', 'trends'],
    'plane',
    [280, 16, 490, 68],
    { cameraSize: [1050, 440], sensorExample: 'nominal' },
  );
  add(
    'attitude',
    'Horizon and pitch ladder',
    'Camera-aligned pitch and bank with local instrument clearance.',
    'Flight instruments',
    ['attitude'],
    'plane',
    [125, 195, 230, 145],
    { cameraSize: [480, 520] },
  );
  for (const [id, title, panels, description] of [
    [
      'ar-markers',
      'World waypoints and home',
      ['arMarkers'],
      'Camera-projected waypoint, home and POI markers with distance labels.',
    ],
    [
      'ar-route',
      'Route in 3D',
      ['arMarkers', 'arRoutes'],
      'A route and approach volume fixed in the local world frame.',
    ],
    [
      'ar-landing',
      'Landing zone',
      ['arRoutes'],
      'A ring and landing H drawn on a horizontal plane in metres.',
    ],
    [
      'ar-volumes',
      'Vehicles and object boxes',
      ['arVolumes'],
      'Oriented 3D bounds with a vehicle heading arrow and range.',
    ],
    [
      'ar-terrain',
      'Terrain line of sight',
      ['arMarkers'],
      'Height-grid tests: above a 22 m ridge, behind it, and missing coverage. OCC is dimmed; LOS ? remains visible.',
    ],
  ] as const)
    add(
      id,
      title,
      description,
      'AR objects',
      ['ar', 'arLabels', ...panels],
      'plane',
      id === 'ar-terrain' ? [80, 75, 330, 160] : [60, 55, 360, 240],
      { cameraSize: [480, 360] },
    );
  add(
    'speed',
    'Airspeed tape',
    'Current value, moving scale and explicit unavailable states.',
    'Flight instruments',
    ['tapes'],
    'plane',
    [23, 240, 155, 215],
  );
  add(
    'altitude',
    'Altitude tape',
    'Relative altitude from timestamped telemetry.',
    'Flight instruments',
    ['tapes'],
    'plane',
    [875, 240, 155, 215],
  );
  add(
    'course',
    'Course over ground',
    'Travel direction is separate from vehicle heading.',
    'Flight instruments',
    ['tapes'],
    'boat',
    [875, 240, 155, 215],
  );
  for (const [id, title, crop] of [
    ['speed-cues', 'Speed target and trend', [25, 78, 190, 252]],
    ['altitude-cues', 'Altitude target and trend', [835, 78, 190, 252]],
  ] as const)
    add(
      id,
      title,
      'Triangle: reported target. Dashed line: six-second constant-rate projection.',
      'Flight instruments',
      ['tapes', 'targets', 'trends'],
      'plane',
      [...crop],
      { cameraSize: [1050, 440], sensorExample: 'nominal' },
    );
  add(
    'depth',
    'Depth tape',
    'Subsea depth with an explicit surface reference.',
    'Flight instruments',
    ['tapes'],
    'submarine',
    [875, 240, 155, 215],
  );
  add(
    'reticle',
    'Camera reticle',
    'Central sight with optional framing brackets.',
    'Camera and controls',
    ['reticle'],
    'ptz',
    [438, 265, 175, 175],
  );
  add(
    'sticks',
    'Control sticks',
    'Independent left and right control inputs.',
    'Camera and controls',
    ['controls'],
    'multirotor',
    [324, 550, 402, 65],
  );
  add(
    'optics',
    'Optics readout',
    'Calibrated camera zoom, separate from vehicle attitude.',
    'Camera and controls',
    ['optics'],
    'ptz',
    [418, 427, 215, 42],
  );
  add(
    'inset',
    'Camera inset',
    'Adjustable camera width with a 4:3 image. Fits available corner space; stale pixels are cleared.',
    'Camera and controls',
    ['inset'],
    'ptz',
    [720, 691, 264, 216],
    { cameraSize: [1050, 1000] },
  );
  add(
    'pan',
    'Camera pan',
    'Calibrated camera pan in degrees.',
    'Camera and controls',
    ['tapes'],
    'ptz',
    [23, 240, 155, 215],
  );
  add(
    'tilt',
    'Camera tilt',
    'Calibrated camera tilt in degrees.',
    'Camera and controls',
    ['tapes'],
    'ptz',
    [875, 240, 155, 215],
  );
  add(
    'identity',
    'Vehicle identity',
    'Host-defined callsign and source identity.',
    'Telemetry',
    ['identity'],
    'boat',
    [64, 18, 255, 40],
  );
  add(
    'position',
    'Coordinates',
    'Latitude and longitude retain independent freshness.',
    'Telemetry',
    ['position'],
    'boat',
    [64, 632, 265, 50],
  );
  add(
    'power',
    'Power indicator',
    'Lightning symbol, open charge track and an inline percentage.',
    'Telemetry',
    ['power'],
    'boat',
    [816, 631, 180, 46],
  );
  add(
    'status',
    'Mode and link status',
    'Armed state, autopilot mode and telemetry availability.',
    'Telemetry',
    ['status'],
    'plane',
    [365, 626, 320, 60],
  );
  add(
    'frame',
    'Corner frame',
    'Independent camera-edge markings with emergency emphasis.',
    'Telemetry',
    ['frame'],
    'boat',
    [10, 10, 1030, 680],
  );
  for (const [state, title, description] of [
    ['info', 'Information', 'Informational event with a distinct information symbol.'],
    ['warning', 'Warning', 'Amber triangle for an issue requiring attention.'],
    ['critical', 'Critical alert', 'Red triangle and explicit severity for a reported failure.'],
    ['emergency', 'Emergency', 'Red octagon with a separate operator instruction.'],
    ['return', 'Return to home', 'Autopilot instruction with bearing and distance.'],
    ['hold', 'Hold position', 'Position-hold instruction supplied by the host.'],
    ['land', 'Landing instruction', 'Current approach guidance without sending a command.'],
    ['guidance-stale', 'Stale guidance', 'Expired instructions lose their actionable text.'],
    ['data-stale', 'Telemetry lost', 'Link freshness remains visible when telemetry stops.'],
  ] as const)
    add(
      state,
      title,
      description,
      'Alerts and guidance',
      state === 'data-stale' ? ['status'] : ['messages', 'guidance'],
      'plane',
      state === 'data-stale'
        ? [365, 626, 320, 60]
        : [340, 77, 370, state === 'emergency' ? 142 : 91],
      { state },
    );
  for (const scenario of scenarios) {
    const tracker = scenario.preset === 'tracker';
    add(
      `vehicle-${scenario.id}`,
      scenario.label.split(' / ').at(-1)!.replaceAll('_', ' '),
      tracker
        ? 'MAV_TYPE 5 · Tracker tilt from calibrated attitude telemetry.'
        : `MAV_TYPE ${scenario.mavType} · Host-configured actuator geometry and command values.`,
      tracker ? 'Camera and controls' : 'Vehicle drawings',
      tracker ? ['tapes'] : ['actuators'],
      scenario.preset,
      tracker ? [875, 240, 155, 215] : [32, 437, 330, 212],
      { scenario: scenario.id },
    );
  }
  for (const [id, title, description, panel, sample] of [
    [
      'rangefinder',
      'Forward rangefinder',
      'Sensor beam distance, direction, technology and signal quality.',
      'rangefinder',
      'nominal',
    ],
    [
      'range-down',
      'Downward range',
      'Downward beam distance remains separate from terrain altitude.',
      'rangefinder',
      'down',
    ],
    [
      'range-ir',
      'Infrared range sensor',
      'Infrared proximity sensing is independent of thermal camera telemetry.',
      'rangefinder',
      'infrared',
    ],
    [
      'range-invalid',
      'Invalid range',
      'Out-of-range or invalid signals clear the last distance.',
      'rangefinder',
      'range-invalid',
    ],
    [
      'thermal',
      'Thermal camera',
      'IR mode, host-supplied palette, recording and measured temperature range.',
      'camera',
      'nominal',
    ],
    [
      'visible-camera',
      'Visible-light camera',
      'EO stream and recording status without assumed temperatures.',
      'camera',
      'eo',
    ],
    [
      'gnss',
      'GNSS quality',
      'Fix type, visible satellites and horizontal dilution of precision.',
      'gps',
      'nominal',
    ],
    [
      'gnss-no-fix',
      'GNSS without a fix',
      'A reported no-fix state remains distinct from missing telemetry.',
      'gps',
      'gps-no-fix',
    ],
    [
      'radio',
      'RC and radio signal',
      'RC strength in percent; local and remote radio RSSI in device units.',
      'link',
      'nominal',
    ],
    [
      'sensor-health',
      'Sensor health',
      'Health of enabled, present sensors reported by the autopilot.',
      'health',
      'nominal',
    ],
    [
      'sensor-fault',
      'Sensor fault',
      'A failed sensor has an explicit fault label and red emphasis.',
      'health',
      'sensor-fault',
    ],
  ] as const) {
    const crops = {
      rangefinder: [760, 87, 223, 53],
      camera: [760, 47, 223, 50],
      gps: [266, 635, 145, 38],
      link: [639, 628, 164, 45],
      health: [68, 40, 143, 45],
    } as const;
    add(id, title, description, 'Sensors and payload', [panel], 'multirotor', [...crops[panel]], {
      sensorExample: sample,
    });
  }
  return items;
}
