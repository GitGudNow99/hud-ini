# Recorded flight provenance

These recordings drive the website's replay pages. Each one pairs imagery with the telemetry that was measured during the same flight, so the overlay shows real attitude, speed and position rather than an illustration. The media files are website presentation assets and are excluded from the npm package. They are licensed separately from hud-ini's source code.

`tools/agz-replay.ts` and `tools/uzhfpv-replay.ts` produce these files. See [replay recorded flights](../../../docs/replay.md) for the commands and the limits of each dataset.

## agz-zurich

- Source: [The Zurich Urban Micro Aerial Vehicle Dataset](https://rpg.ifi.uzh.ch/zurichmavdataset.html), A. L. Majdik, C. Till and D. Scaramuzza, International Journal of Robotics Research, April 2017.
- License: the authors state "This dataset is released with no restriction. It can be used for research, evaluation, and commercial purposes." Reviewed 2026-09-18.
- Content: images 59851 to 60750 of the aerial sequence, 30.0 seconds at 30 frames per second, scaled to 1280 x 720 and encoded as H.264, CRF 27, yuv420p, faststart.
- Telemetry: Pixhawk PX4 attitude quaternion and gyroscope, onboard GPS receiver, barometric pressure sensor and tether sensors, all recorded onboard and time synchronized with the imagery by the dataset authors.
- Every displayed value is measured. The converter resolves nothing.
- SHA-256: `d849144383d3692dc236e7f66c4b28fd8d483e06ad6fb2238fe56676dc3a9791` (video), `13fb8bca73c71cb188ff9b593ece37b630efaa037048da00deda5db574509fcc` (telemetry).

The displayed altitude comes from the barometer. Over this segment the GPS receiver reports a 21.1 metre vertical excursion while the barometer reports 2.2 metres, and the receiver logs an uninitialised vertical accuracy field, so the barometer is the trustworthy source.

## uzh-fpv-outdoor-1

- Source: [The UZH-FPV Drone Racing Dataset](https://fpv.ifi.uzh.ch/datasets/), J. Delmerico, T. Cieslewski, H. Rebecq, M. Faessler and D. Scaramuzza, IEEE International Conference on Robotics and Automation, 2019. Sequence `outdoor_forward_1_snapdragon_with_gt`, with the `outdoor_forward` Snapdragon calibration.
- License: [Creative Commons Attribution-NonCommercial-ShareAlike 3.0](https://creativecommons.org/licenses/by-nc-sa/3.0/). Reviewed 2026-09-18.
- **This recording and every file derived from it carry CC BY-NC-SA 3.0**, including `assets/replay/uzh-fpv-overlay.gif`, which the project README displays. You can use them for research, evaluation and this non-commercial website. You cannot use them commercially. Remove those files before using this repository for commercial work. hud-ini's own source code is unaffected and remains GPL-2.0-or-later.
- Content: 39.6 seconds beginning 3 seconds after ground truth coverage opens, rectified from the 132 by 99 degree equidistant fisheye source to a 102 by 70 degree rectilinear frame at 1280 x 720, given a contrast lift, and encoded as H.264, CRF 26, yuv420p, faststart.
- Telemetry: Leica Nova MS60 laser tracker pose at 500 Hz and the Snapdragon Flight inertial measurement unit.
- SHA-256: `138dd1017311f7ae0f58f38f2d5781ad3452b7123926c1fe372e97d20998d419` (video), `0e8619ceafc8ae3ded88e7f644a589f85dc146d840651d08c6620c4c65ba0b3e` (telemetry).

Attitude, rotation rate, speed, climb and altitude are measured. The shipped file re-encodes the flight as MAVLink 2 and rebuilds it through `MavlinkTelemetry`, which also fills the rotor diagram and the control sticks. Those two come from the recorded angular rates and specific force, because the dataset records no motor telemetry. The file names them in its `derived` field and the page labels them. The dataset records no battery either, so the power panel correctly reads unavailable.

East and north are arbitrary in this recording. A laser tracker frame carries no compass reference, so the displayed heading is relative.
