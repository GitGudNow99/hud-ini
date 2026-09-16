import { Matrix4, PerspectiveCamera } from 'three';
import { evaluateRidgeScene } from '../examples/heightfield.js';
import type {
  HudArCamera,
  HudArObject,
  HudArScene,
  HudWorldPoint,
  VehiclePreset,
} from '../src/index.js';

/** The demo's Three.js world uses east/up/south; the public AR world uses east/north/up. */
export function arCamera(camera: PerspectiveCamera, at: number): HudArCamera {
  camera.updateMatrixWorld();
  const enuToThree = new Matrix4().set(1, 0, 0, 0, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 1);
  const matrix = new Matrix4()
    .multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    .multiply(enuToThree);
  return {
    at,
    position: [camera.position.x, -camera.position.z, camera.position.y],
    viewProjection: matrix.toArray(),
  };
}

/** Synthetic mission geometry fixed in the scene when a vehicle example loads. */
export function arObjects(
  origin: HudWorldPoint,
  heading: number,
  domain: VehiclePreset['domain'],
): HudArObject[] {
  const angle = (heading * Math.PI) / 180;
  const floor = domain === 'underwater' ? -17.8 : 0.2;
  const level =
    domain === 'air' ? Math.max(10, origin[2] - 12) : domain === 'underwater' ? origin[2] : 1;
  const p = (x: number, forward: number, up: number): HudWorldPoint => [
    origin[0] + x * Math.cos(angle) + forward * Math.sin(angle),
    origin[1] - x * Math.sin(angle) + forward * Math.cos(angle),
    up,
  ];
  const points = [p(0, 45, level), p(4, 100, level), p(12, 180, level), p(4, 260, level)];
  return [
    { id: 'route', kind: 'route', label: 'ROUTE', at: 0, points },
    { id: 'wp-1', kind: 'waypoint', label: 'WP 01', at: 0, position: points[1]!, selected: true },
    { id: 'wp-2', kind: 'waypoint', label: 'WP 02', at: 0, position: points[3]! },
    { id: 'home', kind: 'home', label: 'HOME', at: 0, position: p(-29, 150, floor) },
    { id: 'poi', kind: 'poi', label: 'POI', at: 0, position: p(30, 155, level) },
    {
      id: 'approach',
      kind: 'corridor',
      label: 'APPROACH',
      at: 0,
      points: [p(7, 100, level + 5), p(14, 175, level + 3), p(5, 250, level)],
      widthM: 16,
      heightM: 10,
    },
    {
      id: 'landing',
      kind: 'landing-zone',
      label: 'LZ 01',
      at: 0,
      position: p(30, 210, floor),
      radiusM: 12,
    },
    {
      id: 'vehicle',
      kind: 'vehicle',
      label: 'VEH 02',
      at: 0,
      position: p(-17, 85, level + 2),
      sizeM: [5, 9, 4],
      headingDeg: heading - 25,
    },
    {
      id: 'volume',
      kind: 'box',
      label: 'VOLUME',
      at: 0,
      position: p(33, 125, level + 5),
      sizeM: [12, 15, 10],
      headingDeg: heading,
    },
  ];
}

export function arGalleryScene(
  at: number,
  aspect: number,
  kind = 'ar-markers',
  motion = 0,
): HudArScene {
  const camera = new PerspectiveCamera(55, aspect, 0.1, 3000);
  camera.position.set(0, 30, 0);
  camera.lookAt(0, 8, -110);
  const objects = arObjects([0, 0, 20], 0, 'air').map((object) => ({ ...object, at }));
  if (kind === 'ar-landing') {
    camera.position.set(38, 62, -147);
    camera.lookAt(30, 0, -210);
  } else if (kind === 'ar-volumes') {
    camera.position.set(7, 37, -20);
    camera.lookAt(7, 12, -106);
  } else if (kind === 'ar-route') {
    camera.position.set(-16, 25, -30);
    camera.lookAt(8, 10, -140);
  }
  camera.position.x += Math.sin(motion * 0.3) * 5;
  camera.position.y += Math.sin(motion * 0.4) * 2;
  return {
    camera: arCamera(camera, at),
    objects,
  };
}

export async function arTerrainScene(at: number, aspect: number): Promise<HudArScene> {
  const camera = new PerspectiveCamera(55, aspect, 0.1, 3000);
  camera.position.set(0, 30, 0);
  camera.lookAt(0, 20, -160);
  return evaluateRidgeScene({
    referenceFrame: 'example-enu-v1',
    camera: arCamera(camera, at),
    objects: [
      { id: 'above', kind: 'waypoint', label: 'CLEAR', at, position: [-38, 180, 55] },
      { id: 'behind', kind: 'waypoint', label: 'RIDGE', at, position: [0, 190, 4] },
      { id: 'unmapped', kind: 'waypoint', label: 'NO TILE', at, position: [52, 180, 30] },
    ],
  });
}
