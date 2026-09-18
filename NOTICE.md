# Third-party notices

hud-ini is distributed under GPL-2.0-or-later. The license text is included in [LICENSE](LICENSE).

The Canvas library has no runtime dependencies. The optional React component uses the host application's React installation.

The demo uses the following third-party resources. Demo application code, fixtures, fonts and media are excluded from the npm package; these notices and the bundled license texts are included.

- Adobe React Spectrum 2 (`@react-spectrum/s2`), Apache-2.0, supplies application controls and Spectrum icons. Its Provider loads the Adobe Clean Spectrum font.
- Rajdhani SemiBold, copyright Indian Type Foundry, is supplied through `@fontsource/rajdhani` under the [SIL Open Font License 1.1](demo/public/licenses/rajdhani.txt). Purista is a host-supplied option; this repository contains no Purista font files.
- Eleven vehicle glyphs are adapted from Tabler Icons, copyright 2020-2026 Paweł Kuna, under the [MIT license](demo/public/licenses/tabler-icons.txt).
- Three.js supplies the demo's 3D renderer. The fixture tools use node-mavlink and mavlink-mappings. These development dependencies retain their upstream licenses.
- The recorded flight on the replay pages derives from [the Zurich Urban Micro Aerial Vehicle Dataset](https://rpg.ifi.uzh.ch/zurichmavdataset.html), copyright A. L. Majdik, C. Till and D. Scaramuzza, released by its authors with no restriction for research, evaluation and commercial purposes.
- The aggressive flight on the replay pages derives from [the UZH-FPV Drone Racing Dataset](https://fpv.ifi.uzh.ch/datasets/), copyright J. Delmerico, T. Cieslewski, H. Rebecq, M. Faessler and D. Scaramuzza, under [CC BY-NC-SA 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/). **That recording and the files derived from it are not licensed for commercial use.** Remove `demo/public/replay/uzh-fpv-outdoor-1.*` and `assets/replay/uzh-fpv-overlay.gif` before using this repository commercially. This restriction applies to those media files alone; hud-ini's source code remains GPL-2.0-or-later. See the [replay notice](demo/public/replay/README.md).
