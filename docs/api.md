# API guide

Use these examples to connect hud-ini to your application. Install the [public npm package](https://www.npmjs.com/package/hud-ini):

```sh
npm install hud-ini
```

See the [package README](../README.md#installation) for requirements and entry points.

## Vehicle profiles

| Profile          | Main instruments                                        | MAVLink types                                                                  |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Multirotor       | Heading, attitude, ground speed, relative altitude      | Quad, tri, hexa, octo, deca, dodeca and generic multirotor                     |
| Helicopter       | Heading, attitude, airspeed, relative altitude          | Conventional and coaxial                                                       |
| Fixed wing       | Heading, attitude, airspeed, relative altitude          | Fixed wing                                                                     |
| VTOL / QuadPlane | Heading, attitude, airspeed, relative altitude          | Tailsitters, tiltrotor, fixed rotor, tiltwing, gyrodyne and reserved VTOL type |
| Rover            | Heading, ground speed, course                           | Ground rover                                                                   |
| USV / boat       | Heading, speed over ground in knots, course over ground | Surface boat                                                                   |
| Submarine / ROV  | Heading, attitude, speed, depth                         | Submarine                                                                      |
| Antenna tracker  | Heading, azimuth and elevation                          | Antenna tracker                                                                |
| Blimp / airship  | Heading, attitude, airspeed, relative altitude          | Airship                                                                        |
| PTZ camera       | Calibrated pan, tilt, zoom and reticle                  | Camera and gimbal                                                              |
| Generic          | Heading, attitude, speed, relative altitude             | Generic and unknown types                                                      |

`presetForMavType()` selects the profile. Unsupported component types fall back to generic; mapping to a display is not a claim of firmware support. The boat fixture deliberately separates body heading from course. Depth requires an explicit surface reference. PTZ values are local test inputs with no camera connection.

## Rendering

### React

```tsx
import { HudIni } from 'hud-ini/react';
import type { HudFrame } from 'hud-ini';

export function VehicleView({ frame }: { frame: HudFrame }) {
  return (
    <div style={{ position: 'relative', aspectRatio: '16 / 9' }}>
      <video src="/camera.mp4" style={{ width: '100%', height: '100%' }} />
      <HudIni
        frame={frame}
        options={{ preset: 'boat' }}
        style={{ position: 'absolute', inset: 0 }}
      />
    </div>
  );
}
```

### Web component

```ts
import { defineHudIni } from 'hud-ini/element';
import type { HudIniElement } from 'hud-ini/element';
import type { HudFrame } from 'hud-ini';

defineHudIni();
const overlay = document.createElement('hud-ini') as HudIniElement;
overlay.style.cssText = 'position:absolute;inset:0';
document.querySelector('#video-container')!.append(overlay);
overlay.options = { preset: 'boat' };
export const update = (frame: HudFrame) => {
  overlay.frame = frame;
};
```

The parent owns the viewport size and must use `position: relative`. Registration is explicit and safe to import during server rendering. Disconnecting the element releases its observer. Reconnecting restores the current frame. Assigning `undefined` clears the overlay.

### Canvas

```ts
import { HudController } from 'hud-ini';
import type { HudFrame } from 'hud-ini';

const hud = new HudController(document.querySelector('#hud')!, { preset: 'boat' });
export const update = (frame: HudFrame) => hud.update(frame);
export const dispose = () => hud.destroy();
```

Size the canvas using CSS. `HudController` handles its pixel resolution and resize lifecycle. `renderHud(context, frame, viewport, options)` is the direct drawing API; it clears its own canvas, so use a separate canvas for media.

## Telemetry and MAVLink

Each numeric reading is `{ value, at, valid? }`. Both `at` and `frame.time` use seconds in the same clock domain. Missing, invalid, non-finite, future and stale readings show unavailable. Zero is valid. **Advance the display clock even when input packets stop.** Set `staleAfterS` for your input rate; the core default is one second.

Tape readouts distinguish `NO DATA`, `STALE`, `INVALID` and `CLOCK` states. Expired actuator commands disappear and their values turn amber. The mode line includes armed state when supplied; both expire with the heartbeat.

```ts
import { MavlinkTelemetry } from 'hud-ini/adapters';

const feed = new MavlinkTelemetry({
  systemId: 42,
  componentId: 1,
  label: 'USV 01',
});
feed.ingest({
  systemId: 42,
  componentId: 1,
  time: 12,
  message: 'ATTITUDE',
  fields: { roll: 0.02, pitch: 0.01, yaw: 1.5 },
});
const frame = feed.snapshot(12);
```

The adapter accepts decoded messages with canonical MAVLink `snake_case` field names and wire units. Supported messages are HEARTBEAT, ATTITUDE, GLOBAL_POSITION_INT, VFR_HUD, SYS_STATUS, NAV_CONTROLLER_OUTPUT and SERVO_OUTPUT_RAW. It filters by system/component identity and prevents old packets from replacing newer readings. Common ArduPilot modes are named by firmware family; other modes remain `MODE n`. It does not infer PX4 mode names.

- Heading is clockwise from north. Roll is positive right-wing-down; pitch is positive nose-up.
- Speed is metres per second. The USV display converts ground speed to knots.
- GLOBAL_POSITION_INT relative altitude is metres above home, labeled `REL HOME`.
- To derive depth from MSL altitude, pass a calibrated `depthOriginM` to `MavlinkTelemetry`. The fixture uses sea surface MSL = 0. Without a reference, depth stays unavailable.
- Course comes from horizontal velocity and stays unavailable below 0.1 m/s.
- `fromPtz()` takes calibrated camera angles. ONVIF normalized positions are not degrees. Supply camera heading separately.

The host owns wire decoding, UDP/WebSocket connections, clock synchronization, video latency and vehicle commands. Decode messages in your transport layer and forward envelopes to the adapter.

### Actuator commands and feedback

Provide `servoOutputs` to `MavlinkTelemetry` with your channel assignments and PWM calibration. The adapter converts SERVO_OUTPUT_RAW to **commands**. Measured actuator feedback stays unavailable until the host supplies independent sensor readings in `frame.outputs[].feedback`.

```ts
const feed = new MavlinkTelemetry({
  systemId: 42,
  servoOutputs: [
    {
      id: 'rudder',
      label: 'Rudder',
      kind: 'steering',
      unit: '°',
      channel: 1,
      pwmMin: 1000,
      pwmNeutral: 1500,
      pwmMax: 2000,
      min: -35,
      max: 35,
      indicator: { position: [0, 0.75], glyph: 'rudder' },
    },
  ],
});
```

These values are an example calibration. Use the installation's measured calibration and configured servo functions. A PWM command does not measure rudder position, thrust or RPM.

`indicator.position` locates a channel on the small vehicle drawing: x runs left to right, y runs bow to stern, both from -1 to 1. The glyph can be `rotor`, `thruster`, `vertical`, `surface`, `rudder` or `drive`. Omit positions to use a neutral gauge layout. Fixture assignments are illustrative and do not establish ArduPilot motor numbering or vehicle geometry.

Cyan arcs, tabs and pointers show commands. White markers show available feedback. The shared `FBK -` key means no current feedback is present. Percent pointers use normalized travel; degree readings use the configured angle calibration. Impeller blades are static symbols and do not imply measured rotation.

Multirotor drawings use equal horizontal and vertical spacing, with values placed radially around the motors. The quad has a square footprint; higher motor counts use circular layouts. This preserves the proportions of the rotor symbols and keeps the corner group compact.

## Appearance

The **Theme** button at the top right of the header opens display palettes, custom HUD colors and instrument fonts. It is available in the vehicle lab and component catalogue. Select Phosphor, Amber or Ice as a starting point, or edit individual values. **Save theme** stores a named theme in this browser; **Reset** returns to the display palette. **Export / import theme** copies or downloads CSS and JSON, and imports saved JSON files. Export a copy to transfer a theme between projects or browsers.

### Stylesheet themes

The Canvas renderer accepts `options.theme`. To author themes in CSS, set inherited variables on the host container and read them with `hudThemeFromCss(container)` after mounting. Call it again when the stylesheet or theme class changes, then update the renderer. The helper does not install observers or apply global styles.

```css
.hud-ini-theme {
  --hud-ini-ink: #f1f8f7;
  --hud-ini-accent: #49ded8;
  --hud-ini-muted: #afcccb;
  --hud-ini-warning: #ffd08a;
  --hud-ini-danger: #ff6b70;
  --hud-ini-panel: #081819;
  --hud-ini-outline: #031012;
  --hud-ini-font-family: Rajdhani, sans-serif;
}
```

```ts
import { HudController, hudThemeFromCss } from 'hud-ini';

const hud = new HudController(canvas);
hud.update(frame, { preset: 'boat', theme: hudThemeFromCss(container) });
```

Site headings, card and dialog titles, and the brand follow `--hud-ini-font-family` at weight 600, matching the HUD. The Theme font selector updates both; body text and controls keep Spectrum typography.

The same object works with `<HudIni options={{ theme }} />`, the web component and `renderHud`. Variables inherit, so separate containers can have separate themes. Unset tokens use the renderer defaults. `hudThemeVariables` exports the mapping between CSS names and `HudTheme` fields. The JSON export wraps these fields in `{ version, name, theme }`; pass its `theme` property to the renderer. Load the selected font before drawing. Canvas geometry is controlled by `HudOptions`, not DOM selectors.

### Size and typography

Use **Instruments → HUD size** to select Small (80%), Medium (100%, default) or Large (120%). The package exposes the same setting as `options.size: 'small' | 'medium' | 'large'`. Text, strokes and drawings scale together around the viewport anchors. Camera projection remains aligned; camera inset width keeps its separate pixel setting. Larger instruments leave less room for optional readouts on narrow views. The selected size survives vehicle changes and appears in the copied React snippet.

The HUD font stack prefers Purista, then Rajdhani. The demo bundles Rajdhani SemiBold under the SIL Open Font License; shell controls use the Adobe Clean Spectrum font loaded by Spectrum. The demo needs access to Adobe Typekit for that font; the browser uses its fallback when offline. Purista files are not bundled. Hosts can load their licensed Purista webfont or install `@fontsource/rajdhani`, import `@fontsource/rajdhani/latin-600.css`, and await `document.fonts.load('600 12px Rajdhani')` before the first canvas draw. Override `theme.fontFamily` for another font.

Set `preset`, individual `panels`, and `theme` in `HudOptions`. All labels and data come from the host. Camera insets remain optional. Primary values sit in small tape readouts; the remaining camera area stays transparent. Small viewports omit secondary text. Graphical thrusters, surfaces, rudders and drives replace repeated actuator rows. The vehicle schematic, commands and feedback key sit together in the lower-left corner above the coordinates. The speed tape leaves room for that group. The compositor preserves circular instruments when resized. The demo shell uses Spectrum 2 design tokens; the library can use any host theme.

The demo's **Corner frame** switch hides the four outer corner marks; **Vehicle drawing** hides the schematic and its actuator readouts. These settings remain selected when switching vehicles and appear in the copied React snippet. In the package, `panels.frame`, `panels.actuators`, `panels.reticle` and `panels.inset` control the corner marks, vehicle drawing, central marker and optional camera inset independently. For example:

```tsx
<HudIni frame={telemetry} options={{ preset: 'multirotor', panels: { frame: false } }} />
```

Vehicle graphics use a compact scale while their numeric readouts retain their text size. The pitch ladder can extend across the open camera area; local clearance masks protect the vehicle drawing, camera inset and control indicators. Only labels that would be cut off are omitted.

Set `verticalFovDeg` to the displayed camera's vertical field of view (default 55°). The aircraft pitch ladder uses that projection for a rectilinear camera aligned with the vehicle body. The demo supplies its current camera FOV. A gimbal offset, lens distortion or cropped video requires host-side calibration before treating the ladder as aligned with the image. The ROV speed tape uses 0.2 m/s divisions; the rover uses 0.5 m/s divisions.

Optional camera insets occupy the lower-right corner above the battery and are hidden on narrow screens. The default width is 240 CSS pixels. Set `inset.width` to request another size; the compositor fits the 4:3 image within available space and keeps the right tape, horizon and control sticks clear. In the lab, enable **Additional instruments → Camera inset** and use the adjacent width slider. The Camera inset inspector in **Components** also exposes this control. For example:

```ts
const options: HudOptions = {
  inset: { image: cameraVideo, at: cameraTimestamp, label: 'CAMERA', width: 320 },
};
```

The battery indicator uses a lightning symbol, an open charge track and an inline percentage. GNSS and radio supplements are omitted when the footer cannot fit them alongside coordinates, mode and power.

### Target and trend cues

The speed, altitude and heading tapes support two independent overlays. **Target markers** draws a hollow triangle attached to the tape rail and a `T` value. **Six-second trends** draws a dashed line from the current-value box to the projected value, labeled `+6s`. Projections inside the value box are omitted. On narrow views, the symbols remain and their labels are omitted. Both switches are beside the primary instrument controls. The component gallery includes speed, altitude and heading examples. On the compass, the target triangle touches the tick scale and the dashed turn trend extends from the centre index. Its label shares the tape row; labels are omitted where they collide.

Use `panels.targets` and `panels.trends` to toggle them. Set `trendSeconds` to change the projection horizon (default 6, constrained to 1-10 seconds). A trend assumes the current climb rate, speed change or heading rate continues; it is a local extrapolation, not an autopilot forecast or trajectory model. Speed changes use pairs of valid samples 0.05-2 seconds apart from the same message source. Gaps reset the trend. Stale, missing and invalid inputs suppress cues.

The MAVLink adapter reads reported `POSITION_TARGET_GLOBAL_INT` and `POSITION_TARGET_LOCAL_NED` targets, honors their ignore masks and rejects outbound `SET_*` commands as telemetry. Horizontal target velocity becomes ground speed. Global target altitude retains its MSL, home-relative or terrain reference. MSL targets can be converted to a home-relative tape using the current paired MSL and relative position. Local-origin or terrain altitude is never silently treated as home-relative altitude. See the [MAVLink target message definitions](https://mavlink.io/en/messages/common.html#POSITION_TARGET_GLOBAL_INT).

Fixed-wing airspeed targets are estimated from `NAV_CONTROLLER_OUTPUT.aspd_error` plus a `VFR_HUD` airspeed sample no more than 0.5 seconds old. ArduPilot's published airspeed error uses cm/s despite the common definition's m/s; the adapter applies the conversion only when the selected heartbeat identifies ArduPilot. This reconstruction assumes both values use the same airspeed convention. See [ArduPlane's sender](https://github.com/ArduPilot/ardupilot/blob/master/ArduPlane/GCS_MAVLink_Plane.cpp). Hosts with a direct setpoint can provide `targetAirSpeedMps` themselves.

Host telemetry fields are `targetHeadingDeg`, `headingRateDegS`, `targetAirSpeedMps`, `targetGroundSpeedMps`, `targetAltitudeM`, `targetAltitudeDatum`, `airAccelerationMps2`, `groundAccelerationMps2` and `climbMps`. Each numeric value uses a timestamped `Reading`. These cues depend on the messages the selected autopilot actually publishes; the HUD does not send stream requests or vehicle commands.

The canvas exposes a text summary. Add a host telemetry table when a complete screen-reader view is required. Demo configuration remains accessible below the viewer on narrow screens.

All independently selectable panels are `frame`, `identity`, `heading`, `bearingMarkers`, `ar`, `arMarkers`, `arRoutes`, `arVolumes`, `arLabels`, `attitude`, `tapes`, `targets`, `trends`, `reticle`, `optics`, `actuators`, `controls`, `position`, `power`, `status`, `messages`, `guidance`, `inset`, `rangefinder`, `camera`, `gps`, `link` and `health`. Panels default to visible when their data is available. The lab initially hides the test camera inset and supplemental sensor panels. Enable them under **Additional instruments**. Supplemental sensor panels are omitted on narrow views.

Desired heading comes from `NAV_CONTROLLER_OUTPUT.nav_bearing` or reported position-target yaw. Waypoint bearing (`target_bearing`) remains separate. Yaw targets honor the ignore bit and require a north-referenced frame; body-relative yaw is not plotted as an absolute heading. The adapter converts `ATTITUDE` body angular rates into heading rate using roll and pitch, and suppresses the result near vertical pitch. See [MAVLink navigation and attitude fields](https://mavlink.io/en/messages/common.html#NAV_CONTROLLER_OUTPUT) and [ArduCopter yaw frame handling](https://github.com/ArduPilot/ardupilot/blob/master/ArduCopter/GCS_MAVLink_Copter.cpp).

### AR objects in the camera view

Enable **Instruments → AR objects (3D)** in the vehicle lab. Additional instruments contains switches for waypoint/home markers, routes/landing zones, vehicle/object volumes and labels. **Components → AR objects** contains five isolated examples. The authored demo geometry stays fixed in the world while the onboard camera moves.

Supply `frame.ar` with a timestamped camera and `HudArObject` entries. Positions use local Cartesian **east, north, up in metres**, with one shared origin. The camera supplies its actual column-major OpenGL view-projection matrix from those coordinates to clip space, plus its position for distance readouts. Include gimbal pose, camera mounting offset, aspect ratio, field of view and zoom in that matrix. Match the matrix timestamp to the displayed video frame. `demo/ar-scene.ts` shows conversion from a Three.js camera.

| Object kind               | Geometry                                                              |
| ------------------------- | --------------------------------------------------------------------- |
| `waypoint`, `home`, `poi` | World-anchored symbol and range                                       |
| `route`                   | Polyline through world positions                                      |
| `corridor`                | Approach volume with cross-sections, width and height in metres       |
| `landing-zone`            | Horizontal ring and landing H with a radius in metres                 |
| `vehicle`, `box`          | Oriented bounds with size in metres; vehicles include a heading arrow |

```ts
const object: HudArObject = {
  id: 'vehicle-2',
  kind: 'vehicle',
  label: 'VEH 02',
  at: videoTime,
  position: [35, 120, 18],
  sizeM: [5, 9, 4],
  headingDeg: 135,
};
frame.ar = { camera: calibratedCamera, objects: [object] };
```

`panels.ar` controls the whole layer; `arMarkers`, `arRoutes`, `arVolumes` and `arLabels` select its parts. Geometry uses the full camera viewport without instrument-clearance masks. Telemetry is drawn over it; object labels avoid occupied readouts and each other. Projection remains aligned at every HUD size. Points behind the camera are omitted, and lines are clipped at the camera frustum before perspective division. The public `projectArPoint` and `projectArSegment` helpers expose the same projection.

Camera and object timestamps expire independently. The renderer limits each scene to 128 current objects and each path to 64 points. hud-ini draws host-supplied geometry; it does not perform object detection or reconstruct a mission from MAVLink. Demo scenes are synthetic and do not establish video calibration or hardware acceptance.

#### Terrain visibility

Import `ArVisibilityResolver` and `createHeightfieldProvider` from **`hud-ini/terrain`**. The optional module evaluates line of sight from the camera to each object's anchor. It accepts a local height grid, or a host-defined provider backed by mesh raycasts, a worker or a terrain service. The Canvas core remains independent of terrain vendors and 3D engines.

Results explicitly distinguish `visible`, `occluded` and `unknown`. Missing tiles, incompatible coordinate frames, expired results and changed camera/target positions cannot become a clear line of sight. The default display dims and dashes blocked objects with an `OCC` label. Unknown results remain visible with `LOS ?`. Set `options.arOcclusion` to `hide` to omit anchor-occluded objects, or `off` to ignore classification. An explicit `object.visible: false` always hides the object. No visibility metadata means unclassified, not verified clear.

The vehicle lab uses a mesh provider against its authored scenery. The **Terrain line of sight** component uses a package-owned height grid with a ridge and missing coverage. Both compute their results from geometry.

Read the [terrain integration guide](terrain.md) for complete setup, reference frames, freshness, cancellation, provider contracts and sampling limits. Copyable examples are included in the npm archive:

- [Height grid](../examples/heightfield.ts): synthetic ridge and missing coverage.
- [Mesh visibility provider](../examples/three-visibility.ts): adapt a host-owned Three.js scene.
- [Depth-tested wireframes](../examples/three-depth.ts): render routes and volumes in the host's 3D pass using the public `arGeometry()` helper.

An anchor test classifies one point. Partial occlusion of a route, landing zone or vehicle requires a shared 3D depth pass. The depth example demonstrates this integration; the Canvas renderer itself accepts neither depth textures nor per-pixel masks. AR geometry retains the full viewport without instrument-clearance masks.

### Compass markers

The compass uses a thin tape with ticks above its labels. A close-fitting rectangular heading readout shares the label row and connects to the centre index, and timestamped marker symbols sit directly on the scale. Use `panels.bearingMarkers` to toggle the markers independently. Markers require a current vehicle heading, wrap through north and use arrows for off-scale bearings. Selected markers take priority when symbols or labels collide.

```ts
frame.bearingMarkers = [
  {
    id: 'wp-3',
    label: 'WP 03',
    symbol: 'diamond',
    selected: true,
    bearingDeg: { value: 156, at: frame.time },
  },
  { id: 'home', label: 'HOME', symbol: 'home', bearingDeg: { value: 108, at: frame.time } },
];
```

`HudBearingMarker` also accepts `circle`, `triangle` and `cross` symbols and an optional CSS `color`. The host supplies bearings in the same north reference as the vehicle heading. Labels can represent waypoints, targets, cameras or other points of interest. The library does not calculate geographic bearings or infer a mission from these markers.

### Sensors and camera payloads

Camera and range readouts share the upper-right area. GNSS sits beside coordinates, radio beside power, and sensor health beneath the vehicle identity. The centre remains available for the onboard view. The kitchen sink includes 11 sensor examples, including missing range validity, GNSS without a fix and a sensor fault.

| Input message                 | Display data                                                  |
| ----------------------------- | ------------------------------------------------------------- |
| `DISTANCE_SENSOR`             | Per-sensor beam distance, orientation, technology and quality |
| `GPS_RAW_INT`                 | Fix type, satellite count and HDOP                            |
| `RC_CHANNELS`, `RADIO_STATUS` | Raw device-specific RSSI                                      |
| `SYS_STATUS`                  | Present, enabled and healthy sensor flags                     |
| `VIDEO_STREAM_STATUS`         | Selected EO/IR stream                                         |
| `CAMERA_CAPTURE_STATUS`       | Camera recording state                                        |
| `CAMERA_THERMAL_RANGE`        | Minimum and maximum temperature                               |

These mappings follow the [MAVLink common messages](https://mavlink.io/en/messages/common.html). Downward range is beam distance, not terrain altitude. Unknown RSSI and quality values remain unavailable. Only host-calibrated `rcSignalPct` uses a percentage; raw RSSI is not converted to dBm or percent. Palette and spot temperature require host data.

Select the camera explicitly when creating the adapter:

```ts
const feed = new MavlinkTelemetry({
  systemId: 42,
  componentId: 1,
  camera: { componentId: 100, deviceId: 0, streamId: 2 },
  radioComponentId: 68,
});
```

The adapter rejects other camera components, devices and streams. Thermal values retain their own timestamps when stream status updates. Set `rangefinderId` in `HudOptions` to select a specific sensor; the default is the first supplied sensor. Demo sensor and camera values are authored display samples, separate from the recorded vehicle trajectories. This set does not cover every optional ArduPilot message or payload.

## Alerts and autopilot guidance

Supply reported conditions and instructions in the same clock domain as `frame.time`:

```ts
const frame: HudFrame = {
  time: 12,
  source: 'live',
  label: 'USV 01',
  alerts: [
    {
      id: 'navigation-quality',
      severity: 'warning',
      message: 'GNSS accuracy degraded',
      source: 'AUTOPILOT',
      at: 12,
      expiresAt: 22,
    },
  ],
  guidance: {
    at: 12,
    source: 'AUTOPILOT',
    instruction: 'HOLD POSITION',
    detail: 'Position hold active',
  },
};
```

`HudAlert.severity` accepts `info`, `warning`, `critical` and `emergency`. The highest severity appears first, with the newest event breaking ties and a count for additional active messages. Symbols and severity text distinguish each level. Emergency also colours the optional corner frame. `theme.danger` controls the red accent. The full active messages remain in the canvas's accessible summary.

Alerts expire at `expiresAt`, or ten seconds after `at` when omitted. Future, invalid and expired events are hidden. For an ongoing condition, the host must refresh its timestamp while that condition remains active and remove it when cleared. The package does not acknowledge or latch alarms. The older `alert` string remains supported; use `alerts` for severity and expiration.

Guidance expires with `staleAfterS`, just like telemetry. The HUD replaces expired instructions with a stale indication and removes their text from the accessible summary. Supply the instruction and any detail explicitly; the renderer does not infer operator actions from navigation targets or mode names. These fields display guidance and never send vehicle commands.

### MAVLink status text

The adapter accepts the decoded numeric fields plus the `STATUSTEXT` text field:

```ts
feed.ingest({
  systemId: 42,
  componentId: 1,
  time: 12,
  message: 'STATUSTEXT',
  fields: { severity: 4, id: 0, chunk_seq: 0 },
  text: 'GNSS accuracy degraded',
});
```

For a split message, pass each packet's `id`, `chunk_seq` and original text bytes as a `Uint8Array`. The adapter waits for the final chunk before showing the message. Reassembly preserves UTF-8 characters split across packets, rejects gaps and times out after two seconds between chunks. It limits pending messages to 16, text to 1,000 bytes and retained alerts to 16. The host still owns wire decoding and clock alignment.

MAVLink severity 0 maps to emergency, 1 through 3 to critical, 4 to warning and 5 through 7 to information. Message layout and severity definitions follow the [MAVLink specification](https://mavlink.io/en/messages/common.html#STATUSTEXT). Status text remains a reported event; it is not parsed into an executable instruction.
