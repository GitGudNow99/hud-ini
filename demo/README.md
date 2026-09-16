# Demo website

Open the [live demo](https://gitgudnow99.github.io/hud-ini/) or [online documentation](https://gitgudnow99.github.io/hud-ini/#docs/getting-started) on GitHub Pages.

This website demonstrates the [hud-ini npm package](https://www.npmjs.com/package/@gitgudnow99/hud-ini). To use the library in your application, run `npm install @gitgudnow99/hud-ini` and follow the [installation guide](../README.md#installation).

To run the website, clone the [source repository](https://github.com/GitGudNow99/hud-ini) and install its development dependencies:

```sh
git clone https://github.com/GitGudNow99/hud-ini.git
cd hud-ini
npm ci
npm run dev
```

Open [Home](http://127.0.0.1:5198/) for recorded footage with a configurable HUD, or [Docs](http://127.0.0.1:5198/#docs/getting-started) for installation, rendering, telemetry, vehicle profiles, instruments, themes, AR and terrain occlusion. Documentation includes searchable topics, direct section links and copyable code examples. It remains accessible when demo fixtures fail to load.

The home recording is [Mixkit item 5369](https://mixkit.co/free-stock-video/flying-over-a-beautiful-tropical-landscape-5369/), used under its Stock Video Free License. The telemetry is illustrative and independent of the recording. The silent local video pauses with the HUD; reduced-motion preferences start it paused. All home profile choices use the same aerial clip. See [media provenance](public/media/README.md) for licensing, processing and hashes. The media is excluded from the npm package.

Open [Vehicle lab](http://127.0.0.1:5198/#lab). Choose a vehicle profile and MAVLink type, play or seek the scenario, configure the instruments, and test their contrast over white video. The **Vehicle label** field replaces the displayed identity. **Freeze telemetry** exercises missing-data behavior. The page uses Adobe React Spectrum 2. **Theme** stays in the top-right header; Bright and Day use Spectrum's light appearance, while Dusk and Night use its dark appearance. Night also adjusts the HUD colors and scene lighting.

The repository contains 24 deterministic scenarios. They are encoded and decoded through MAVLink 2 before recording. The procedural 3D scenes use the same pose samples as the HUD. The scenarios use synthetic kinematics and do not validate vehicle physics or firmware.

### Component kitchen sink

Open [Components](http://127.0.0.1:5198/#components) for 70 instrument, vehicle and state examples. Each card is a link to a component page with **Preview**, **Code** and **Sample data** tabs. URLs such as `#components/heading` support bookmarks, reloads and browser navigation. Search and category selection survive a visit to a component page.

Visible cards animate on one shared clock. **Pause previews** stops motion; reduced-motion preferences start previews paused. Off-screen cards and hidden browser tabs stop drawing. Samples combine recorded fixture trajectories with authored control, sensor and camera motion. The terrain example retains a fixed, evaluated camera and its visible, occluded and unknown results. Static symbols remain static. Stale and missing data stay unavailable during animation. The data tab captures a stable snapshot for inspection and copying.

The demo frontend uses [Adobe React Spectrum 2](https://react-spectrum.adobe.com/getting-started), including its navigation, cards, pickers, sliders, color controls, dialogs and icons. The lab and catalogue use the public Canvas renderer. Frontend dependencies remain development-only; the component package keeps its optional React entry point and dependency-free core.

The lab's **Display state** selector previews information, warning, critical and emergency messages, return-to-home guidance, position hold, landing and stale guidance. **Additional instruments** contains secondary readouts and the synthetic camera inset. The shell uses Spectrum icons for navigation, playback and actions. Vehicle glyphs use Spectrum's `createIcon` adapter to retain their domain-specific silhouettes and inherited sizing.

## Development

GitHub Actions deploys `demo-dist/` to GitHub Pages after validation passes on `main`. Pull requests run validation without deploying. The website uses relative asset URLs and hash navigation so it works under the repository's `/hud-ini/` path.

Import application controls from `@react-spectrum/s2`. Compose layouts with the `style` macro in `demo/layout.ts`; let Spectrum own component colors, typography, focus rings and internal spacing. Vite runs `unplugin-parcel-macros` before the React plugin and uses Lightning CSS to combine and minimize the generated styles. Do not add a second component styling system. The published HUD entry points do not import Spectrum or its stylesheet.
