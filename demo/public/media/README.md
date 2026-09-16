# Home page recording

`coast.mp4` and `coast.jpg` are website presentation assets, excluded from the npm package. They are licensed separately from hud-ini's source code.

- Source: [Flying over a beautiful tropical landscape](https://mixkit.co/free-stock-video/flying-over-a-beautiful-tropical-landscape-5369/), Mixkit item 5369.
- License: [Mixkit Stock Video Free License](https://mixkit.co/license/#videoFree), subject to the [Mixkit User Terms](https://mixkit.co/terms/). Reviewed 2026-09-16.
- Download: `https://assets.mixkit.co/videos/5369/5369-1080.mp4` (linked by the item's Full HD download).
- Original: 1920 × 1080, 24000/1001 fps, 15.182 seconds. SHA-256: `0ff98b40976831fadbb8f6351813cd1f83e38f14af4b752111c838d53a03d297`.
- Website copy: silent H.264, CRF 24, slow preset, yuv420p, faststart. SHA-256: `13a056954d300205f1655c4118f5cfe00a6d59af5bab102166874b3a29781879`.
- Poster: first frame, JPEG quality 3. SHA-256: `6312a3d6d587026950a5e85d486902b253e392a4bd071bf503df479a693c0b19`.

The recording is a camera background for an interactive HUD demonstration. Telemetry comes independently from hud-ini's synthetic fixtures and is not measured from the recording. The overlay omits attitude, AR, position, target and trend cues because the clip has no camera calibration or associated flight log. Changing a HUD profile changes the overlay only; every profile uses the same aerial recording.

The website crops video to 21:9 on desktop and shows 16:9 on narrow screens. The source pixels are not stretched. The instrument renderer follows the media playback clock. This shared playback clock does not establish correspondence between the illustrative measurements and the recording.
