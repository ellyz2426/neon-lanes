import {
  Group,
  Mesh,
  SphereGeometry,
  PlaneGeometry,
  BoxGeometry,
  CylinderGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  LineBasicMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  LineSegments,
  AdditiveBlending,
  DoubleSide,
  Vector3,
  Color,
  Object3D,
} from '@iwsdk/core';

// ══════════════════════════════════════════════════════════════
// Particle System
// ══════════════════════════════════════════════════════════════

interface Particle {
  mesh: Mesh;
  velocity: Vector3;
  life: number;
  maxLife: number;
  gravity: number;
  fadeOut: boolean;
  shrink: boolean;
}

export class ParticleSystem {
  private particles: Particle[] = [];
  private pool: Mesh[] = [];
  private container: Object3D;
  private particleGeo = new SphereGeometry(0.02, 4, 4);

  constructor(parent: Object3D) {
    this.container = new Group();
    parent.add(this.container);
  }

  private getParticleMesh(color: number): Mesh {
    let mesh = this.pool.pop();
    if (!mesh) {
      mesh = new Mesh(
        this.particleGeo,
        new MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: AdditiveBlending }),
      );
    } else {
      (mesh.material as MeshBasicMaterial).color.setHex(color);
      (mesh.material as MeshBasicMaterial).opacity = 1;
    }
    mesh.visible = true;
    mesh.scale.set(1, 1, 1);
    this.container.add(mesh);
    return mesh;
  }

  emit(pos: Vector3, count: number, color: number, speed = 3, life = 1.2, gravity = 2, spread = 1) {
    for (let i = 0; i < count; i++) {
      const mesh = this.getParticleMesh(color);
      mesh.position.copy(pos);

      const dir = new Vector3(
        (Math.random() - 0.5) * 2 * spread,
        Math.random() * 1.5 + 0.5,
        (Math.random() - 0.5) * 2 * spread,
      ).normalize().multiplyScalar(speed * (0.5 + Math.random() * 0.5));

      this.particles.push({
        mesh,
        velocity: dir,
        life,
        maxLife: life,
        gravity,
        fadeOut: true,
        shrink: true,
      });
    }
  }

  emitStrike(pos: Vector3) {
    // Gold + cyan burst
    this.emit(pos, 30, 0xffcc00, 5, 1.5, 3, 1.5);
    this.emit(pos, 20, 0x00ffff, 4, 1.2, 2.5, 1.2);
    this.emit(pos, 10, 0xff4400, 3.5, 1.0, 2, 1.0);
  }

  emitSpare(pos: Vector3) {
    // Cyan + blue burst
    this.emit(pos, 20, 0x00ffff, 3.5, 1.0, 2.5, 1.0);
    this.emit(pos, 12, 0x4488ff, 3, 0.9, 2, 0.8);
  }

  emitGutter(pos: Vector3) {
    // Dull red puff
    this.emit(pos, 8, 0xff2200, 1.5, 0.6, 4, 0.3);
  }

  emitPinHit(pos: Vector3, count: number) {
    // White sparks
    this.emit(pos, Math.min(count * 3, 15), 0xffffff, 2, 0.5, 3, 0.5);
    this.emit(pos, count * 2, 0xffcc66, 1.8, 0.4, 2.5, 0.4);
  }

  emitLevelUp(pos: Vector3) {
    this.emit(pos, 40, 0xffcc00, 6, 2, 1.5, 2);
    this.emit(pos, 25, 0xff00ff, 5, 1.8, 1, 1.5);
    this.emit(pos, 15, 0x00ffff, 4, 1.5, 1, 1.2);
  }

  update(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.visible = false;
        this.container.remove(p.mesh);
        this.pool.push(p.mesh);
        this.particles.splice(i, 1);
        continue;
      }

      p.velocity.y -= p.gravity * dt;
      p.mesh.position.addScaledVector(p.velocity, dt);

      const t = p.life / p.maxLife;
      if (p.fadeOut) {
        (p.mesh.material as MeshBasicMaterial).opacity = t;
      }
      if (p.shrink) {
        p.mesh.scale.setScalar(t);
      }
    }
  }

  clear() {
    for (const p of this.particles) {
      p.mesh.visible = false;
      this.container.remove(p.mesh);
      this.pool.push(p.mesh);
    }
    this.particles.length = 0;
  }
}

