# Replay recorded flights

Drive the HUD from a recorded flight instead of a synthetic fixture, so that attitude, heading, speed and AR projection face real sensor timing, real calibration and real gaps in coverage.

The repository's own fixtures use deterministic kinematics encoded through MAVLink 2. They never produce a late sample, a missing stream or a lens that bends a straight line. Recorded flights produce all three, which is what makes them worth running.

Two converters live in `tools/`. Both write a `hud-ini.replay.v1` scenario and an MP4 whose per-frame durations come from the recorded timestamps, so the media clock carries the telemetry clock.

Neither dataset is part of the repository. `.gitignore` excludes `.datasets/` and `demo/public/replay/`. Download the data yourself and keep the derived media local.

## Choose a dataset

| Dataset          | Imagery                     | Telemetry                    | Motion                           | License         |
| ---------------- | --------------------------- | ---------------------------- | -------------------------------- | --------------- |
| Zurich Urban MAV | 1920 x 1080 colour          | PX4 attitude, GPS, barometer | 0.79 m/s mean, 3.9 m/s peak      | No restriction  |
| UZH-FPV          | 640 x 480 grayscale fisheye | Laser-tracked pose at 500 Hz | 8.3 m/s peak, 94 deg/s turn rate | CC BY-NC-SA 3.0 |

Use the Zurich Urban set to exercise GPS, altitude datums and reading staleness. Use UZH-FPV to exercise attitude, turn rate and AR projection.

## Zurich Urban MAV Dataset

