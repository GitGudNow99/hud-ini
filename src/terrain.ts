import { arGeometry } from './ar.js';
import type { HudArScene, HudArVisibility, HudWorldPoint } from './types.js';

/** Plain data suitable for a worker or service. All positions use the declared ENU frame. */
export interface ArVisibilityRequest {
  referenceFrame: string;
  at: number;
  observer: HudWorldPoint;
  targets: readonly { id: string; position: HudWorldPoint }[];
}

export interface ArVisibilityAnswer {
  id: string;
  state: HudArVisibility['state'];
  reason?: string;
}

/** The provider must return unknown when its data cannot establish line of sight. */
export interface ArVisibilityProvider {
  evaluate(
    request: ArVisibilityRequest,
    signal: AbortSignal,
  ): readonly ArVisibilityAnswer[] | Promise<readonly ArVisibilityAnswer[]>;
}

/** Row-major samples: east increases across columns; north increases across rows. */
export interface TerrainHeightfield {
  referenceFrame: string;
  origin: readonly [number, number];
  columns: number;
  rows: number;
  cellSizeM: number;
  /** Up in metres in the same vertical datum as the camera. NaN means missing. */
  heights: ArrayLike<number>;
  noData?: number;
}

export interface HeightfieldOptions {
  /** Maximum horizontal distance between samples. Defaults to half a grid cell. */
  stepM?: number;
  /** Surface height must exceed the ray by this tolerance. Defaults to 0.25 m. */
  toleranceM?: number;
  /** Maximum three-dimensional line length. Defaults to 10 km. */
  maxDistanceM?: number;
  /** Per-ray budget including endpoints. Defaults to 4096. Exceeding it returns unknown. */
  maxSamples?: number;
}

const pointValid = (p: HudWorldPoint) => p.length === 3 && p.every(Number.isFinite);
const samePoint = (a: HudWorldPoint, b: HudWorldPoint) =>
  pointValid(a) && pointValid(b) && a.every((v, i) => v === b[i]);
const fresh = (at: number, time: number, maxAge: number) =>
  Number.isFinite(at) && Number.isFinite(time) && time >= at && time - at <= maxAge;
const stateValid = (state: unknown): state is HudArVisibility['state'] =>
  state === 'visible' || state === 'occluded' || state === 'unknown';

/** Bilinear, sampled line-of-sight tests against a resident heightfield. No network or engine. */
export function createHeightfieldProvider(
  grid: TerrainHeightfield,
  options: HeightfieldOptions = {},
): ArVisibilityProvider {
  const { columns, rows, cellSizeM, referenceFrame } = grid;
  const origin = [...grid.origin];
  const step = options.stepM ?? cellSizeM / 2;
  const tolerance = options.toleranceM ?? 0.25;
  const maxDistance = options.maxDistanceM ?? 10_000;
  const maxSamples = options.maxSamples ?? 4096;
  if (
    !referenceFrame.trim() ||
    origin.length !== 2 ||
    !origin.every(Number.isFinite) ||
    !Number.isSafeInteger(columns) ||
    columns < 2 ||
    !Number.isSafeInteger(rows) ||
    rows < 2 ||
    !Number.isSafeInteger(columns * rows) ||
    grid.heights.length !== columns * rows ||
    !Number.isFinite(cellSizeM) ||
    cellSizeM <= 0 ||
    !Number.isFinite(step) ||
    step <= 0 ||
    !Number.isFinite(tolerance) ||
    tolerance < 0 ||
    !Number.isFinite(maxDistance) ||
    maxDistance <= 0 ||
    !Number.isSafeInteger(maxSamples) ||
    maxSamples < 2
  )
    throw new RangeError('Invalid terrain grid or line-of-sight sampling options');
  // Own the samples so caller mutations cannot silently change cached visibility.
  const heights = Float64Array.from(grid.heights);
  const noData = grid.noData;
  function sample(east: number, north: number): number | undefined {
    const x = (east - origin[0]!) / cellSizeM,
      y = (north - origin[1]!) / cellSizeM;
    if (x < 0 || y < 0 || x > columns - 1 || y > rows - 1) return undefined;
    const ix = Math.min(columns - 2, Math.floor(x)),
      iy = Math.min(rows - 2, Math.floor(y));
    const fx = x - ix,
      fy = y - iy;
    const values = [
      heights[iy * columns + ix]!,
      heights[iy * columns + ix + 1]!,
      heights[(iy + 1) * columns + ix]!,
      heights[(iy + 1) * columns + ix + 1]!,
    ];
    const weights = [(1 - fx) * (1 - fy), fx * (1 - fy), (1 - fx) * fy, fx * fy];
    let height = 0;
    for (let i = 0; i < 4; i++) {
      if (weights[i] === 0) continue;
      if (!Number.isFinite(values[i]) || values[i] === noData) return undefined;
      height += values[i]! * weights[i]!;
    }
    return height;
  }
  return {
    evaluate(request, signal) {
      const ids = new Set<string>();
      const duplicates = new Set<string>();
      for (const target of request.targets) {
        if (ids.has(target.id)) duplicates.add(target.id);
        ids.add(target.id);
      }
      return request.targets.map(({ id, position }): ArVisibilityAnswer => {
        const unknown = (reason: string): ArVisibilityAnswer => ({ id, state: 'unknown', reason });
        if (signal.aborted) return unknown('aborted');
        if (request.referenceFrame !== referenceFrame) return unknown('reference-frame-mismatch');
        if (
          !id ||
          duplicates.has(id) ||
          !Number.isFinite(request.at) ||
          !pointValid(request.observer) ||
          !pointValid(position)
        )
          return unknown('invalid-input');
        const [east, north, up] = request.observer;
        const de = position[0] - east,
          dn = position[1] - north,
          du = position[2] - up;
        const distance = Math.hypot(de, dn, du);
        if (!Number.isFinite(distance) || distance > maxDistance) return unknown('range-limit');
        const intervals = Math.max(1, Math.ceil(Math.hypot(de, dn) / step));
        if (intervals + 1 > maxSamples) return unknown('sample-budget');
        let missing = false;
        for (let i = 0; i <= intervals; i++) {
          const t = i / intervals;
          const height = sample(east + de * t, north + dn * t);
          if (height === undefined) missing = true;
          else if (height > up + du * t + tolerance)
            return { id, state: 'occluded', reason: 'terrain-intersection' };
        }
        return missing ? unknown('missing-terrain') : { id, state: 'visible' };
      });
    },
  };
}