// ══════════════════════════════════════════════════════════════
// Ball Trail
// ══════════════════════════════════════════════════════════════

interface TrailPoint {
  position: Vector3;
  age: number;
}

export class BallTrail {
  private points: TrailPoint[] = [];
  private trailMeshes: Mesh[] = [];
  private container: Object3D;
  private maxPoints = 30;
  private trailLife = 0.5;
  private trailGeo = new SphereGeometry(0.025, 4, 4);
  private color: number;

  constructor(parent: Object3D, color = 0x00ffff) {
    this.container = new Group();
    this.color = color;
    parent.add(this.container);

    // Pre-create trail meshes
    for (let i = 0; i < this.maxPoints; i++) {
      const mat = new MeshBasicMaterial({
        color: this.color,
        transparent: true,
        opacity: 0,
        blending: AdditiveBlending,
      });
      const mesh = new Mesh(this.trailGeo, mat);
      mesh.visible = false;
      this.container.add(mesh);
      this.trailMeshes.push(mesh);
    }
  }

  setColor(color: number) {
    this.color = color;
    for (const m of this.trailMeshes) {
      (m.material as MeshBasicMaterial).color.setHex(color);
    }
  }

  addPoint(pos: Vector3) {
    this.points.push({ position: pos.clone(), age: 0 });
    if (this.points.length > this.maxPoints) {
      this.points.shift();
    }
  }

  update(dt: number) {
    // Age out points
    for (let i = this.points.length - 1; i >= 0; i--) {
      this.points[i].age += dt;
      if (this.points[i].age > this.trailLife) {
        this.points.splice(i, 1);
      }
    }

    // Update visuals
    for (let i = 0; i < this.maxPoints; i++) {
      const mesh = this.trailMeshes[i];
      if (i < this.points.length) {
        const p = this.points[i];
        mesh.visible = true;
        mesh.position.copy(p.position);
        const t = 1 - (p.age / this.trailLife);
        (mesh.material as MeshBasicMaterial).opacity = t * 0.6;
        mesh.scale.setScalar(t * 0.8 + 0.2);
      } else {
        mesh.visible = false;
      }
    }
  }

