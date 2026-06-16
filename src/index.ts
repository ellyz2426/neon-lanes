import {
  World,
  PanelUI,
  Follower,
  Mesh,
  Group,
  BoxGeometry,
  CylinderGeometry,
  PlaneGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Color,
  AmbientLight,
  PointLight,
  DirectionalLight,
  SpotLight,
  Fog,
  DoubleSide,
  LineSegments,
  LineBasicMaterial,
  BufferGeometry,
  Float32BufferAttribute,
  AdditiveBlending,
} from '@iwsdk/core';

import { BowlingSystem } from './game-system.js';
import { buildBackstop, buildNeonSigns, buildSideLanes, SpectatorArea } from './effects.js';

async function main() {
  const container = document.getElementById('app') as HTMLDivElement;

  const world = await World.create(container, {
    xr: { offer: 'once' as const },
    render: {
      fov: 60,
      near: 0.1,
      far: 100,
      defaultLighting: false,
    },
    features: {
      physics: false,
      locomotion: false,
      grabbing: false,
    },
  });

  // Camera behind the foul line, looking down the lane
  world.camera.position.set(0, 1.7, 1.0);
  world.camera.lookAt(0, 0.5, -15);

  // Scene atmosphere
  world.scene.background = new Color(0x000811);
  world.scene.fog = new Fog(0x000811, 30, 65);

  // -- Lighting --
  world.scene.add(new AmbientLight(0x112244, 0.4));

  const dirLight = new DirectionalLight(0x4488ff, 0.45);
  dirLight.position.set(0, 10, -8);
  world.scene.add(dirLight);

  // Lane accent lights
  for (let i = 0; i < 5; i++) {
    const pl = new PointLight(0x00ffff, 0.8, 20);
    pl.position.set(i % 2 === 0 ? -1.8 : 1.8, 3.2, -i * 4 - 1);
    world.scene.add(pl);
  }

  // Pin area warm light
  const pinLight = new PointLight(0xff8800, 1.2, 12);
  pinLight.position.set(0, 3, -16.5);
  world.scene.add(pinLight);

  // Spotlight on pin area for drama
  const pinSpot = new SpotLight(0xffeedd, 0.6, 20, Math.PI / 8, 0.5);
  pinSpot.position.set(0, 5, -14);
  pinSpot.target.position.set(0, 0, -16);
  world.scene.add(pinSpot);
  world.scene.add(pinSpot.target);

  // Foul line accent light
  const foulLight = new PointLight(0xff4444, 0.3, 5);
  foulLight.position.set(0, 0.5, 0);
  world.scene.add(foulLight);

  // -- Build bowling environment --
  buildLane(world);

  // -- Environment enhancements --
  buildBackstop(world.scene, 1.1, -16);
  buildNeonSigns(world.scene);
  buildSideLanes(world.scene, 18);

  // -- Spectator area (atmospheric silhouettes) --
  const _spectators = new SpectatorArea(world.scene);

  // -- Create panels (all follower-based for VR/browser compatibility) --
  const panels: { config: string; offset: [number, number, number]; speed: number }[] = [
    { config: './ui/title.json', offset: [0, 0.1, -3], speed: 6 },
    { config: './ui/modeselect.json', offset: [0, 0, -3], speed: 6 },
    { config: './ui/hud.json', offset: [0, -0.65, -2], speed: 8 },
    { config: './ui/scorecard.json', offset: [0.85, 0.15, -2.5], speed: 6 },
    { config: './ui/powerbar.json', offset: [0, -0.35, -1.5], speed: 10 },
    { config: './ui/gameover.json', offset: [0, 0.1, -3], speed: 6 },
    { config: './ui/pause.json', offset: [0, 0.1, -2.5], speed: 6 },
    { config: './ui/leaderboard.json', offset: [0, 0, -3], speed: 6 },
    { config: './ui/achievements.json', offset: [0, 0, -3], speed: 6 },
    { config: './ui/settings.json', offset: [0, 0, -3], speed: 6 },
    { config: './ui/help.json', offset: [0, 0, -3], speed: 6 },
    { config: './ui/ballselect.json', offset: [0, 0, -3], speed: 6 },
    { config: './ui/stats.json', offset: [0, 0, -3], speed: 6 },
    { config: './ui/toast.json', offset: [0, 0.45, -1.5], speed: 10 },
    { config: './ui/countdown.json', offset: [0, 0.2, -2], speed: 10 },
  ];

  for (const p of panels) {
    const entity = world.createTransformEntity();
    entity.addComponent(PanelUI, { config: p.config });
    entity.addComponent(Follower, {
      target: world.camera,
      offsetPosition: p.offset,
      speed: p.speed,
    });
  }

  world.registerSystem(BowlingSystem);
}

// ── Lane geometry ────────────────────────────────────────────

