import { vehiclePresets } from '../src/index.js';

export interface DocSection {
  id: string;
  title: string;
  paragraphs: string[];
  code?: { label: string; value: string }[];
  table?: { columns: string[]; rows: string[][] };
  links?: { label: string; href: string }[];
}
export interface DocPage {
  id: string;
  title: string;
  description: string;
  group: string;
  sections: DocSection[];
}

export const reactExample = `import { HudIni } from '@gitgudnow99/hud-ini/react';
import type { HudFrame } from '@gitgudnow99/hud-ini';

export function CameraView({ frame }: { frame: HudFrame }) {
  return (
    <div style={{ position: 'relative', aspectRatio: '16 / 9' }}>
      <video src="/camera.mp4" autoPlay muted playsInline
        style={{ display: 'block', width: '100%', height: '100%' }} />
      <HudIni frame={frame} options={{ preset: 'boat' }}
        style={{ position: 'absolute', inset: 0 }} />
    </div>
  );
}`;

export const documentation: DocPage[] = [
  {
    id: 'getting-started',
    title: 'Getting started',
    group: 'Start here',
    description: 'Add a transparent telemetry layer to your camera or 3D view.',
    sections: [
      {
        id: 'installation',
        title: 'Install the package',
        paragraphs: [
          'Install @gitgudnow99/hud-ini from the public npm registry in your application.',
          'The Canvas core has no runtime dependencies. React 18 or 19 is an optional peer for the React component. The demo uses Spectrum 2 and Three.js; neither is required by your HUD integration.',
        ],
        code: [{ label: 'npm', value: 'npm install @gitgudnow99/hud-ini' }],
        links: [
          { label: 'Package on npm', href: 'https://www.npmjs.com/package/@gitgudnow99/hud-ini' },
          { label: 'Source on GitHub', href: 'https://github.com/GitGudNow99/hud-ini' },
          { label: 'Report an issue', href: 'https://github.com/GitGudNow99/hud-ini/issues' },
        ],
      },
      {
        id: 'first-overlay',
        title: 'Render your first overlay',
        paragraphs: [
          'Place the HUD over a parent-sized video. Replace /camera.mp4 with your media source and pass a HudFrame from your application. The parent defines the viewport; hud-ini manages the canvas resolution.',
        ],
        code: [{ label: 'React · CameraView.tsx', value: reactExample }],
      },
      {
        id: 'next-steps',
        title: 'Connect your data',
        paragraphs: [
          'Every reading carries its observation time. Keep the display clock moving during an input outage so stale telemetry expires. Use the MAVLink adapter for decoded autopilot messages or supply HudFrame directly.',
        ],
        links: [
          { label: 'Telemetry and MAVLink', href: '#docs/telemetry' },
          { label: 'Explore components', href: '#components' },
          { label: 'Open vehicle lab', href: '#lab' },
        ],
      },
    ],
  },
  {
    id: 'rendering',
    title: 'Rendering',
    group: 'Start here',
    description: 'React, a web component and direct Canvas drawing share the same renderer.',
    sections: [
      {
        id: 'react',
        title: 'React component',
        paragraphs: [
          'Import HudIni from @gitgudnow99/hud-ini/react. Pass a new frame as telemetry or the display clock changes. The component releases its resize observer when unmounted. Entry points are safe to import during server rendering; canvas drawing starts after mounting.',
        ],
        code: [{ label: 'React', value: reactExample }],
      },
      {
        id: 'canvas',
        title: 'Canvas controller',
        paragraphs: [
          'Use HudController for a framework-independent view. Size the canvas with CSS, call update when the frame changes, and call destroy when removing the view. The controller handles device pixel ratio and resize events.',
        ],
        code: [
          {
            label: 'TypeScript',
            value: `import { HudController } from '@gitgudnow99/hud-ini';
import type { HudFrame } from '@gitgudnow99/hud-ini';

export function mountHud(canvas: HTMLCanvasElement) {
  const hud = new HudController(canvas, { preset: 'boat' });
  return {
    update: (frame: HudFrame) => hud.update(frame),
    dispose: () => hud.destroy(),
  };
}`,
          },
        ],
      },
      {
        id: 'web-component',
        title: 'Web component',
        paragraphs: [
          'Register hud-ini explicitly. Its parent must be positioned and have a size. Removing the element releases its observer; reconnecting restores the current frame. Assign undefined to frame to clear the overlay.',
        ],
        code: [
          {
            label: 'TypeScript',
            value: `import { defineHudIni } from '@gitgudnow99/hud-ini/element';
import type { HudIniElement } from '@gitgudnow99/hud-ini/element';
import type { HudFrame } from '@gitgudnow99/hud-ini';

export function mountHud(parent: HTMLElement, frame: HudFrame) {
  defineHudIni();
  const hud = document.createElement('hud-ini') as HudIniElement;
  hud.style.cssText = 'position:absolute;inset:0';
  hud.options = { preset: 'boat' };
  hud.frame = frame;
  parent.append(hud);
  return hud;
}`,
          },
        ],
      },
      {
        id: 'recorded-video',
        title: 'Recorded video',
        paragraphs: [
          'Place a video element beneath the HUD canvas. Keep the media aspect ratio and use your camera calibration for attitude and AR. For recorded flight logs, convert video.currentTime to the log clock, including the recording offset, before selecting the telemetry sample.',
          'The home page uses a licensed aerial recording from Mixkit, with independently authored telemetry to demonstrate the instruments. Those values are not measurements from the recording. Attitude, AR, position and navigation cues are hidden because the clip has no calibrated camera pose or associated flight log. Desktop video is cropped to a wide viewport without stretching.',
          'The demo plays a local, silent H.264 copy. Pause stops both video and telemetry; reduced-motion preferences start it paused. The footage is only part of the website and is excluded from the npm package.',
        ],
        links: [
          {
            label: 'Original footage on Mixkit',
            href: 'https://mixkit.co/free-stock-video/flying-over-a-beautiful-tropical-landscape-5369/',
          },
          { label: 'Mixkit video license', href: 'https://mixkit.co/license/#videoFree' },
        ],
      },
      {
        id: 'backend',
        title: 'Drawing backend',
        paragraphs: [
          'Instruments, text, vehicle schematics and projected AR wireframes use CanvasRenderingContext2D. Video, 3D scenery and transport remain in your application.',
          'For direct drawing, renderHud(context, frame, viewport, options) clears its canvas before painting. Give the HUD a separate canvas from your video or scene.',
        ],
      },
    ],
  },
  {
    id: 'telemetry',
    title: 'Telemetry and MAVLink',
    group: 'Integration',
    description: 'Preserve source identity, engineering units and observation times.',
    sections: [
      {
        id: 'readings',
        title: 'The frame contract',
        paragraphs: [
          'A reading is { value, at, valid? }. Both at and frame.time use seconds in one clock domain. Zero is valid; missing, invalid, non-finite, future and stale samples remain unavailable.',
          'Advance frame.time even when packets stop. Do not rewrite observation times on each render. The default staleAfterS is one second; set it to suit the actual update rate.',
        ],
        code: [
          {
            label: 'TypeScript · Minimal frame',
            value: `import type { HudFrame } from '@gitgudnow99/hud-ini';

export const frame: HudFrame = {
  time: 12,
  source: 'demo',
  label: 'USV 01',
  headingDeg: { value: 142, at: 12 },
  groundSpeedMps: { value: 4.5, at: 12 },
  courseDeg: { value: 148, at: 12 },
  batteryPct: { value: 86, at: 12 },
};`,
          },
        ],
        table: {
          columns: ['Quantity', 'Input convention'],
          rows: [
            ['Time', 'Seconds, shared by observations and display clock'],
            ['Heading', 'Degrees clockwise from north'],
            ['Roll / pitch', 'Degrees; right-wing-down / nose-up positive'],
            ['Speed / climb', 'Metres per second; climb positive up'],
            ['Altitude / depth', 'Metres with an explicit vertical reference'],
          ],
        },
      },
      {
        id: 'adapter',
        title: 'Decode before ingestion',
        paragraphs: [
          'MavlinkTelemetry accepts decoded envelopes with canonical snake_case field names and MAVLink wire units. Select the system and component explicitly. The adapter converts units, filters identity and rejects older observations that arrive late.',
        ],
        code: [
          {
            label: 'TypeScript',
            value: `import { MavlinkTelemetry } from '@gitgudnow99/hud-ini/adapters';

export const feed = new MavlinkTelemetry({
  systemId: 42, componentId: 1, label: 'USV 01',
});
feed.ingest({
  systemId: 42, componentId: 1, time: 12,
  message: 'ATTITUDE',
  fields: { roll: 0.02, pitch: 0.01, yaw: 1.5 },
});
export const frame = feed.snapshot(12);`,
          },
        ],
      },
      {
        id: 'clock',
        title: 'Keep freshness independent of packets',
        paragraphs: [
          'Drive snapshot from a continuing display clock. In this example, envelope times must already be normalized to performance.now() / 1000. For replay or delayed video, use the corresponding playback clock instead.',
        ],
        code: [
          {
            label: 'TypeScript',
            value: `import { HudController } from '@gitgudnow99/hud-ini';
import { MavlinkTelemetry } from '@gitgudnow99/hud-ini/adapters';

export function startDisplay(canvas: HTMLCanvasElement, feed: MavlinkTelemetry) {
  const hud = new HudController(canvas);
  let request = 0;
  const draw = () => {
    hud.update(feed.snapshot(performance.now() / 1000));
    request = requestAnimationFrame(draw);
  };
  draw();
  return () => { cancelAnimationFrame(request); hud.destroy(); };
}`,
          },
        ],
      },
      {
        id: 'ownership',
        title: 'Transport and commands',
        paragraphs: [
          'Your application owns UDP/WebSocket transport, wire decoding, video alignment and vehicle commands. hud-ini displays telemetry and guidance. It does not connect to an aircraft or send autopilot commands.',
          'The demo scenarios are authored synthetic trajectories encoded and decoded through MAVLink 2. They do not execute ArduPilot firmware or Gazebo physics.',
        ],
        links: [{ label: 'Fixture provenance', href: './fixtures/manifest.json' }],
      },
    ],
  },
  {
    id: 'vehicles',
    title: 'Vehicle profiles',
    group: 'Integration',
    description: 'Choose instruments and actuator drawings for the vehicle you are displaying.',
    sections: [
      {
        id: 'presets',
        title: 'Available presets',
        paragraphs: [
          'Set options.preset explicitly, or use presetForMavType() with a MAVLink vehicle type. Unsupported types fall back to generic. A profile is a display template, not a firmware compatibility claim.',
        ],
        table: {
          columns: ['Preset', 'Profile', 'Speed / secondary'],
          rows: vehiclePresets.map((p) => [p.id, p.label, `${p.speed} / ${p.secondary}`]),
        },
        code: [
          {
            label: 'TypeScript',
            value: `import { presetForMavType } from '@gitgudnow99/hud-ini';
import type { HudOptions } from '@gitgudnow99/hud-ini';

export const options: HudOptions = {
  preset: presetForMavType(11).id,
  size: 'medium',
};`,
          },
        ],
      },
      {
        id: 'marine-camera',
        title: 'Marine and camera references',
        paragraphs: [
          'USVs display speed over ground in knots and course over ground separately from body heading. Input groundSpeedMps remains metres per second. Depth needs an explicit surface datum; pass depthOriginM to the MAVLink adapter when converting MSL altitude.',
          'fromPtz() accepts calibrated pan and tilt angles in degrees. ONVIF normalized positions are not angles. Supply camera heading separately and keep its timestamp aligned with the displayed video.',
        ],
        links: [
          { label: 'Try a USV', href: '#lab/boat' },
          { label: 'Try a PTZ camera', href: '#lab/ptz' },
        ],
      },
      {
        id: 'actuators',
        title: 'Commands and measured feedback',
        paragraphs: [
          'Map servo channels with the installation’s channel assignments and measured PWM calibration. SERVO_OUTPUT_RAW represents commands. Supply measured feedback independently through frame.outputs[].feedback.',
          'Actuator indicator positions use normalized schematic coordinates: x points right and y points aft, both from -1 to 1. Rotor, thruster, surface, rudder and drive glyphs are available. Drawings do not establish motor numbering or measured propeller rotation.',
        ],
        links: [{ label: 'Inspect a vehicle drawing', href: '#components/vehicle-boat-11' }],
      },
    ],
  },
  {
    id: 'instruments',
    title: 'Instruments and states',
    group: 'Configure',
    description: 'Select the readouts, cues and operational states that belong in your view.',
    sections: [
      {
        id: 'panels',
        title: 'Compose the overlay',
        paragraphs: [
          'HudOptions.panels enables or hides individual instruments. The vehicle lab generates a React configuration from your selections. Use the component catalogue to inspect one instrument against current, stale or missing data.',
        ],
        code: [
          {
            label: 'TypeScript',
            value: `import type { HudOptions } from '@gitgudnow99/hud-ini';

export const options: HudOptions = {
  preset: 'plane', size: 'small', staleAfterS: 1,
  panels: {
    frame: false, heading: true, attitude: true, tapes: true,
    targets: true, trends: true, actuators: false,
    messages: true, guidance: true,
  },
};`,
          },
        ],
      },
      {
        id: 'targets',
        title: 'Targets and trends',
        paragraphs: [
          'Desired speed, altitude and heading attach to their tapes. They remain separate from the bearing to a waypoint. The trend indicator extrapolates the measured rate over six seconds by default; trendSeconds accepts 1 to 10 seconds.',
          'A trend is a constant-rate display projection, not an autopilot forecast. Altitude targets must use a compatible datum. Missing rates and expired targets remain unavailable.',
        ],
        links: [
          { label: 'Heading targets', href: '#components/heading-cues' },
          { label: 'Browse instruments', href: '#components' },
        ],
      },
      {
        id: 'alerts',
        title: 'Alerts and guidance',
        paragraphs: [
          'Alerts support info, warning, critical and emergency severity. Each event has a timestamp and can specify expiresAt. Guidance is a separate display-only instruction and expires with telemetry freshness.',
        ],
        code: [
          {
            label: 'TypeScript',
            value: `import type { HudFrame } from '@gitgudnow99/hud-ini';

export const frame: HudFrame = {
  time: 12, source: 'demo', label: 'USV 01',
  alerts: [{
    id: 'power-low', severity: 'warning',
    message: 'LOW BATTERY', at: 12, expiresAt: 22,
  }],
  guidance: {
    at: 12, instruction: 'RETURN TO HOME',
    detail: 'Follow the assigned route', source: 'Autopilot',
  },
};`,
          },
        ],
      },
      {
        id: 'sensors',
        title: 'Sensors and camera insets',
        paragraphs: [
          'Rangefinders, EO/IR camera metadata, temperatures, GNSS fix quality, radio links and sensor health retain independent observation times. Range measures distance along a beam; it does not imply altitude above terrain.',
          'For a camera inset, pass options.inset with image, at and label. Width defaults to 240 CSS pixels and fits available corner space. The compositor preserves the image aspect ratio and hides the inset on narrow screens.',
        ],
      },
    ],
  },
  {
    id: 'themes',
    title: 'Themes and sizing',
    group: 'Configure',
    description: 'Match the instruments to your application without coupling to its UI framework.',
    sections: [
      {
        id: 'tokens',
        title: 'Set a HUD theme',
        paragraphs: [
          'Use Theme in the header to edit colours, preview a font and export CSS or JSON. Named themes stay in this browser. The exported theme property can be passed directly as options.theme.',
        ],
        code: [
          {
            label: 'TypeScript',
            value: `import type { HudOptions } from '@gitgudnow99/hud-ini';

export const options: HudOptions = {
  preset: 'boat',
  theme: {
    ink: '#f1f8f7', accent: '#49ded8', muted: '#afcccb',
    warning: '#ffd08a', danger: '#ff6b70',
    panel: '#081819', outline: '#031012',
    fontFamily: 'Rajdhani, sans-serif',
  },
};`,
          },
        ],
      },
      {
        id: 'css',
        title: 'Use stylesheet variables',
        paragraphs: [
          'Set variables on the HUD container, then call hudThemeFromCss(container) after mounting. Read them again when your stylesheet or theme changes and update the renderer. The helper does not observe style changes.',
        ],
        code: [
          {
            label: 'CSS',
            value: `.mission-hud {
  --hud-ini-ink: #f1f8f7;
  --hud-ini-accent: #49ded8;
  --hud-ini-muted: #afcccb;
  --hud-ini-warning: #ffd08a;
  --hud-ini-danger: #ff6b70;
  --hud-ini-panel: #081819;
  --hud-ini-outline: #031012;
  --hud-ini-font-family: Rajdhani, sans-serif;
}`,
          },
          {
            label: 'TypeScript',
            value: `import { HudController, hudThemeFromCss } from '@gitgudnow99/hud-ini';
import type { HudFrame } from '@gitgudnow99/hud-ini';

export function applyTheme(hud: HudController, container: HTMLElement, frame: HudFrame) {
  hud.update(frame, { preset: 'boat', theme: hudThemeFromCss(container) });
}`,
          },
        ],
      },
      {
        id: 'size-font',
        title: 'Size and typography',
        paragraphs: [
          'Choose small (80%), medium (100%) or large (120%) with options.size. Text, strokes and vehicle drawings scale together while camera projection stays aligned. Camera inset width is a separate pixel setting.',
          'Load your chosen font before the first canvas draw. The demo bundles Rajdhani SemiBold. Purista is supported when you supply your licensed font files; it is not bundled. Spectrum’s application theme and the Canvas HUD theme remain separate.',
        ],
      },
    ],
  },
  {
    id: 'ar',
    title: 'World-space AR',
    group: 'Spatial overlays',
    description:
      'Project waypoints, routes, landing zones and object bounds into a calibrated camera.',
    sections: [
      {
        id: 'coordinates',
        title: 'Share one world frame',
        paragraphs: [
          'Object coordinates are metres in local east, north, up order. Camera and objects must share one origin and vertical datum. Supply the actual displayed camera’s column-major OpenGL clip-from-ENU viewProjection matrix, including crop, aspect ratio, pose and zoom.',
          'referenceFrame identifies that origin and datum. It is required for terrain providers. A camera position and heading alone are insufficient to align AR with video.',
        ],
      },
      {
        id: 'objects',
        title: 'Add objects',
        paragraphs: [
          'Provide stable IDs and source observation times. hud-ini clips geometry against the camera frustum and removes stale camera/object data. Instrument masks do not clip AR lines; labels reserve space around telemetry.',
        ],
        code: [
          {
            label: 'TypeScript',
            value: `import type { HudArCamera, HudArScene } from '@gitgudnow99/hud-ini';

export function makeScene(camera: HudArCamera, at: number): HudArScene {
  return {
    referenceFrame: 'site-enu-v1', camera,
    objects: [
      { id: 'wp-3', kind: 'waypoint', label: 'WP 03',
        position: [20, 150, 15], at },
      { id: 'route', kind: 'route', label: 'ROUTE',
        points: [[0, 30, 5], [20, 150, 15]], at },
      { id: 'lz', kind: 'landing-zone', label: 'LZ',
        position: [20, 150, 0], radiusM: 8, at },
    ],
  };
}`,
          },
        ],
      },
      {
        id: 'visibility',
        title: 'Choose a visibility policy',
        paragraphs: [
          'arMarkers, arRoutes, arVolumes and arLabels control AR categories. An explicit object.visible: false always hides that object. Terrain classifications can dim or hide anchor-occluded objects; unknown results stay visible.',
        ],
        links: [
          { label: 'Terrain occlusion', href: '#docs/terrain' },
          { label: 'AR examples', href: '#components/ar-markers' },
        ],
      },
    ],
  },
  {
    id: 'terrain',
    title: 'Terrain occlusion',
    group: 'Spatial overlays',
    description: 'Connect your terrain source through an optional visibility provider.',
    sections: [
      {
        id: 'height-grid',
        title: 'Start with a height grid',
        paragraphs: [
          'createHeightfieldProvider consumes resident height samples. It performs no downloads. Your application loads the terrain and converts it into the same local frame as the camera and objects.',
          'The example grid contains an 8 m ridge. East increases across columns; north increases across rows. Heights use the scene’s up datum.',
        ],
        code: [
          {
            label: 'TypeScript',
            value: `import { ArVisibilityResolver, createHeightfieldProvider } from '@gitgudnow99/hud-ini/terrain';
import type { HudArScene } from '@gitgudnow99/hud-ini';

const provider = createHeightfieldProvider({
  referenceFrame: 'site-enu-v1', origin: [-10, 0],
  columns: 3, rows: 5, cellSizeM: 10,
  heights: new Float32Array([
    0, 0, 0,  0, 0, 0,  8, 8, 8,  0, 0, 0,  0, 0, 0,
  ]),
});
export const visibility = new ArVisibilityResolver(provider, { maxAgeS: 1 });

export async function classifySnapshot(scene: HudArScene, time: number) {
  await visibility.update(scene, time);
  return visibility.apply(scene, time);
}
// Call visibility.destroy() when removing this view.`,
          },
        ],
      },
      {
        id: 'live',
        title: 'Evaluate without blocking the display',
        paragraphs: [
          'For live video, schedule visibility.update(scene, time) when a calibrated snapshot is available. Keep rendering and call visibility.apply(frame.ar, frame.time) on display updates. Do not await terrain services inside the drawing callback.',
          'A result only applies to the same reference frame and exact camera/anchor positions. Freshness starts at the oldest input timestamp. Movement makes the result unknown until reevaluated; late responses do not refresh old observations. Starting a new evaluation cancels the previous request.',
        ],
      },
      {
        id: 'policy',
        title: 'Visible, occluded and unknown',
        paragraphs: [
          'arOcclusion accepts dim, hide or off. Dim is the default. Unknown coverage stays visible with LOS ?. Missing metadata leaves an object unclassified. Explicit host visibility filters always apply.',
        ],
        table: {
          columns: ['Result', 'Default display'],
          rows: [
            ['Visible', 'Normal symbol and geometry'],
            ['Occluded', 'Dimmed geometry and OCC label'],
            ['Unknown / expired', 'Visible geometry with LOS ?'],
            ['Not classified', 'Original geometry; no visibility assertion'],
          ],
        },
      },
      {
        id: 'provider',
        title: 'Use a mesh, worker or service',
        paragraphs: [
          'Implement ArVisibilityProvider.evaluate(request, signal) to return visible, occluded or unknown for each target ID. Forward cancellation to your worker or transport. Report missing tiles as unknown. Call invalidate() when geometry changes in place.',
          'A height grid cannot represent bridges, overhangs or tunnels, and thin obstructions between samples can be missed. A mesh provider is appropriate for those structures.',
        ],
      },
      {
        id: 'depth',
        title: 'Partial occlusion needs a shared depth pass',
        paragraphs: [
          'The Canvas classification describes one anchor, not every pixel of a route or vehicle. Use arGeometry(object) with your host 3D renderer to depth-test individual line segments against terrain. Render terrain depth first and disable duplicate Canvas geometry with panels.ar: false.',
          'Canvas 2D does not consume a scene depth buffer. Real video needs calibrated blocking geometry or registered depth, aligned with the camera pose, crop and time.',
        ],
        links: [{ label: 'Inspect terrain visibility', href: '#components/ar-terrain' }],
      },
    ],
  },
];
