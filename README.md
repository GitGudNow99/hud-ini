<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/GitGudNow99/hud-ini/main/assets/brand/hud-ini-lockup-dark.svg">
    <img src="https://raw.githubusercontent.com/GitGudNow99/hud-ini/main/assets/brand/hud-ini-lockup.svg" alt="hud-ini" width="272" height="64">
  </picture>
</h1>

Composable Canvas HUD instruments for vehicle telemetry, camera overlays and recorded replay.

[npm package](https://www.npmjs.com/package/hud-ini) · [Source](https://github.com/GitGudNow99/hud-ini) · [Issues](https://github.com/GitGudNow99/hud-ini/issues)

- Transparent instruments for aircraft, multirotors, VTOL, rovers, boats, submersibles and PTZ cameras.
- Framework-independent Canvas API, web component and optional React component.
- Timestamp-aware readings, MAVLink adapters, configurable labels and CSS theme tokens.
- World-space markers, routes and vehicle bounds with optional terrain visibility checks.
- TypeScript declarations, no runtime dependencies in the core, and entry points safe to import during server rendering.

## Installation

```sh
npm install hud-ini
```

For React applications, install React 18 or 19 in the host application. Other entry points do not require React. hud-ini ships ES modules and supports TypeScript's `NodeNext` and `Bundler` module resolution. Server imports require Node.js 22.12 or newer; use Node.js 24 for development. Rendering requires a browser with Canvas 2D and `ResizeObserver`.

Install the library from [npm](https://www.npmjs.com/package/hud-ini). To build or test the library from source, follow the [contributing guide](CONTRIBUTING.md).

## Canvas

Size a canvas with CSS, then pass frames to its controller:

```ts
import { HudController } from 'hud-ini';
import type { HudFrame } from 'hud-ini';

export function mountHud(canvas: HTMLCanvasElement) {
  const hud = new HudController(canvas, { preset: 'boat' });
  return {
    update: (frame: HudFrame) => hud.update(frame),
    dispose: () => hud.destroy(),
  };
}
```

The controller handles device pixel ratio, resizing and accessibility text. Call `dispose()` when removing the view. For direct drawing, use `renderHud(context, frame, viewport, options)` on a dedicated overlay canvas.

## React

```tsx
import { HudIni } from 'hud-ini/react';
import type { HudFrame } from 'hud-ini';

export function CameraView({ frame }: { frame: HudFrame }) {
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

The parent defines the viewport. The component starts drawing after mounting and releases its resize observer when unmounted.

## Web component

```ts
import { defineHudIni } from 'hud-ini/element';
import type { HudIniElement } from 'hud-ini/element';
import type { HudFrame } from 'hud-ini';

defineHudIni();

export function updateHud(element: HudIniElement, frame: HudFrame) {
  element.options = { preset: 'boat' };
  element.frame = frame;
}
```

Place `<hud-ini>` inside a sized container. Registration is explicit. Removing the element releases its observer; reconnecting restores its frame. Assign `undefined` to `frame` to clear the overlay.

## Entry points

| Import             | Purpose                                                                            |
| ------------------ | ---------------------------------------------------------------------------------- |
| `hud-ini`          | Canvas renderer and controller, themes, presets, telemetry helpers and AR geometry |
| `hud-ini/react`    | `HudIni` and `HudIniProps`                                                         |
| `hud-ini/element`  | `defineHudIni` and `HudIniElement`                                                 |
| `hud-ini/adapters` | `MavlinkTelemetry`, `fromPtz` and adapter types                                    |
| `hud-ini/terrain`  | Height-grid visibility provider and asynchronous resolver                          |

## Telemetry

Each numeric reading carries its value and observation time:

```ts
import type { HudFrame } from 'hud-ini';

const frame: HudFrame = {
  time: 12,
  label: 'USV 01',
  source: 'live',
  headingDeg: { value: 85, at: 12 },
  groundSpeedMps: { value: 3.2, at: 12 },
};
```

`time` and `at` use seconds in the same clock domain. Advance the display clock during input outages so stale readings expire. Missing, invalid and future readings remain unavailable; zero is a valid measurement. The host owns transport, video, clock synchronization and vehicle commands.

The MAVLink adapter accepts decoded envelopes and converts wire units to HUD readings. Boats use speed and course over ground. Depth requires an explicit surface reference. PTZ input angles must already be calibrated.

## Documentation

- [API guide](docs/api.md): vehicle profiles, telemetry, themes, instruments, sensors and AR.
- [Terrain guide](docs/terrain.md): height grids, provider contracts and partial occlusion.
- [Height-grid example](examples/heightfield.ts), [mesh provider](examples/three-visibility.ts) and [depth rendering](examples/three-depth.ts). The last two examples require Three.js in the host application.
- [Demo website](demo/README.md): interactive previews, vehicle scenarios and searchable documentation.
- [Contributing](CONTRIBUTING.md): development, validation and release commands.

## License

[GPL-2.0-or-later](LICENSE). See [third-party notices](NOTICE.md) for demo resources and their separate licenses.