The set records a tethered Fotokite over Zurich with a GoPro Hero 4 and a Pixhawk PX4 autopilot. Every aerial image carries a GPS row, so the imagery and the telemetry already share one clock. See the [dataset page](https://rpg.ifi.uzh.ch/zurichmavdataset.html).

Download the 200 MB sample, which carries the complete logs for the whole flight and the first 350 images. The full set is 28 GB.

```sh
curl -LO https://download.ifi.uzh.ch/rpg/AGZ_data/AGZ_subset.zip
unzip AGZ_subset.zip -d .datasets/zurich
npx tsx tools/agz-replay.ts --dataset .datasets/zurich/AGZ_subset --out .datasets/zurich/replay
```

Pass `--start` and `--count` to select an image range, and `--id` to name the output.

The converter reads `OnboardGPS.csv` for position, fix type, satellite count, horizontal dilution and velocity, `OnboardPose.csv` for the attitude quaternion and the tether force, and `BarometricPressure.csv` for the displayed altitude. The dataset authors released it "with no restriction", including commercial use, so you can publish the derived media.

Two limits apply to the overlay:

- Lens distortion remains uncorrected. The calibrated radial coefficient is -0.28, so straight lines bow and a flat horizon line cannot align with the scene.
- The attitude quaternion describes the airframe, not the camera. The camera sits on a separate mount whose orientation the logs omit. Treat the ladder as airframe-referenced. For a camera-referenced ladder, read the photogrammetric orientation from `GroundTruthAGL.csv`, which the dataset samples at 1 Hz.

## UZH-FPV Drone Racing Dataset

The set records an FPV racing quadrotor with a Snapdragon Flight board and a Leica Nova MS60 laser tracker. See the [dataset page](https://fpv.ifi.uzh.ch/datasets/).

The public download offers grayscale fisheye stereo frames, IMU samples and laser-tracked pose. It does not offer the pilot's colour FPV video, although the project abstract mentions that camera.

Download one sequence with public ground truth and the matching calibration:

```sh
curl -LO https://download.ifi.uzh.ch/rpg/web/datasets/uzh-fpv-newer-versions/v3/outdoor_forward_1_snapdragon_with_gt.zip
curl -LO https://download.ifi.uzh.ch/rpg/web/datasets/uzh-fpv/calib/outdoor_forward_calib_snapdragon.zip
unzip outdoor_forward_1_snapdragon_with_gt.zip -d .datasets/uzh-fpv/outdoor_forward_1_snapdragon_with_gt
unzip outdoor_forward_calib_snapdragon.zip -d .datasets/uzh-fpv
npx tsx tools/uzhfpv-replay.ts \
  --sequence .datasets/uzh-fpv/outdoor_forward_1_snapdragon_with_gt \
  --calib .datasets/uzh-fpv/outdoor_forward_calib_snapdragon \
  --out .datasets/uzh-fpv/replay
```

Pass `--fov`, `--width` and `--height` to change the rectified image. The defaults produce 960 by 720 pixels at a 70 degree vertical field of view.

The converter rectifies the equidistant fisheye source to a rectilinear image, because the HUD's ladder and its AR projection both assume a rectilinear camera. It recovers the vertical axis by averaging the world-frame specific force, because a laser tracker frame carries no gravity reference. It then emits an AR scene holding the flown path, the start point and a landing pad, with a clip-from-east-north-up matrix built from the pose and the Kalibr calibration.

Four limits apply:

- East and north are arbitrary. A laser tracker frame carries no compass reference, so the displayed heading is relative, not true.
- The set carries no GPS, battery, airspeed or flight mode. Those panels correctly report unavailable data.
- Ground truth covers 42.6 of the 85.7 seconds of imagery in `outdoor_forward_1`, so the converter keeps only the overlapping 1164 frames.
- AR objects draw without occlusion. To hide anchors behind terrain, supply a provider from `@gitgudnow99/hud-ini/terrain`. See [terrain visibility integration](terrain.md).

### Parsing notes

The public ZIP holds `groundtruth.txt` with eight columns, `timestamp tx ty tz qx qy qz qw`, and no identifier column. The `render_gt_projection.py` script in [uzh_fpv_open](https://github.com/uzh-rpg/uzh_fpv_open) drops its first column before reading, which matches the authors' internal format and discards the timestamp on the public files.

That repository holds ground truth quality assessment code, not a general parser. It requires ROS Melodic, catkin and CasADi. The text format in the ZIP needs no library. Read `render_gt_projection.py` for the frame conventions it confirms: the camera looks along positive z with positive y down, and `T_C_W` equals `T_C_B` times the inverse of `T_W_B`.

## Rebuild the frames through the MAVLink adapter

The dataset converters write `HudFrame` objects directly, which skips `MavlinkTelemetry`, the adapter that real installations use. Run `tools/replay-mavlink.ts` to close that gap. It serialises every sample as MAVLink 2, decodes the bytes again, and lets the public adapter produce the frames, the same round trip that `tools/generate-fixtures.ts` performs for the synthetic scenarios.

```sh
npx tsx tools/replay-mavlink.ts \
  --scenario .datasets/uzh-fpv/replay/outdoor_forward_1_snapdragon_with_gt.json \
  --imu .datasets/uzh-fpv/outdoor_forward_1_snapdragon_with_gt/imu.txt
```

The tool emits `HEARTBEAT`, `SYS_STATUS`, `ATTITUDE`, `VFR_HUD` and `SERVO_OUTPUT_RAW`, then merges the AR scene and the stick positions back, because MAVLink carries neither. Running it on `outdoor_forward_1` produces 3578 packets and 1164 frames, and it fails if the round trip loses a single packet.

This populates the rotor diagram, the actuator bank, the flight mode, the armed state and the sensor health panel, none of which the dataset converters reach on their own.

### What the tool derives

No public dataset pairs camera imagery with logged motor telemetry, so the rotor and stick values come from the recorded inertial data. The scenario lists every such field under `derived`, and the tool leaves the battery unavailable unless you pass `--demo-power true`.

- **Rotor demands.** Angular acceleration times a diagonal inertia gives the torque each axis demands, and the body z specific force gives the collective. A standard X configuration mixer resolves those into four motor values. The demands therefore track the manoeuvre you are watching.
- **Stick positions.** An acrobatic mode commands rates directly, so the measured angular rates stand in for stick deflection. Full scale per axis comes from the 98th percentile of the recorded magnitude, because this pilot never reaches a racing rate limit.
- **Flight mode and armed state.** Asserted by the encoder. The dataset records neither.

Pass `--demo-power true` only for display work, never to evaluate power instrumentation.

### Altitude without a position fix

`MavlinkTelemetry` originally read altitude only from `GLOBAL_POSITION_INT`, so this laser-tracked flight showed no altitude at all and the HUD reported partial data. The adapter now falls back to `VFR_HUD.alt`, which the common definition reports above mean sea level, and labels the tape `MSL`. Any vehicle that sends `GLOBAL_POSITION_INT` keeps its `REL HOME` datum, so the behaviour of a GPS-equipped installation does not change.

## Keep the video and the telemetry on one clock

Both converters resample onto a constant rate grid before encoding. They choose the output times first, then pick the nearest recorded image and sample the pose at that same instant, so the media clock and the telemetry clock stay identical by construction.

Do not hand the recorded intervals to the concat demuxer as per-file `duration` directives. It quantises them to its own timebase and drops frames, which stretches the recording and slides it out of step with the telemetry. That failure looks exactly like a miscalibrated horizon: the attitude is correct, but it belongs to a different moment than the picture underneath it.

Verify sync after any change to the encoder:

```sh
ffprobe -v error -select_streams v:0 -show_entries frame=pts_time -of csv=p=0 <video>.mp4
```

Compare each presentation timestamp against the matching `frames[i].time`. Both scenarios currently agree to 0.000000 s.

## What recorded data caught

Running real logs through the library surfaced two contract details that synthetic fixtures never reach:

- `readingStatus` classifies any reading whose `at` exceeds the frame time by more than 1e-6 seconds as `future`, and the HUD then reports a clock mismatch and withholds the panel. Rounding to the nearest log sample puts a reading a few milliseconds ahead of its frame, which triggers this. Always take the last sample at or before the frame time.
- The concat demuxer quantised per-frame durations to its own timebase, which stretched the UZH-FPV recording by 11 percent and left the picture 4.5 seconds behind the telemetry by the end, and the Zurich recording 1.95 seconds behind. Resampling onto a constant rate grid fixed both.
- Log streams start at different times. In the Zurich set, both the attitude log and the pressure log begin after the first GPS row, so the earliest images have no satisfiable reading. Begin the scenario once every stream has produced a sample.
