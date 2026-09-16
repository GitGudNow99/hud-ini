import * as T from 'three';
import type { HudArObject, HudArScene, HudFrame, VehiclePreset } from '../src/index.js';
import { arCamera, arObjects } from './ar-scene.js';
import { ArVisibilityResolver } from '../src/terrain.js';
import { createMeshVisibilityProvider } from '../examples/three-visibility.js';

/** Procedural preview geometry driven by the same recorded poses as the HUD. */
export class VehicleScene {
  private renderer: T.WebGLRenderer;
  private scene = new T.Scene();
  private camera = new T.PerspectiveCamera(46, 16 / 9, 0.1, 3000);
  private vehicle = new T.Group();
  private rotors: T.Object3D[] = [];
  private observer: ResizeObserver;
  private preset?: VehiclePreset;
  private frame?: HudFrame;
  private materials: T.Material[] = [];
  private geometries: T.BufferGeometry[] = [];
  private night = false;
  private worldObjects?: HudArObject[];
  private visibility?: ArVisibilityResolver;
  private visibilityKey = '';
  constructor(private canvas: HTMLCanvasElement) {
    this.renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    this.renderer.outputColorSpace = T.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = T.PCFSoftShadowMap;
    this.observer = new ResizeObserver(() => this.draw());
    this.observer.observe(canvas);
  }
  private material(color: number, roughness = 0.7): T.MeshStandardMaterial {
    const material = new T.MeshStandardMaterial({ color, roughness, metalness: 0.15 });
    this.materials.push(material);
    return material;
  }
  private mesh(
    geometry: T.BufferGeometry,
    material: T.Material,
    position: [number, number, number],
    parent: T.Object3D = this.scene,
  ): T.Mesh {
    this.geometries.push(geometry);
    const mesh = new T.Mesh(geometry, material);
    mesh.position.set(...position);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  configure(preset: VehiclePreset): void {
    if (this.preset?.id === preset.id) return;
    for (const material of this.materials) material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.materials = [];
    this.geometries = [];
    this.scene.clear();
    this.rotors = [];
    this.preset = preset;
    this.worldObjects = undefined;
    this.frame = undefined;
    this.visibility?.destroy();
    this.visibilityKey = '';
    this.vehicle = new T.Group();
    this.scene.add(this.vehicle);
    const marine = preset.domain === 'surface' || preset.domain === 'underwater';
    this.scene.background = new T.Color(preset.domain === 'underwater' ? 0x163c4b : 0xadc2ce);
    this.scene.fog = new T.Fog(preset.domain === 'underwater' ? 0x163c4b : 0xadc2ce, 220, 850);
    this.scene.add(new T.HemisphereLight(0xe3f2ff, 0x4b606b, 2.3));
    const sun = new T.DirectionalLight(0xfff3d8, 3.1);
    sun.position.set(-40, 70, 35);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -240, right: 240, top: 240, bottom: -240, far: 600 });
    this.scene.add(sun);
    const ground = this.mesh(
      new T.PlaneGeometry(1800, 1800),
      this.material(marine ? 0x356b82 : 0x748279, marine ? 0.32 : 0.9),
      [0, preset.domain === 'underwater' ? -18 : -0.08, 0],
    );
    ground.rotation.x = -Math.PI / 2;
    const edge = this.material(0xc1c4bc),
      charcoal = this.material(0x243541),
      yellow = this.material(0xedbd49),
      light = this.material(0xe1e5e4),
      red = this.material(0xc96850);
    if (preset.domain === 'underwater') {
      this.scene.fog = new T.Fog(0x163c4b, 8, 85);
      const surface = this.mesh(
        new T.PlaneGeometry(1800, 1800),
        this.material(0x163c4b),
        [0, 0, 0],
      );
      surface.rotation.x = Math.PI / 2;
      for (let i = -4; i <= 4; i++) {
        this.mesh(new T.CylinderGeometry(0.65, 0.85, 18, 12), edge, [85, -9, i * 22]);
        this.mesh(new T.BoxGeometry(4, 1, 4), charcoal, [85, -17.5, i * 22]);
      }
      const pipe = this.mesh(new T.CylinderGeometry(1.1, 1.1, 150, 18), yellow, [70, -16.5, 0]);
      pipe.rotation.x = Math.PI / 2;
      for (let i = -3; i <= 3; i++)
        this.mesh(new T.BoxGeometry(5, 1, 2), edge, [70, -17.5, i * 20]);
    } else if (marine) {
      for (let i = -25; i <= 25; i++) {
        const strip = this.mesh(
          new T.PlaneGeometry(1100, 0.13),
          this.material(i % 2 ? 0x57869a : 0x477c94),
          [0, 0.02, i * 17],
        );
        strip.rotation.x = -Math.PI / 2;
      }
      for (const side of [-1, 1]) {
        this.mesh(new T.BoxGeometry(20, 3, 240), edge, [side * 155, -1, 0]);
        for (let i = -3; i <= 3; i++) {
          this.mesh(new T.BoxGeometry(23, 10, 18), charcoal, [side * 182, 5, i * 33]);
          this.mesh(new T.CylinderGeometry(0.7, 0.7, 1.8, 12), yellow, [side * 146, 1, i * 30]);
        }
      }
      for (let i = 0; i < 10; i++) {
        const angle = (i * Math.PI) / 5;
        this.mesh(new T.CylinderGeometry(0.8, 1, 2, 14), i % 2 ? red : yellow, [
          95 * Math.sin(angle),
          0.4,
          -95 * Math.cos(angle),
        ]);
      }
    } else {
      this.mesh(new T.BoxGeometry(30, 0.12, 650), charcoal, [0, 0, 0]);
      for (let i = -16; i <= 16; i++)
        this.mesh(new T.BoxGeometry(0.4, 0.15, 9), light, [0, 0.1, i * 19]);
      for (let i = 0; i < 18; i++) {
        const x = (i % 2 ? -1 : 1) * (75 + (i % 3) * 25),
          z = Math.floor(i / 2) * 62 - 260;
        this.mesh(new T.BoxGeometry(24, 8 + (i % 4) * 3, 30), edge, [x, 4 + (i % 4) * 1.5, z]);
      }
    }
    const body = (g: T.BufferGeometry, m: T.Material, pos: [number, number, number]) =>
      this.mesh(g, m, pos, this.vehicle);
    if (preset.id === 'boat') {
      for (const x of [-1.3, 1.3]) {
        body(new T.BoxGeometry(0.8, 0.8, 4.6), yellow, [x, 0.35, 0.25]);
        const bow = body(new T.ConeGeometry(0.57, 1.4, 4), yellow, [x, 0.35, -2.65]);
        bow.rotation.set(-Math.PI / 2, 0, Math.PI / 4);
      }
      body(new T.BoxGeometry(3.3, 0.25, 2.6), light, [0, 0.9, 0.15]);
      body(new T.BoxGeometry(1.4, 0.8, 1.5), charcoal, [0, 1.42, 0.2]);
      body(new T.CylinderGeometry(0.07, 0.07, 1.8, 8), light, [0, 2.5, 0.3]);
      body(new T.BoxGeometry(0.65, 0.3, 0.3), light, [0, 3.25, 0.3]);
      for (const x of [-1.3, 1.3]) body(new T.BoxGeometry(0.35, 0.8, 0.4), charcoal, [x, 0.1, 2.7]);
    } else if (preset.id === 'rover') {
      body(new T.BoxGeometry(2.2, 1, 3.3), yellow, [0, 1, 0]);
      body(new T.BoxGeometry(1.6, 0.7, 1.6), charcoal, [0, 1.85, 0.2]);
      for (const x of [-1.3, 1.3])
        for (const z of [-1.1, 1.1]) {
          const wheel = body(new T.CylinderGeometry(0.65, 0.65, 0.45, 20), charcoal, [x, 0.55, z]);
          wheel.rotation.z = Math.PI / 2;
        }
    } else if (preset.id === 'submarine') {
      body(new T.BoxGeometry(2.1, 1.1, 3), yellow, [0, 0, 0]);
      for (const x of [-1.2, 1.2]) {
        const pontoon = body(new T.CylinderGeometry(0.3, 0.3, 3.5, 16), light, [x, 0.4, 0]);
        pontoon.rotation.x = Math.PI / 2;
      }
      body(new T.SphereGeometry(0.3, 16, 16), charcoal, [0, 0, -1.6]);
    } else if (preset.id === 'tracker' || preset.id === 'ptz') {
      body(new T.CylinderGeometry(0.25, 0.5, 3, 12), light, [0, 1.5, 0]);
      const dish = body(
        new T.SphereGeometry(1.2, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2),
        charcoal,
        [0, 3.2, 0],
      );
      dish.rotation.x = Math.PI / 2;
    } else if (preset.id === 'blimp') {
      const balloon = body(new T.SphereGeometry(2, 32, 20), light, [0, 1, 0]);
      balloon.scale.set(1, 1, 2.5);
      body(new T.BoxGeometry(1, 0.6, 2), charcoal, [0, -1, 0]);
    } else if (preset.id === 'plane' || preset.id === 'vtol') {
      const fuselage = body(new T.ConeGeometry(0.45, 5, 12), light, [0, 0, 0]);
      fuselage.rotation.x = -Math.PI / 2;
      body(new T.BoxGeometry(7, 0.12, 1.1), light, [0, 0, 0.1]);
      body(new T.BoxGeometry(2.1, 0.12, 0.65), light, [0, 0.15, 1.7]);
      body(new T.BoxGeometry(0.1, 0.95, 0.8), yellow, [0, 0.5, 1.7]);
      if (preset.id === 'vtol')
        for (const x of [-2, 2])
          for (const z of [-0.8, 0.8]) {
            const rotor = body(new T.BoxGeometry(1.5, 0.03, 0.1), charcoal, [x, 0.25, z]);
            this.rotors.push(rotor);
          }
    } else {
      body(new T.BoxGeometry(1.2, 0.4, 1.6), charcoal, [0, 0, 0]);
      if (preset.id === 'helicopter') {
        body(new T.BoxGeometry(0.25, 0.25, 3.8), light, [0, 0.1, 1.6]);
        const rotor = body(new T.BoxGeometry(5, 0.03, 0.14), charcoal, [0, 0.75, 0]);
        this.rotors.push(rotor);
      } else
        for (const x of [-1.1, 1.1])
          for (const z of [-1.1, 1.1]) {
            const arm = body(new T.BoxGeometry(0.12, 0.12, 1.8), light, [x / 2, 0, z / 2]);
            arm.rotation.y = x * z > 0 ? Math.PI / 4 : -Math.PI / 4;
            body(new T.CylinderGeometry(0.18, 0.18, 0.35, 12), yellow, [x, 0.1, z]);
            const rotor = body(new T.BoxGeometry(1.2, 0.025, 0.1), charcoal, [x, 0.35, z]);
            this.rotors.push(rotor);
          }
    }
    this.visibility = new ArVisibilityResolver(
      createMeshVisibilityProvider({
        referenceFrame: `demo-${preset.id}`,
        occluders: this.scene.children.filter((child) => child instanceof T.Mesh),
        // The authored world is finite; this is coverage of this synthetic scene only.
        hasCoverage: (observer, target) =>
          [observer, target].every((point) => Math.abs(point[0]) < 850 && Math.abs(point[1]) < 850),
      }),
    );
    this.draw();
  }
  update(frame: HudFrame, night: boolean): void {
    this.frame = frame;
    this.night = night;
    this.draw();
  }
  get verticalFovDeg(): number {
    return this.camera.fov;
  }
  arScene(at: number): HudArScene {
    const scene: HudArScene = {
      referenceFrame: `demo-${this.preset?.id}`,
      camera: arCamera(this.camera, at),
      objects: (this.worldObjects ?? []).map((object) => ({ ...object, at })),
    };
    const key = JSON.stringify([scene.camera.position, Math.floor(at * 5)]);
    if (key !== this.visibilityKey) {
      this.visibilityKey = key;
      void this.visibility?.update(scene, at);
    }
    return this.visibility?.apply(scene, at) ?? scene;
  }
  private draw(): void {
    if (!this.frame || !this.preset) return;
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    this.renderer.setSize(rect.width, rect.height, false);
    this.camera.aspect = rect.width / rect.height;
    this.camera.updateProjectionMatrix();
    const f = this.frame,
      north = ((f.latitudeDeg?.value ?? 59.9) - 59.9) * 111320,
      east = ((f.longitudeDeg?.value ?? 10.7) - 10.7) * 111320 * Math.cos((59.9 * Math.PI) / 180);
    const altitude =
      this.preset.domain === 'air'
        ? (f.altitudeM?.value ?? 0)
        : this.preset.domain === 'underwater'
          ? -(f.depthM?.value ?? 8)
          : 0;
    this.vehicle.position.set(east, altitude, -north);
    this.worldObjects ??= arObjects(
      [east, north, altitude],
      f.headingDeg?.value ?? 0,
      this.preset.domain,
    );
    this.vehicle.rotation.set(
      ((f.pitchDeg?.value ?? 0) * Math.PI) / 180,
      (-(f.headingDeg?.value ?? 0) * Math.PI) / 180,
      (-(f.rollDeg?.value ?? 0) * Math.PI) / 180,
      'YXZ',
    );
    this.rotors.forEach((rotor, i) => {
      rotor.rotation.y = f.time * 80 * (i % 2 ? 1 : -1);
    });
    const target = this.vehicle.position.clone();
    const isCamera = this.preset.secondary === 'pan';
    const q = isCamera
      ? new T.Quaternion().setFromEuler(
          new T.Euler(
            ((f.tiltDeg?.value ?? 0) * Math.PI) / 180,
            (-(f.headingDeg?.value ?? 0) * Math.PI) / 180,
            0,
            'YXZ',
          ),
        )
      : this.vehicle.quaternion;
    // Camera is attached to the body, forward of any obstructing geometry.
    const mount =
      this.preset.id === 'boat'
        ? new T.Vector3(0, 3, -1.2)
        : this.preset.id === 'rover'
          ? new T.Vector3(0, 2.3, -1.7)
          : this.preset.id === 'submarine'
            ? new T.Vector3(0, 0, -1.8)
            : isCamera
              ? new T.Vector3(0, 4, 0)
              : new T.Vector3(0, 0.2, -2.8);
    this.camera.position.copy(target).add(mount.applyQuaternion(q));
    this.camera.quaternion.copy(q);
    this.camera.fov = isCamera
      ? (2 *
          Math.atan(Math.tan((55 * Math.PI) / 360) / Math.max(1, f.zoomRatio?.value ?? 1)) *
          180) /
        Math.PI
      : 55;
    this.camera.updateProjectionMatrix();
    this.vehicle.visible = this.preset.id === 'boat';
    this.renderer.toneMapping = T.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = this.night ? 0.35 : 1;
    this.renderer.render(this.scene, this.camera);
  }
  destroy(): void {
    this.visibility?.destroy();
    this.observer.disconnect();
    for (const material of this.materials) material.dispose();
    for (const geometry of this.geometries) geometry.dispose();
    this.renderer.dispose();
  }
}