function buildLane(world: World) {
  const LANE_LEN = 18;
  const LANE_W = 1.1;
  const GUTTER_W = 0.25;

  // Alley floor
  const floorGeo = new PlaneGeometry(7, LANE_LEN + 6);
  const floorMat = new MeshStandardMaterial({
    color: 0x000d1a,
    emissive: 0x001122,
    emissiveIntensity: 0.12,
  });
  const floor = new Mesh(floorGeo, floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.set(0, -0.02, -LANE_LEN / 2 + 2);
  world.scene.add(floor);

  // Lane surface (wooden look with dark tones)
  const laneGeo = new PlaneGeometry(LANE_W, LANE_LEN);
  const laneMat = new MeshStandardMaterial({
    color: 0x1a0e04,
    emissive: 0x110800,
    emissiveIntensity: 0.08,
  });
  const lane = new Mesh(laneGeo, laneMat);
  lane.rotation.x = -Math.PI / 2;
  lane.position.set(0, 0.001, -LANE_LEN / 2 + 1);
  world.scene.add(lane);

  // Gutters (depressed channels)
  for (const s of [-1, 1]) {
    // Gutter floor (lower than lane)
    const gGeo = new PlaneGeometry(GUTTER_W, LANE_LEN);
    const gMat = new MeshStandardMaterial({
      color: 0x0a0a0a,
      emissive: 0x002244,
      emissiveIntensity: 0.15,
    });
    const g = new Mesh(gGeo, gMat);
    g.rotation.x = -Math.PI / 2;
    g.position.set(s * (LANE_W / 2 + GUTTER_W / 2), -0.04, -LANE_LEN / 2 + 1);
    world.scene.add(g);

    // Gutter inner wall (slight lip)
    const lipGeo = new BoxGeometry(0.02, 0.04, LANE_LEN);
    const lipMat = new MeshStandardMaterial({
      color: 0x111111,
      emissive: 0x001133,
      emissiveIntensity: 0.1,
    });
    const lip = new Mesh(lipGeo, lipMat);
    lip.position.set(s * LANE_W / 2, -0.02, -LANE_LEN / 2 + 1);
    world.scene.add(lip);
  }

  // Approach area (behind foul line)
  const approachGeo = new PlaneGeometry(LANE_W + GUTTER_W * 2, 2);
  const approachMat = new MeshStandardMaterial({
    color: 0x111111,
    emissive: 0x001133,
    emissiveIntensity: 0.1,
  });
  const approach = new Mesh(approachGeo, approachMat);
  approach.rotation.x = -Math.PI / 2;
  approach.position.set(0, 0.001, 1);
  world.scene.add(approach);

  // Pin deck (slightly lighter area at the end)
  const deckGeo = new PlaneGeometry(LANE_W + 0.3, 1.5);
  const deckMat = new MeshStandardMaterial({
    color: 0x1a0e04,
    emissive: 0x331a00,
    emissiveIntensity: 0.12,
  });
  const deck = new Mesh(deckGeo, deckMat);
  deck.rotation.x = -Math.PI / 2;
  deck.position.set(0, 0.002, -16.5);
  world.scene.add(deck);

  // Lane neon edge lines
  const edgeMat = new LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.5 });
  for (const s of [-1, 1]) {
    const g = new BufferGeometry();
    const x = s * LANE_W / 2;
    g.setAttribute('position', new Float32BufferAttribute([x, 0.003, 1.5, x, 0.003, -LANE_LEN + 1], 3));
    world.scene.add(new LineSegments(g, edgeMat));
  }

  // Gutter outer edges
  const gutterEdge = new LineBasicMaterial({ color: 0x004488, transparent: true, opacity: 0.3 });
  for (const s of [-1, 1]) {
    const g = new BufferGeometry();
    const x = s * (LANE_W / 2 + GUTTER_W);
    g.setAttribute('position', new Float32BufferAttribute([x, 0.003, 1.5, x, 0.003, -LANE_LEN + 1], 3));
    world.scene.add(new LineSegments(g, gutterEdge));
  }

  // Lane arrows (guide dots at ~4.5m from foul line)
  const dotMat = new MeshBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.4 });
  for (const xOff of [-0.3, -0.15, 0, 0.15, 0.3]) {
    const dot = new Mesh(new SphereGeometry(0.015, 8, 8), dotMat);
    dot.position.set(xOff, 0.003, -4);
    world.scene.add(dot);
  }

  // Foul line
  const foulGeo = new BufferGeometry();
  foulGeo.setAttribute('position', new Float32BufferAttribute([
    -(LANE_W / 2 + GUTTER_W), 0.005, 0,
    LANE_W / 2 + GUTTER_W, 0.005, 0,
  ], 3));
  world.scene.add(new LineSegments(foulGeo, new LineBasicMaterial({ color: 0xff4444, opacity: 0.8, transparent: true })));

  // Lane grid (subtle cross-lines)
  const gridMat = new LineBasicMaterial({ color: 0x00ffff, transparent: true, opacity: 0.08 });
  for (let z = 0; z >= -LANE_LEN; z -= 1.5) {
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute([-LANE_W / 2, 0.002, z, LANE_W / 2, 0.002, z], 3));
    world.scene.add(new LineSegments(g, gridMat));
  }

  // Side walls (transparent neon panels)
  const wallMat = new MeshStandardMaterial({
    color: 0x001133,
    emissive: 0x003388,
    emissiveIntensity: 0.25,
    transparent: true,
    opacity: 0.06,
    side: DoubleSide,
  });
  for (const s of [-1, 1]) {
    const w = new Mesh(new PlaneGeometry(LANE_LEN + 6, 4), wallMat);
    w.position.set(s * 3.5, 2, -LANE_LEN / 2 + 1);
    w.rotation.y = s * Math.PI / 2;
    world.scene.add(w);

    // Wall neon trim
    const trimMat = new LineBasicMaterial({ color: 0x0066ff, transparent: true, opacity: 0.5 });
    for (const y of [0.01, 4]) {
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute([s * 3.5, y, 4, s * 3.5, y, -LANE_LEN - 1], 3));
      world.scene.add(new LineSegments(g, trimMat));
    }
  }

  // Ceiling beams
  const beamMat = new MeshStandardMaterial({
    color: 0x001a33,
    emissive: 0x0055aa,
    emissiveIntensity: 0.3,
    transparent: true,
    opacity: 0.2,
  });
  for (let z = 2; z >= -LANE_LEN; z -= 3.5) {
    const beam = new Mesh(new BoxGeometry(7, 0.06, 0.06), beamMat);
    beam.position.set(0, 4, z);
    world.scene.add(beam);
  }
}

main().catch(console.error);
