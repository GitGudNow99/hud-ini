# Contributing

Use Node.js 24 and npm for development. Install the locked development dependencies:

```sh
npm ci
npx playwright install chromium
```

## Development

```sh
npm run dev
```

The demo runs at `http://127.0.0.1:5198`. See the [demo guide](demo/README.md) for its pages and fixtures.

`npm run build` produces the library and declarations in `dist/`. Each build removes the previous library output. `npm run build:demo` builds the separate website in `demo-dist/`.

Pushes to `main` deploy the [public website](https://gitgudnow99.github.io/hud-ini/) after the Node.js 22 and 24 validation jobs pass. The CI workflow builds and deploys the Pages artifact. Pull requests never deploy.

## Package boundaries

- Keep the Canvas core free of runtime dependencies. React is an optional peer behind `@gitgudnow99/hud-ini/react`.
- Keep every entry point safe to import without a DOM. Initialize browser resources only when mounting or registering a component.
- `src/render.ts` owns instrument layout and typography. `src/controller.ts` owns canvas resolution and lifecycle for both wrappers.
- `src/presets.ts` maps vehicle families. The MAVLink adapter owns units, identity, per-message freshness and firmware mode semantics.
- Labels and branding come from the host. Preserve missing values and observation timestamps. Advance the display clock during input outages.
- Use speed and course over ground for boats. Depth requires a surface reference. Camera normalized coordinates are not angles.
- After changing exports, check the entry-point barrels, package export map and all importers.

## Validation

Run these checks before submitting a change:

```sh
npm run check
npm run test:wire
npm run test:browser
npm run test:package
```

`check` runs TypeScript, ESLint, Prettier, unit tests and the library build. The wire check transfers every fixture over an isolated loopback UDP socket and verifies captured bytes and decoded packet counts. Browser checks cover instruments, playback, stale data, palettes, projection, documentation and component lifecycle.

The package check packs and installs the actual archive into a temporary consumer. It verifies archive contents, documentation links, imports without React, React server rendering and declarations under both `NodeNext` and `Bundler` resolution. It uses the installed React development version for the React checks. Browser checks use Chromium; other browser engines and live hardware require separate validation.

Inspect browser screenshots at desktop and narrow widths in Bright, Day, Dusk and Night. Check text legibility, spacing, overlap, aspect ratio and contrast. Test artifacts belong in the ignored `test-results/` directory.

The demo uses synthetic telemetry and kinematic scenarios. These checks do not establish hardware accuracy, camera calibration or autopilot acceptance. The website build can report a chunk-size advisory for its development dependencies; those dependencies are excluded from the library.

After changing the fixture generator, run `npm run fixtures`, then repeat `npm run check` and `npm run test:wire`. The fixture tests verify the manifest's generator and data hashes.

## Release

Release from the `main` branch of [GitGudNow99/hud-ini](https://github.com/GitGudNow99/hud-ini). Update the version in `package.json` and `package-lock.json` together. The public package is [hud-ini on npm](https://www.npmjs.com/package/@gitgudnow99/hud-ini).

```sh
npm run check
npm run test:wire
npm run test:browser
npm run test:package
npm pack --dry-run
npm pack
```

Inspect the archive before publishing. It contains the built modules, declarations, TypeScript source, library build configuration, examples, documentation and licenses. It excludes the website application, media, fixture data and test output. `prepack` builds the library; `prepublishOnly` repeats the release checks before `npm publish`.

After reviewing the release and authenticating to npm, publish from the repository root:

```sh
npm publish --access public
```

Publishing requires access to the package name in the public npm registry. Run the publish command from the checkout so the release checks execute.
