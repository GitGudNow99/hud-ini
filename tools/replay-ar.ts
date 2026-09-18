/**
 * Shared shape of a recorded replay scenario, and the code that rebuilds a HudFrame from one.
 *
 * Writing a HudFrame straight to disk repeats the AR scene on every frame. In a 40 second
 * sequence the route alone accounts for three quarters of the file. This format stores the
 * scene once, keeps a camera pose per frame, and rebuilds the clip-from-east-north-up matrix
 * when the frame is read. The module stays free of Node and browser APIs so that the converters
 * and the website can both use it.
 */
import type { HudArObject, HudFrame, HudWorldPoint } from '../src/types.js';

export interface ReplayCamera {
  /** Vertical field of view of the recording, in degrees. */
  verticalFovDeg: number;
  width: number;
  height: number;
  nearM: number;
  farM: number;
  note?: string;
}

/** Camera pose for one frame: east-north-up position, and orientation as x, y, z, w. */
export interface ReplayPose {
  position: readonly [number, number, number];
  rotation: readonly [number, number, number, number];
}

export interface ReplayFrame extends Omit<HudFrame, 'ar'> {
  pose?: ReplayPose;
}

export interface ReplayScenario {
  schema: 'hud-ini.replay.v2';
  id: string;
  preset: string;
  mavType: number;
  video: string;
  fps: number;
  duration: number;
  source: string;
  epochS?: number;
  camera: ReplayCamera;
  /** The AR scene, held once because its objects are fixed for the whole recording. */
  scene?: { referenceFrame: string; objects: readonly HudArObject[] };
  derived?: readonly string[];
  pipeline?: string;
  frames: readonly ReplayFrame[];
}

/**
 * Column-major clip-from-east-north-up matrix for a camera that looks along positive z with
 * positive y down, which is the convention every calibration in these datasets uses.
 */
export function arCameraMatrix(pose: ReplayPose, camera: ReplayCamera): number[] {
  const [x, y, z, w] = pose.rotation;
  // Columns of the rotation are the camera axes expressed in east-north-up.
  const right = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w)];
  const down = [2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w)];
  const forward = [2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y)];
  // OpenGL eyes look along negative z with positive y up, so flip two of the three axes.
  const view = [right, down.map((v) => -v), forward.map((v) => -v)] as number[][];
  const p = pose.position;
  const t = view.map((row) => -(row[0]! * p[0] + row[1]! * p[1] + row[2]! * p[2]));
  const focal = camera.height / 2 / Math.tan((camera.verticalFovDeg * Math.PI) / 360);
  const sx = focal / (camera.width / 2);
  const sy = focal / (camera.height / 2);
  const a = (camera.farM + camera.nearM) / (camera.nearM - camera.farM);
  const b = (2 * camera.farM * camera.nearM) / (camera.nearM - camera.farM);
  const column = (k: number) => [
    sx * view[0]![k]!,
    sy * view[1]![k]!,
    a * view[2]![k]!,
    -view[2]![k]!,
  ];
  return [...column(0), ...column(1), ...column(2), sx * t[0]!, sy * t[1]!, a * t[2]! + b, -t[2]!];
}

/** Rebuild a renderable frame, restoring the AR scene the scenario holds once. */
export function replayFrame(scenario: ReplayScenario, index: number): HudFrame {
  const frame = scenario.frames[index];
  if (!frame) throw new Error(`No frame at index ${index}`);
  const { pose, ...rest } = frame;
  if (!pose || !scenario.scene) return rest as HudFrame;
  return {
    ...(rest as HudFrame),
    ar: {
      referenceFrame: scenario.scene.referenceFrame,
      camera: {
        at: rest.time,
        position: pose.position as HudWorldPoint,
        viewProjection: arCameraMatrix(pose, scenario.camera),
      },
      objects: scenario.scene.objects,
    },
  };
}

/** Index of the last frame at or before the requested time. */
export function replayIndexAt(scenario: ReplayScenario, time: number): number {
  let low = 0;
  let high = scenario.frames.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (scenario.frames[mid]!.time <= time) low = mid + 1;
    else high = mid;
  }
  return Math.max(0, low - 1);
}

/**
 * Round every number in a scenario before writing it. Full double precision costs roughly half
 * the file and no instrument resolves it. Reading times round down, so that a reading never
 * moves ahead of its frame and reads as a clock mismatch.
 */
export function roundScenario<T>(value: T, places = 4): T {
  const factor = 10 ** places;
  const walk = (node: unknown, key?: string): unknown => {
    if (typeof node === 'number') {
      if (!Number.isFinite(node)) return node;
      return key === 'at' || key === 'time'
        ? Math.floor(node * factor) / factor
        : Math.round(node * factor) / factor;
    }
    if (Array.isArray(node)) return node.map((item) => walk(item, key));
    if (node && typeof node === 'object')
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v, k)]));
    return node;
  };
  return walk(value) as T;
}