  clear() {
    this.points.length = 0;
    for (const m of this.trailMeshes) {
      m.visible = false;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Aim Guide Line
// ══════════════════════════════════════════════════════════════

export class AimGuide {
  private dots: Mesh[] = [];
  private container: Group;
  private dotCount = 20;

  constructor(parent: Object3D) {
    this.container = new Group();
    parent.add(this.container);

    const dotGeo = new SphereGeometry(0.015, 6, 6);
    for (let i = 0; i < this.dotCount; i++) {
      const mat = new MeshBasicMaterial({
        color: 0x00ffff,
        transparent: true,
        opacity: 0.5,
        blending: AdditiveBlending,
      });
      const dot = new Mesh(dotGeo, mat);
      dot.visible = false;
      this.container.add(dot);
      this.dots.push(dot);
    }
  }

  show(startX: number, startZ: number, spin: number, laneWidth: number) {
    const halfLane = laneWidth / 2;
    const spinCurve = spin * 0.7; // match SPIN_CURVE_FACTOR

    for (let i = 0; i < this.dotCount; i++) {
      const t = (i + 1) / this.dotCount;
      const z = startZ - t * 17; // project down the lane
      // Parabolic curve from spin
      const curveX = startX + spinCurve * t * t * 3;
      const dot = this.dots[i];

      // Fade out if outside the lane
      const inLane = Math.abs(curveX) < halfLane;
      dot.visible = true;
      dot.position.set(curveX, 0.01, z);
      const fadeFar = 1 - t * 0.6;
      const fadeGutter = inLane ? 1 : 0.15;
      (dot.material as MeshBasicMaterial).opacity = fadeFar * fadeGutter * 0.4;
      dot.scale.setScalar(0.5 + (1 - t) * 0.8);
    }
  }

  hide() {
    for (const d of this.dots) d.visible = false;
  }

  setColor(color: number) {
    for (const d of this.dots) {
      (d.material as MeshBasicMaterial).color.setHex(color);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Pin Sweep Animation
// ══════════════════════════════════════════════════════════════

export class PinSweep {
  private bar: Mesh;
  private active = false;
  private progress = 0;
  private startZ: number;
  private endZ: number;
  private callback: (() => void) | null = null;

  constructor(parent: Object3D, laneWidth: number, pinZoneZ: number) {
    const barGeo = new BoxGeometry(laneWidth + 0.4, 0.5, 0.05);
    const barMat = new MeshStandardMaterial({
      color: 0x111122,
      emissive: 0x003366,
      emissiveIntensity: 0.4,
    });
    this.bar = new Mesh(barGeo, barMat);
    this.bar.visible = false;
    this.bar.position.y = 0.25;
    parent.add(this.bar);

    this.startZ = pinZoneZ + 2;
    this.endZ = pinZoneZ - 2;
  }

  start(onComplete: () => void) {
    this.active = true;
    this.progress = 0;
    this.bar.visible = true;
    this.bar.position.z = this.startZ;
    this.callback = onComplete;
  }

  update(dt: number) {
    if (!this.active) return;
    this.progress += dt * 2; // speed
    const t = Math.min(this.progress, 1);

    if (t < 0.5) {
      // Sweep forward
      this.bar.position.z = this.startZ + (this.endZ - this.startZ) * (t * 2);
    } else {
      // Sweep back
      this.bar.position.z = this.endZ + (this.startZ - this.endZ) * ((t - 0.5) * 2);
    }

    if (t >= 1) {
      this.active = false;
      this.bar.visible = false;
      if (this.callback) this.callback();
    }
  }

  isActive(): boolean {
    return this.active;
  }
}

// ══════════════════════════════════════════════════════════════
// Lane Themes
// ══════════════════════════════════════════════════════════════

export interface LaneTheme {
  name: string;
  bgColor: number;
  fogColor: number;
  edgeColor: number;
  accentColor: number;
  warmLight: number;
  wallEmissive: number;
  beamEmissive: number;
}

export const LANE_THEMES: LaneTheme[] = [
  {
    name: 'Neon Blue',
    bgColor: 0x000811,
    fogColor: 0x000811,
    edgeColor: 0x00ffff,
    accentColor: 0x0066ff,
    warmLight: 0xff8800,
    wallEmissive: 0x003388,
    beamEmissive: 0x0055aa,
  },
  {
    name: 'Neon Purple',
    bgColor: 0x080011,
    fogColor: 0x080011,
    edgeColor: 0xcc66ff,
    accentColor: 0x8800ff,
    warmLight: 0xff44aa,
    wallEmissive: 0x330088,
    beamEmissive: 0x5500aa,
  },
  {
    name: 'Neon Green',
    bgColor: 0x001108,
    fogColor: 0x001108,
    edgeColor: 0x00ff88,
    accentColor: 0x006644,
    warmLight: 0xffaa00,
    wallEmissive: 0x004422,
    beamEmissive: 0x00aa44,
  },
  {
    name: 'Neon Red',
    bgColor: 0x110008,
    fogColor: 0x110008,
    edgeColor: 0xff4444,
    accentColor: 0xff2200,
    warmLight: 0xff6600,
    wallEmissive: 0x440011,
    beamEmissive: 0xaa2200,
  },
];

// ══════════════════════════════════════════════════════════════
// Environment Decorations
// ══════════════════════════════════════════════════════════════

export function buildBackstop(parent: Object3D, laneWidth: number, pinZoneZ: number) {
  // Back wall behind pins
  const wallGeo = new PlaneGeometry(laneWidth + 1.5, 2.5);
  const wallMat = new MeshStandardMaterial({
    color: 0x0a0a0a,
    emissive: 0x001122,
    emissiveIntensity: 0.15,
  });
  const wall = new Mesh(wallGeo, wallMat);
  wall.position.set(0, 1.25, pinZoneZ - 2);
  parent.add(wall);

  // Pin pit (dark area behind pins)
  const pitGeo = new PlaneGeometry(laneWidth + 1, 2);
  const pitMat = new MeshStandardMaterial({
    color: 0x020202,
    emissive: 0x000811,
    emissiveIntensity: 0.05,
  });
  const pit = new Mesh(pitGeo, pitMat);
  pit.rotation.x = -Math.PI / 2;
  pit.position.set(0, -0.04, pinZoneZ - 1.5);
  parent.add(pit);

  // Backstop cushion (above lane at back)
  const cushionGeo = new BoxGeometry(laneWidth + 0.6, 0.15, 0.15);
  const cushionMat = new MeshStandardMaterial({
    color: 0x1a0a0a,
    emissive: 0x330000,
    emissiveIntensity: 0.2,
  });
  const cushion = new Mesh(cushionGeo, cushionMat);
  cushion.position.set(0, 0.08, pinZoneZ - 2);
  parent.add(cushion);
}

export function buildNeonSigns(parent: Object3D) {
  // Floating neon ring decorations on walls
  const ringGeo = new CylinderGeometry(0.35, 0.35, 0.02, 16, 1, true);

  const colors = [0x00ffff, 0xff00ff, 0xffcc00, 0x00ff66];
  const positions: [number, number, number][] = [
    [-3.4, 2.5, -4],
    [3.4, 2.5, -4],
    [-3.4, 2.5, -10],
    [3.4, 2.5, -10],
  ];

  for (let i = 0; i < positions.length; i++) {
    const mat = new MeshBasicMaterial({
      color: colors[i],
      transparent: true,
      opacity: 0.4,
      side: DoubleSide,
      blending: AdditiveBlending,
    });
    const ring = new Mesh(ringGeo, mat);
    ring.rotation.z = Math.PI / 2;
    ring.rotation.y = i % 2 === 0 ? Math.PI / 2 : -Math.PI / 2;
    ring.position.set(...positions[i]);
    parent.add(ring);
  }

  // Horizontal neon tubes on ceiling
  const tubeGeo = new CylinderGeometry(0.015, 0.015, 6, 6);
  const tubeMat = new MeshBasicMaterial({
    color: 0x00aaff,
    transparent: true,
    opacity: 0.25,
    blending: AdditiveBlending,
  });

  for (const z of [-2, -8, -14]) {
    const tube = new Mesh(tubeGeo, tubeMat);
    tube.rotation.z = Math.PI / 2;
    tube.position.set(0, 3.95, z);
    parent.add(tube);
  }
}

export function buildSideLanes(parent: Object3D, laneLen: number) {
  // Ghost lanes on either side (non-playable, atmospheric)
  for (const side of [-1, 1]) {
    const offset = side * 2.6;

    // Lane surface
    const laneGeo = new PlaneGeometry(0.8, laneLen);
    const laneMat = new MeshStandardMaterial({
      color: 0x0d0704,
      emissive: 0x080400,
      emissiveIntensity: 0.04,
    });
    const lane = new Mesh(laneGeo, laneMat);
    lane.rotation.x = -Math.PI / 2;
    lane.position.set(offset, -0.01, -laneLen / 2 + 1);
    parent.add(lane);

    // Edge lines
    const edgeMat = new LineBasicMaterial({
      color: 0x004466,
      transparent: true,
      opacity: 0.2,
    });
    for (const es of [-0.4, 0.4]) {
      const g = new BufferGeometry();
      const x = offset + es;
      g.setAttribute('position', new Float32BufferAttribute([x, 0.002, 1.5, x, 0.002, -laneLen + 1], 3));
      parent.add(new LineSegments(g, edgeMat));
    }

    // Ghost pin silhouettes
    const ghostPinGeo = new CylinderGeometry(0.035, 0.04, 0.25, 6);
    const ghostPinMat = new MeshStandardMaterial({
      color: 0x222222,
      emissive: 0x111111,
      emissiveIntensity: 0.05,
    });
    const pinPositions = [
      [0, 0], [-0.12, -0.2], [0.12, -0.2],
      [-0.24, -0.4], [0, -0.4], [0.24, -0.4],
    ];
    for (const [px, pz] of pinPositions) {
      const pin = new Mesh(ghostPinGeo, ghostPinMat);
      pin.position.set(offset + px, 0.125, -16 + pz);
      parent.add(pin);
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Lane Theme Manager
// ══════════════════════════════════════════════════════════════

export class LaneThemeManager {
  private scene: Object3D;
  private currentTheme = 0;
  private pulseTime = 0;
  private pulseLights: { light: any; baseIntensity: number; phase: number }[] = [];

  constructor(scene: Object3D) {
    this.scene = scene;
  }

  applyTheme(themeIndex: number) {
    this.currentTheme = themeIndex;
    const theme = LANE_THEMES[themeIndex] || LANE_THEMES[0];

    // Update scene background and fog
    if ((this.scene as any).background) {
      (this.scene as any).background.setHex(theme.bgColor);
    }
    if ((this.scene as any).fog) {
      (this.scene as any).fog.color.setHex(theme.fogColor);
    }
  }

  registerPulseLight(light: any, baseIntensity: number, phase: number) {
    this.pulseLights.push({ light, baseIntensity, phase });
  }

  update(dt: number) {
    this.pulseTime += dt;
    for (const pl of this.pulseLights) {
      const pulse = Math.sin(this.pulseTime * 1.5 + pl.phase) * 0.12 + 1.0;
      pl.light.intensity = pl.baseIntensity * pulse;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Oil Pattern System
// ══════════════════════════════════════════════════════════════

export interface OilPattern {
  name: string;
  desc: string;
  length: number;
  slickness: number;
  crown: number;
}

export const OIL_PATTERNS: OilPattern[] = [
  { name: 'House', desc: 'Beginner-friendly', length: 10, slickness: 0.3, crown: 0.7 },
  { name: 'Sport', desc: 'Flat and challenging', length: 12, slickness: 0.5, crown: 0.2 },
  { name: 'Cheetah', desc: 'Short and fast', length: 6, slickness: 0.6, crown: 0.4 },
  { name: 'Shark', desc: 'Long and heavy', length: 15, slickness: 0.7, crown: 0.5 },
  { name: 'Dry', desc: 'No oil, max hook', length: 0, slickness: 0.0, crown: 0.0 },
];

export function getOilSpinMultiplier(pattern: OilPattern, ballZ: number, ballX: number, laneWidth: number): number {
  if (ballZ > 0) return 1.0;
  const distFromFoul = Math.abs(ballZ);
  if (distFromFoul < pattern.length) {
    const lateralPos = Math.abs(ballX) / (laneWidth / 2);
    const crownMul = 1 - pattern.crown * (1 - lateralPos);
    return 1 - (pattern.slickness * crownMul);
  }
  const pastOil = distFromFoul - pattern.length;
  const transition = Math.min(1, pastOil / 2);
  return 1 - (pattern.slickness * (1 - transition));
}

// ══════════════════════════════════════════════════════════════
// Pin Standing Diagram
// ══════════════════════════════════════════════════════════════

export function getPinDiagram(standing: boolean[]): string {
  const s = (i: number) => standing[i] ? 'O' : '.';
  return (
    s(6) + ' ' + s(7) + ' ' + s(8) + ' ' + s(9) + '\n' +
    ' ' + s(3) + ' ' + s(4) + ' ' + s(5) + '\n' +
    '  ' + s(1) + ' ' + s(2) + '\n' +
    '   ' + s(0)
  );
}

// ══════════════════════════════════════════════════════════════
// Oil Pattern Visualizer
// ══════════════════════════════════════════════════════════════

export class OilPatternVisual {
  private mesh: Mesh;
  private visible = false;

  constructor(parent: Object3D, laneWidth: number) {
    const geo = new PlaneGeometry(laneWidth, 1);
    const mat = new MeshBasicMaterial({
      color: 0x224488,
      transparent: true,
      opacity: 0.06,
      side: DoubleSide,
    });
    this.mesh = new Mesh(geo, mat);
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.position.set(0, 0.003, 0);
    this.mesh.visible = false;
    parent.add(this.mesh);
  }

  show(pattern: OilPattern, laneWidth: number) {
    if (pattern.length <= 0) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.scale.set(1, pattern.length, 1);
    this.mesh.position.z = -pattern.length / 2;
    this.mesh.visible = true;
    (this.mesh.material as MeshBasicMaterial).opacity = 0.04 + pattern.slickness * 0.06;
  }

  hide() {
    this.mesh.visible = false;
  }
}

// ══════════════════════════════════════════════════════════════
// Animated Floor Arrows
// ══════════════════════════════════════════════════════════════

export class FloorArrows {
  private arrows: Mesh[] = [];
  private time = 0;

  constructor(parent: Object3D) {
    // Chevron arrows pointing down the lane
    const arrowGeo = new PlaneGeometry(0.12, 0.06);
    const arrowMat = new MeshBasicMaterial({
      color: 0x00ffff,
      transparent: true,
      opacity: 0.2,
      side: DoubleSide,
    });

    for (let i = 0; i < 5; i++) {
      const arrow = new Mesh(arrowGeo, arrowMat.clone());
      arrow.rotation.x = -Math.PI / 2;
      arrow.position.set(0, 0.004, -2 - i * 1.5);
      parent.add(arrow);
      this.arrows.push(arrow);
    }
  }

  update(dt: number, isAiming: boolean) {
    this.time += dt;
    for (let i = 0; i < this.arrows.length; i++) {
      const arrow = this.arrows[i];
      if (isAiming) {
        const pulse = Math.sin(this.time * 3 + i * 0.6) * 0.5 + 0.5;
        (arrow.material as MeshBasicMaterial).opacity = 0.1 + pulse * 0.25;
        arrow.visible = true;
      } else {
        (arrow.material as MeshBasicMaterial).opacity = 0.08;
        arrow.visible = true;
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Ambient Music (oscillator-based)
// ══════════════════════════════════════════════════════════════

export class AmbientMusic {
  private ctx: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private oscs: OscillatorNode[] = [];
  private playing = false;
  private volume = 0.06;

  start(vol = 0.06) {
    if (this.playing) return;
    try {
      this.ctx = new AudioContext();
      this.gainNode = this.ctx.createGain();
      this.gainNode.gain.value = vol;
      this.volume = vol;
      this.gainNode.connect(this.ctx.destination);

      // Soft pad: root + fifth + octave
      const freqs = [55, 82.5, 110, 165]; // A1 chord tones
      for (const freq of freqs) {
        const osc = this.ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.value = freq;
        const oscGain = this.ctx.createGain();
        oscGain.gain.value = 0.3 / freqs.length;
        osc.connect(oscGain).connect(this.gainNode);
        osc.start();
        this.oscs.push(osc);
      }

      // Very slow LFO modulating the pad
      const lfo = this.ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.value = 0.15; // very slow
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 3; // subtle frequency wobble
      lfo.connect(lfoGain);
      // Connect LFO to first oscillator frequency
      if (this.oscs[0]) {
        lfoGain.connect(this.oscs[0].frequency);
      }
      lfo.start();
      this.oscs.push(lfo);

      this.playing = true;
    } catch { /* audio not available */ }
  }

  stop() {
    if (!this.playing || !this.ctx) return;
    for (const osc of this.oscs) {
      try { osc.stop(); } catch { /* */ }
    }
    this.oscs = [];
    this.playing = false;
    try { this.ctx.close(); } catch { /* */ }
    this.ctx = null;
  }

  setVolume(vol: number) {
    this.volume = vol;
    if (this.gainNode) this.gainNode.gain.value = vol;
  }

  isPlaying(): boolean { return this.playing; }
}
