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

// ══════════════════════════════════════════════════════════════
// Streak Names
// ══════════════════════════════════════════════════════════════

export function getStreakName(streak: number): string {
  if (streak >= 12) return 'PERFECT GAME!';
  if (streak >= 10) return streak + 'x UNSTOPPABLE!';
  if (streak >= 8) return 'Eight Bagger!';
  if (streak >= 7) return 'Seven Bagger!';
  if (streak >= 6) return 'Six Pack!';
  if (streak >= 5) return 'Five Bagger!';
  if (streak >= 4) return 'Four Bagger!';
  if (streak >= 3) return 'Turkey!';
  if (streak >= 2) return 'Double!';
  return 'STRIKE!';
}

// ══════════════════════════════════════════════════════════════
// Brooklyn Detection (ball hits opposite side of head pin)
// ══════════════════════════════════════════════════════════════

export function detectBrooklyn(ballX: number, pinsKnocked: boolean[], prevStanding: boolean[]): boolean {
  // Brooklyn = strike or hit from the "wrong side" of the head pin
  // For right-handed: ball hits left of head pin (negative x)
  // Simplified: if head pin is hit and ball is on the opposite side
  if (!prevStanding[0] || pinsKnocked[0]) return false; // head pin wasn't in play or wasn't hit
  if (prevStanding[0] && !pinsKnocked[0]) return false; // head pin not hit this throw

  // Head pin is at x=0; Brooklyn is when ball enters from the "wrong" side
  return Math.abs(ballX) > 0.03 && ballX > 0.03; // ball hit right side = Brooklyn for standard
}

// ══════════════════════════════════════════════════════════════
// Washout Detection (head pin down, leave pins on both sides)
// ══════════════════════════════════════════════════════════════

export function detectWashout(pinStanding: boolean[]): boolean {
  // Washout: head pin is down but pins remain on both sides
  if (pinStanding[0]) return false; // head pin must be down

  const leftPins = [3, 6, 7]; // pins 4,7,8
  const rightPins = [5, 8, 9]; // pins 6,9,10

  const hasLeft = leftPins.some(i => pinStanding[i]);
  const hasRight = rightPins.some(i => pinStanding[i]);

  return hasLeft && hasRight;
}

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
// Pin Wobble Effect (near-miss)
// ══════════════════════════════════════════════════════════════

export class PinWobble {
  private wobbles: Map<number, { time: number; amplitude: number; axis: Vector3 }> = new Map();

  startWobble(pinIndex: number, intensity = 1.0, dx = 0, dz = 1) {
    const len = Math.sqrt(dx * dx + dz * dz) || 1;
    this.wobbles.set(pinIndex, {
      time: 0,
      amplitude: 0.08 * intensity,
      axis: new Vector3(dx / len, 0, dz / len),
    });
  }

  update(dt: number, pinMeshes: any[], pinStanding: boolean[]) {
    for (const [idx, w] of this.wobbles) {
      if (!pinStanding[idx]) {
        this.wobbles.delete(idx);
        continue;
      }
      w.time += dt;
      const decay = Math.exp(-w.time * 6);
      const angle = Math.sin(w.time * 20) * w.amplitude * decay;
      const m = pinMeshes[idx];
      if (m) {
        m.rotation.x = w.axis.z * angle;
        m.rotation.z = -w.axis.x * angle;
      }
      if (decay < 0.01) {
        if (m) { m.rotation.x = 0; m.rotation.z = 0; }
        this.wobbles.delete(idx);
      }
    }
  }

  clear() { this.wobbles.clear(); }
}

// ══════════════════════════════════════════════════════════════
// Ball Return Machine
// ══════════════════════════════════════════════════════════════

export class BallReturn {
  private group: Group;
  private ballMesh: Mesh | null = null;
  private active = false;
  private progress = 0;
  private callback: (() => void) | null = null;
  private returnColor = 0x00ffff;