interface VisibilitySnapshot {
  referenceFrame: string;
  observer: HudWorldPoint;
  results: Map<string, { position: HudWorldPoint; visibility: HudArVisibility }>;
}

/** Runs outside the renderer. Binds async results to exact positions, frame and input times. */
export class ArVisibilityResolver {
  private generation = 0;
  private abort?: AbortController;
  private snapshot?: VisibilitySnapshot;
  private destroyed = false;
  private readonly maxAgeS: number;

  constructor(
    private readonly provider: ArVisibilityProvider,
    options: { maxAgeS?: number } = {},
  ) {
    this.maxAgeS = options.maxAgeS ?? 1;
    if (!Number.isFinite(this.maxAgeS) || this.maxAgeS <= 0)
      throw new RangeError('maxAgeS must be positive and finite');
  }

  /** Start a new evaluation and cancel its predecessor. Time shares the displayed frame clock. */
  async update(scene: HudArScene, time = scene.camera.at): Promise<void> {
    if (this.destroyed) return;
    this.abort?.abort();
    const generation = ++this.generation;
    const abort = new AbortController();
    this.abort = abort;
    const referenceFrame = scene.referenceFrame;
    if (
      !referenceFrame?.trim() ||
      !pointValid(scene.camera.position) ||
      !fresh(scene.camera.at, time, this.maxAgeS)
    ) {
      this.snapshot = undefined;
      return;
    }
    const observer: HudWorldPoint = [...scene.camera.position];
    const ids = new Set<string>();
    const duplicates = new Set<string>();
    for (const object of scene.objects) {
      if (ids.has(object.id)) duplicates.add(object.id);
      ids.add(object.id);
    }
    const results: VisibilitySnapshot['results'] = new Map();
    for (const object of scene.objects.slice(0, 128)) {
      if (
        !object.id ||
        duplicates.has(object.id) ||
        object.visible === false ||
        !fresh(object.at, time, this.maxAgeS)
      )
        continue;
      const anchor = arGeometry(object)?.anchor;
      if (anchor && pointValid(anchor))
        results.set(object.id, {
          position: [...anchor],
          visibility: {
            state: 'unknown',
            scope: 'anchor',
            at: Math.min(time, scene.camera.at, object.at),
            reason: 'missing-result',
          },
        });
    }
    try {
      // Keep a separate snapshot: a worker adapter or provider cannot mutate cache identity.
      const answers = await this.provider.evaluate(
        {
          referenceFrame,
          at: time,
          observer: [...observer],
          targets: [...results].map(([id, r]) => ({ id, position: [...r.position] })),
        },
        abort.signal,
      );
      const answered = new Set<string>();
      for (const answer of answers) {
        const entry = results.get(answer.id);
        if (!entry) continue;
        entry.visibility = {
          ...entry.visibility,
          state: answered.has(answer.id) || !stateValid(answer.state) ? 'unknown' : answer.state,
          reason: answered.has(answer.id) ? 'duplicate-result' : answer.reason,
        };
        answered.add(answer.id);
      }
    } catch {
      for (const entry of results.values()) {
        entry.visibility.state = 'unknown';
        entry.visibility.reason = 'provider-error';
      }
    }
    if (!this.destroyed && generation === this.generation && !abort.signal.aborted)
      this.snapshot = { referenceFrame, observer, results };
  }

  /** Returns a new scene; moving anchors/cameras and expired results become unknown. */
  apply(scene: HudArScene, time: number): HudArScene {
    const snapshot = this.snapshot;
    const matches =
      !this.destroyed &&
      snapshot &&
      scene.referenceFrame === snapshot.referenceFrame &&
      samePoint(scene.camera.position, snapshot.observer) &&
      fresh(scene.camera.at, time, this.maxAgeS);
    const counts = new Map<string, number>();
    for (const object of scene.objects) counts.set(object.id, (counts.get(object.id) ?? 0) + 1);
    return {
      ...scene,
      objects: scene.objects.map((object) => {
        const entry =
          matches && counts.get(object.id) === 1 ? snapshot.results.get(object.id) : undefined;
        const anchor = arGeometry(object)?.anchor;
        const visibility: HudArVisibility =
          entry &&
          anchor &&
          samePoint(anchor, entry.position) &&
          fresh(object.at, time, this.maxAgeS) &&
          fresh(entry.visibility.at, time, this.maxAgeS)
            ? { ...entry.visibility }
            : { state: 'unknown', scope: 'anchor', at: time, reason: 'not-current' };
        return { ...object, visibility };
      }),
    };
  }

  /** Call when terrain tiles, geometry, calibration or coordinate definitions change. */
  invalidate(): void {
    this.generation++;
    this.abort?.abort();
    this.snapshot = undefined;
  }

  destroy(): void {
    this.invalidate();
    this.destroyed = true;
  }
}