  constructor(parent: Object3D) {
    this.group = new Group();

    // Machine body at approach area
    const bodyMat = new MeshStandardMaterial({
      color: 0x111122,
      emissive: 0x001133,
      emissiveIntensity: 0.3,
    });

    // Main housing
    const housing = new Mesh(new BoxGeometry(0.5, 0.3, 0.4), bodyMat);
    housing.position.set(0.7, 0.15, 0.8);
    this.group.add(housing);

    // Top ramp
    const ramp = new Mesh(
      new BoxGeometry(0.4, 0.02, 0.35),
      new MeshStandardMaterial({
        color: 0x0a0a0a,
        emissive: 0x002244,
        emissiveIntensity: 0.15,
      }),
    );
    ramp.position.set(0.7, 0.31, 0.8);
    this.group.add(ramp);

    // Status light
    const light = new Mesh(
      new SphereGeometry(0.025, 8, 8),
      new MeshBasicMaterial({ color: 0x00ff44 }),
    );
    light.position.set(0.7, 0.35, 0.65);
    this.group.add(light);

    parent.add(this.group);
  }

  startReturn(ballColor: number, onComplete: () => void) {
    this.active = true;
    this.progress = 0;
    this.returnColor = ballColor;
    this.callback = onComplete;

    // Create a small ball for the return animation
    if (this.ballMesh) this.group.remove(this.ballMesh);
    this.ballMesh = new Mesh(
      new SphereGeometry(0.08, 8, 8),
      new MeshBasicMaterial({ color: ballColor }),
    );
    this.ballMesh.position.set(0.7, 0.35, 0.6);
    this.ballMesh.visible = false;
    this.group.add(this.ballMesh);
  }

  update(dt: number) {
    if (!this.active || !this.ballMesh) return;

    this.progress += dt * 1.5;

    if (this.progress < 0.3) {
      // Wait phase (ball in machine)
      this.ballMesh.visible = false;
    } else if (this.progress < 1.0) {
      // Ball emerges and rolls to center
      this.ballMesh.visible = true;
      const t = (this.progress - 0.3) / 0.7;
      const x = 0.7 * (1 - t);
      this.ballMesh.position.set(x, 0.35 - t * 0.24, 0.8);
      this.ballMesh.rotation.z -= dt * 8;
    } else {
      // Done
      this.active = false;
      this.ballMesh.visible = false;
      if (this.callback) this.callback();
    }
  }

  isActive(): boolean { return this.active; }
}

// ══════════════════════════════════════════════════════════════
// Scoring Monitor (decorative electronic display above lane)
// ══════════════════════════════════════════════════════════════

export class ScoringMonitor {
  private group: Group;
  private screenMesh: Mesh;
  private screenMat: MeshStandardMaterial;
  private pulseTime = 0;

  constructor(parent: Object3D) {
    this.group = new Group();

    // Monitor housing
    const housingMat = new MeshStandardMaterial({
      color: 0x0a0a0a,
      emissive: 0x001122,
      emissiveIntensity: 0.1,
    });
    const housing = new Mesh(new BoxGeometry(1.6, 0.6, 0.08), housingMat);
    housing.position.set(0, 3.5, -8);
    this.group.add(housing);

    // Screen (glowing)
    this.screenMat = new MeshStandardMaterial({
      color: 0x001122,
      emissive: 0x003366,
      emissiveIntensity: 0.5,
    });
    this.screenMesh = new Mesh(new PlaneGeometry(1.4, 0.45), this.screenMat);
    this.screenMesh.position.set(0, 3.5, -7.955);
    this.group.add(this.screenMesh);

    // Mount arm
    const arm = new Mesh(
      new CylinderGeometry(0.02, 0.02, 0.5, 6),
      housingMat,
    );
    arm.position.set(0, 3.8, -8);
    this.group.add(arm);

    // Second monitor (higher, angled)
    const housing2 = new Mesh(new BoxGeometry(1.2, 0.4, 0.06), housingMat);
    housing2.position.set(0, 3.7, -4);
    housing2.rotation.x = -0.15;
    this.group.add(housing2);

    const screen2 = new Mesh(
      new PlaneGeometry(1.05, 0.3),
      new MeshStandardMaterial({
        color: 0x001122,
        emissive: 0x002244,
        emissiveIntensity: 0.35,
      }),
    );
    screen2.position.set(0, 3.7, -3.965);
    screen2.rotation.x = -0.15;
    this.group.add(screen2);

    parent.add(this.group);
  }

  update(dt: number) {
    this.pulseTime += dt;
    const pulse = Math.sin(this.pulseTime * 0.8) * 0.1 + 0.5;
    this.screenMat.emissiveIntensity = pulse;
  }
}

// ══════════════════════════════════════════════════════════════
// Pin Glow (subtle pulse on standing pins during aiming)
// ══════════════════════════════════════════════════════════════

export class PinGlow {
  private time = 0;
  private originalEmissive = 0.15;

  update(dt: number, pinMeshes: any[], pinStanding: boolean[], isAiming: boolean) {
    if (!isAiming) {
      // Reset emissive to default
      for (let i = 0; i < pinMeshes.length; i++) {
        if (!pinStanding[i]) continue;
        const body = pinMeshes[i]?.children?.[0];
        if (body?.material) {
          body.material.emissiveIntensity = this.originalEmissive;
        }
      }
      return;
    }
    this.time += dt;
    for (let i = 0; i < pinMeshes.length; i++) {
      if (!pinStanding[i]) continue;
      const body = pinMeshes[i]?.children?.[0];
      if (body?.material) {
        const phase = this.time * 2 + i * 0.3;
        const pulse = Math.sin(phase) * 0.08 + this.originalEmissive + 0.05;
        body.material.emissiveIntensity = pulse;
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Pocket Target Indicator (shows ideal hit zone on pin deck)
// ══════════════════════════════════════════════════════════════

export class PocketTarget {
  private dots: Mesh[] = [];
  private container: Group;
  private time = 0;

  constructor(parent: Object3D) {
    this.container = new Group();
    parent.add(this.container);

    const dotGeo = new SphereGeometry(0.03, 8, 8);

    // Main pocket target (between pins 1 and 3)
    const mainDot = new Mesh(dotGeo, new MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.4,
      blending: AdditiveBlending,
    }));
    mainDot.position.set(0.08, 0.005, -16);
    this.container.add(mainDot);
    this.dots.push(mainDot);

    // Secondary targets (ideal entry angles)
    const secondaryPositions: [number, number][] = [
      [0.05, -15.8],
      [0.11, -16.15],
    ];
    for (const [x, z] of secondaryPositions) {
      const dot = new Mesh(
        new SphereGeometry(0.02, 6, 6),
        new MeshBasicMaterial({
          color: 0xffaa44,
          transparent: true,
          opacity: 0.25,
          blending: AdditiveBlending,
        }),
      );
      dot.position.set(x, 0.005, z);
      this.container.add(dot);
      this.dots.push(dot);
    }

    // Ring around main target
    const ringGeo = new CylinderGeometry(0.06, 0.06, 0.003, 16, 1, true);
    const ring = new Mesh(ringGeo, new MeshBasicMaterial({
      color: 0xff8800,
      transparent: true,
      opacity: 0.2,
      blending: AdditiveBlending,
      side: DoubleSide,
    }));
    ring.position.set(0.08, 0.006, -16);
    this.container.add(ring);
    this.dots.push(ring);

    this.container.visible = false;
  }

  show() { this.container.visible = true; }
  hide() { this.container.visible = false; }

  update(dt: number, isAiming: boolean) {
    if (!isAiming) {
      this.container.visible = false;
      return;
    }
    this.container.visible = true;
    this.time += dt;

    // Pulse the main target
    const pulse = Math.sin(this.time * 3) * 0.15 + 0.4;
    if (this.dots[0]?.material) {
      (this.dots[0].material as MeshBasicMaterial).opacity = pulse;
    }

    // Rotate the ring
    if (this.dots[3]) {
      this.dots[3].rotation.y += dt * 0.8;
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Lane Wear System (oil degrades over frames)
// ══════════════════════════════════════════════════════════════

export class LaneWear {
  private wearMap: number[] = []; // 0-1 wear per zone (0=fresh, 1=fully worn)
  private zones = 20; // number of lane zones
  private laneLength = 18;

  constructor() {
    this.reset();
  }

  reset() {
    this.wearMap = new Array(this.zones).fill(0);
  }

  /** Record ball path to increase wear along trajectory */
  recordBallPath(ballX: number, startZ: number, endZ: number) {
    for (let i = 0; i < this.zones; i++) {
      const zoneZ = -(i / this.zones) * this.laneLength;
      if (zoneZ < endZ || zoneZ > startZ) continue;
      // More wear near center, less on edges
      const centerness = 1 - Math.abs(ballX) / 0.55;
      const wearAmount = Math.max(0, centerness) * 0.03;
      this.wearMap[i] = Math.min(1, this.wearMap[i] + wearAmount);
    }
  }

  /** Get effective oil reduction at a point (0 = no wear, 1 = fully dry) */
  getWearAt(z: number): number {
    const idx = Math.floor(Math.abs(z) / this.laneLength * this.zones);
    if (idx < 0 || idx >= this.zones) return 0;
    return this.wearMap[idx];
  }

  /** Get overall wear percentage */
  getOverallWear(): number {
    const total = this.wearMap.reduce((a, b) => a + b, 0);
    return total / this.zones;
  }
}

// ══════════════════════════════════════════════════════════════
// Score Pop-up (floating score text after each throw)
// ══════════════════════════════════════════════════════════════

export class ScorePopup {
  private popups: { mesh: Mesh; velocity: number; life: number; maxLife: number }[] = [];
  private container: Group;

  constructor(parent: Object3D) {
    this.container = new Group();
    parent.add(this.container);
  }

  spawn(text: string, position: Vector3, color = 0x00ffff) {
    // Create a simple colored sphere as a visual marker (PanelUI handles text)
    // Instead, we use this to track the popup lifecycle
    const geo = new SphereGeometry(0.04, 8, 8);
    const mat = new MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.8,
      blending: AdditiveBlending,
    });
    const mesh = new Mesh(geo, mat);
    mesh.position.copy(position);
    this.container.add(mesh);

    this.popups.push({
      mesh,
      velocity: 1.5,
      life: 1.5,
      maxLife: 1.5,
    });
  }

  update(dt: number) {
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      p.mesh.position.y += p.velocity * dt;
      p.velocity *= 0.98; // slow down

      const t = p.life / p.maxLife;
      (p.mesh.material as MeshBasicMaterial).opacity = t * 0.8;
      p.mesh.scale.setScalar(0.5 + t * 0.5);

      if (p.life <= 0) {
        this.container.remove(p.mesh);
        this.popups.splice(i, 1);
      }
    }
  }

  clear() {
    for (const p of this.popups) {
      this.container.remove(p.mesh);
    }
    this.popups.length = 0;
  }
}

// ══════════════════════════════════════════════════════════════
// Spectator Silhouettes
// ══════════════════════════════════════════════════════════════

export class SpectatorArea {
  private group: Group;
  private heads: Mesh[] = [];
  private time = 0;

  constructor(parent: Object3D) {
    this.group = new Group();
    const bodyMat = new MeshStandardMaterial({
      color: 0x050508,
      emissive: 0x000000,
      emissiveIntensity: 0,
    });
    const headMat = new MeshStandardMaterial({
      color: 0x080810,
      emissive: 0x000811,
      emissiveIntensity: 0.05,
    });

    // Seating rows on both sides behind the player
    for (const side of [-1, 1]) {
      const baseX = side * 3.0;
      for (let row = 0; row < 2; row++) {
        const z = 2 + row * 1.2;
        const y = 0.4 + row * 0.3;
        for (let seat = 0; seat < 3; seat++) {
          const xOff = (seat - 1) * 0.55;
          // Bench/seat
          const seatMesh = new Mesh(new BoxGeometry(0.4, 0.05, 0.3), bodyMat);
          seatMesh.position.set(baseX + xOff, y, z);
          this.group.add(seatMesh);

          // Body (simple block)
          if (Math.random() > 0.2) { // 80% occupancy
            const body = new Mesh(new BoxGeometry(0.22, 0.45, 0.2), bodyMat);
            body.position.set(baseX + xOff, y + 0.27, z);
            this.group.add(body);

            // Head
            const head = new Mesh(new SphereGeometry(0.09, 6, 6), headMat);
            head.position.set(baseX + xOff, y + 0.55, z);
            this.group.add(head);
            this.heads.push(head);
          }
        }
      }

      // Bench backs
      for (let row = 0; row < 2; row++) {
        const z = 2.15 + row * 1.2;
        const y = 0.55 + row * 0.3;
        const bench = new Mesh(new BoxGeometry(2, 0.5, 0.04), bodyMat);
        bench.position.set(baseX, y, z);
        this.group.add(bench);
      }
    }

    parent.add(this.group);
  }

  /** Subtle head sway animation */
  update(dt: number) {
    this.time += dt;
    for (let i = 0; i < this.heads.length; i++) {
      const phase = i * 1.7;
      const sway = Math.sin(this.time * 0.3 + phase) * 0.02;
      this.heads[i].position.x += sway * dt;
    }
  }

  /** React to a strike/spare — heads bob */
  react(intensity: number) {
    for (const head of this.heads) {
      head.position.y += 0.03 * intensity;
      // Will settle back via natural sway
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Reactive Environment Lights (flash on events)
// ══════════════════════════════════════════════════════════════

export class ReactiveEnvironment {
  private scene: Object3D;
  private flashIntensity = 0;
  private flashColor: Color = new Color(0xffffff);
  private flashDecay = 3;
  private neonMaterials: MeshBasicMaterial[] = [];

  constructor(scene: Object3D) {
    this.scene = scene;

    // Create event-reactive neon strips along walls
    const stripGeo = new PlaneGeometry(0.05, 16);
    for (const side of [-1, 1]) {
      for (const h of [1.5, 2.5]) {
        const mat = new MeshBasicMaterial({
          color: 0x003388,
          transparent: true,
          opacity: 0.15,
          blending: AdditiveBlending,
          side: DoubleSide,
        });
        const strip = new Mesh(stripGeo, mat);
        strip.position.set(side * 3.48, h, -7);
        strip.rotation.y = side * Math.PI / 2;
        scene.add(strip);
        this.neonMaterials.push(mat);
      }
    }
  }

  flash(color: number, intensity = 1) {
    this.flashIntensity = intensity;
    this.flashColor.setHex(color);
  }

  update(dt: number) {
    if (this.flashIntensity > 0.01) {
      this.flashIntensity *= Math.exp(-this.flashDecay * dt);
      for (const mat of this.neonMaterials) {
        mat.color.copy(this.flashColor);
        mat.opacity = 0.15 + this.flashIntensity * 0.6;
      }
    } else {
      this.flashIntensity = 0;
      for (const mat of this.neonMaterials) {
        mat.color.setHex(0x003388);
        mat.opacity = 0.15;
      }
    }
  }
}

// ══════════════════════════════════════════════════════════════
// Title Screen Auto-Demo
// ══════════════════════════════════════════════════════════════

export class TitleDemo {
  private active = false;
  private ballMesh: Mesh;
  private ballZ = 0.3;
  private ballX = 0;
  private ballVelZ = 0;
  private spin = 0;
  private timer = 0;
  private phase: 'idle' | 'rolling' | 'pausing' = 'idle';
  private pauseTimer = 0;

  constructor(parent: Object3D) {
    const mat = new MeshStandardMaterial({
      color: 0x004488,
      emissive: 0x00bbff,
      emissiveIntensity: 0.5,
    });
    this.ballMesh = new Mesh(new SphereGeometry(0.11, 12, 12), mat);
    this.ballMesh.position.set(0, 0.111, 0.3);
    this.ballMesh.visible = false;
    parent.add(this.ballMesh);
  }

  start() {
    this.active = true;
    this.phase = 'idle';
    this.timer = 2;
    this.ballMesh.visible = false;
  }

  stop() {
    this.active = false;
    this.ballMesh.visible = false;
  }

  update(dt: number): boolean { // returns true if ball hits pin zone
    if (!this.active) return false;

    if (this.phase === 'idle') {
      this.timer -= dt;
      if (this.timer <= 0) {
        // Launch a demo ball
        this.phase = 'rolling';
        this.ballZ = 0.3;
        this.ballX = (Math.random() - 0.5) * 0.4;
        this.spin = (Math.random() - 0.5) * 0.8;
        this.ballVelZ = -(8 + Math.random() * 4);
        this.ballMesh.visible = true;
        this.ballMesh.position.set(this.ballX, 0.111, this.ballZ);
      }
    } else if (this.phase === 'rolling') {
      this.ballX += this.spin * 0.7 * dt * dt * 50;
      this.ballZ += this.ballVelZ * dt;
      this.ballMesh.position.set(this.ballX, 0.111, this.ballZ);
      this.ballMesh.rotation.x -= this.ballVelZ * dt / 0.11;

      if (this.ballZ < -17) {
        this.phase = 'pausing';
        this.pauseTimer = 3;
        this.ballMesh.visible = false;
        return true; // hit pin zone
      }
    } else if (this.phase === 'pausing') {
      this.pauseTimer -= dt;
      if (this.pauseTimer <= 0) {
        this.phase = 'idle';
        this.timer = 1.5 + Math.random() * 2;
      }
    }
    return false;
  }

  isActive(): boolean { return this.active; }
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
