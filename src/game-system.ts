import {
  createSystem,
  World,
  Entity,
  PanelUI,
  PanelDocument,
  UIKitDocument,
  UIKit,
  eq,
  Mesh,
  Group,
  CylinderGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  MeshBasicMaterial,
  Color,
  Vector3,
  InputComponent,
  AdditiveBlending,
} from '@iwsdk/core';

import {
  ParticleSystem,
  BallTrail,
  AimGuide,
  PinSweep,
  FloorArrows,
  AmbientMusic,
  LANE_THEMES,
} from './effects.js';

// ══════════════════════════════════════════════════════════════
// Constants
// ══════════════════════════════════════════════════════════════

const LANE_W = 1.1;
const LANE_LEN = 18;
const FOUL_LINE_Z = 0;
const PIN_ZONE_Z = -16;
const BALL_RADIUS = 0.11;
const PIN_RADIUS = 0.055;
const PIN_HEIGHT = 0.36;
const PIN_SPACING = 0.3;
const BALL_START_Y = BALL_RADIUS + 0.001;
const BALL_START_Z = 0.3;
const GUTTER_X = LANE_W / 2;

const MIN_POWER = 4;
const MAX_POWER = 14;
const POWER_CHARGE_RATE = 8;
const AIM_SPEED = 0.6;
const SPIN_SPEED = 0.8;
const MAX_AIM = LANE_W / 2 - BALL_RADIUS;
const MAX_SPIN = 1.5;
const SPIN_CURVE_FACTOR = 0.7;

// Pin positions (triangle facing the bowler)
const PIN_POSITIONS: [number, number][] = [
  [0, 0],                                            // 1 (head pin)
  [-PIN_SPACING * 0.5, -PIN_SPACING * 0.866],        // 2
  [PIN_SPACING * 0.5, -PIN_SPACING * 0.866],         // 3
  [-PIN_SPACING, -PIN_SPACING * 1.732],              // 4
  [0, -PIN_SPACING * 1.732],                         // 5
  [PIN_SPACING, -PIN_SPACING * 1.732],               // 6
  [-PIN_SPACING * 1.5, -PIN_SPACING * 2.598],        // 7
  [-PIN_SPACING * 0.5, -PIN_SPACING * 2.598],        // 8
  [PIN_SPACING * 0.5, -PIN_SPACING * 2.598],         // 9
  [PIN_SPACING * 1.5, -PIN_SPACING * 2.598],         // 10
];

// Adjacency for chain reactions (pins that can knock each other)
const PIN_NEIGHBORS: number[][] = [
  [1, 2],        // 0 -> 2,3
  [0, 2, 3, 4],  // 1 -> 1,3,4,5
  [0, 1, 4, 5],  // 2 -> 1,2,5,6
  [1, 6, 7],     // 3 -> 2,7,8
  [1, 2, 3, 5, 7, 8], // 4 -> 2,3,4,6,8,9
  [2, 4, 8, 9],  // 5 -> 3,5,9,10
  [3, 7],        // 6 -> 4,8
  [3, 4, 6, 8],  // 7 -> 4,5,7,9
  [4, 5, 7, 9],  // 8 -> 5,6,8,10
  [5, 8],        // 9 -> 6,9
];

// ══════════════════════════════════════════════════════════════
// Types & Enums
// ══════════════════════════════════════════════════════════════

enum GameState {
  MENU = 'menu',
  MODE_SELECT = 'mode_select',
  BALL_SELECT = 'ball_select',
  SETTINGS = 'settings',
  HELP = 'help',
  ACHIEVEMENTS = 'achievements',
  STATS = 'stats',
  LEADERBOARD = 'leaderboard',
  COUNTDOWN = 'countdown',
  AIMING = 'aiming',
  CHARGING = 'charging',
  ROLLING = 'rolling',
  PIN_RESULT = 'pin_result',
  PAUSED = 'paused',
  GAME_OVER = 'game_over',
}

enum GameMode {
  CLASSIC = 'classic',
  SPEED = 'speed',
  STRIKE_ZONE = 'strike_zone',
  POWER = 'power',
  DAILY = 'daily',
  PRACTICE = 'practice',
  TOURNAMENT = 'tournament',
  ZEN = 'zen',
}

interface BallSkin {
  name: string;
  color: number;
  emissive: number;
}

const BALL_SKINS: BallSkin[] = [
  { name: 'Neon Cyan', color: 0x008888, emissive: 0x00ffff },
  { name: 'Solar Flare', color: 0x884400, emissive: 0xff4400 },
  { name: 'Plasma Pink', color: 0x880088, emissive: 0xff00ff },
  { name: 'Frost Ball', color: 0x446688, emissive: 0x88ccff },
  { name: 'Toxic Green', color: 0x006633, emissive: 0x00ff66 },
  { name: 'Royal Gold', color: 0x886600, emissive: 0xffcc00 },
  { name: 'Void Purple', color: 0x440088, emissive: 0xaa66ff },
  { name: 'Inferno', color: 0x883300, emissive: 0xff6600 },
];

interface Achievement {
  id: string;
  name: string;
  desc: string;
  check: (s: CareerStats) => boolean;
}

interface CareerStats {
  gamesPlayed: number;
  totalScore: number;
  bestScore: number;
  totalStrikes: number;
  totalSpares: number;
  perfectGames: number;
  totalThrows: number;
  totalPins: number;
  bestStreak: number;
  level: number;
  xp: number;
  unlockedAchievements: string[];
  highScores: { score: number; mode: string; date: string }[];
  selectedBall: number;
  masterVol: number;
  sfxVol: number;
  musicVol: number;
  laneTheme: number;
  bumpers: boolean;
}

const DEFAULT_STATS: CareerStats = {
  gamesPlayed: 0, totalScore: 0, bestScore: 0,
  totalStrikes: 0, totalSpares: 0, perfectGames: 0,
  totalThrows: 0, totalPins: 0, bestStreak: 0,
  level: 1, xp: 0, unlockedAchievements: [],
  highScores: [], selectedBall: 0,
  masterVol: 80, sfxVol: 80, musicVol: 60,
  laneTheme: 0, bumpers: false,
};

// ── Achievements ──────────────────────────────────────────────

const ACHIEVEMENTS: Achievement[] = [
  { id: 'first_game', name: 'First Roll', desc: 'Complete your first game', check: s => s.gamesPlayed >= 1 },
  { id: 'ten_games', name: 'Regular', desc: 'Play 10 games', check: s => s.gamesPlayed >= 10 },
  { id: 'fifty_games', name: 'Veteran', desc: 'Play 50 games', check: s => s.gamesPlayed >= 50 },
  { id: 'hundred_games', name: 'Centurion', desc: 'Play 100 games', check: s => s.gamesPlayed >= 100 },
  { id: 'first_strike', name: 'Strike!', desc: 'Bowl your first strike', check: s => s.totalStrikes >= 1 },
  { id: 'ten_strikes', name: 'Striking Gold', desc: 'Bowl 10 strikes total', check: s => s.totalStrikes >= 10 },
  { id: 'fifty_strikes', name: 'Pin Crusher', desc: '50 career strikes', check: s => s.totalStrikes >= 50 },
  { id: 'hundred_strikes', name: 'Strike Master', desc: '100 career strikes', check: s => s.totalStrikes >= 100 },
  { id: 'first_spare', name: 'Spare Change', desc: 'Bowl your first spare', check: s => s.totalSpares >= 1 },
  { id: 'ten_spares', name: 'Spare Collector', desc: '10 career spares', check: s => s.totalSpares >= 10 },
  { id: 'fifty_spares', name: 'Spare Expert', desc: '50 career spares', check: s => s.totalSpares >= 50 },
  { id: 'score_100', name: 'Century', desc: 'Score 100+ in a game', check: s => s.bestScore >= 100 },
  { id: 'score_150', name: 'Solid Game', desc: 'Score 150+ in a game', check: s => s.bestScore >= 150 },
  { id: 'score_200', name: 'Two Hundred Club', desc: 'Score 200+ in a game', check: s => s.bestScore >= 200 },
  { id: 'score_250', name: 'Pro Bowler', desc: 'Score 250+ in a game', check: s => s.bestScore >= 250 },
  { id: 'score_300', name: 'PERFECT GAME', desc: 'Score a perfect 300', check: s => s.perfectGames >= 1 },
  { id: 'pins_100', name: 'Pin Popper', desc: 'Knock down 100 pins total', check: s => s.totalPins >= 100 },
  { id: 'pins_500', name: 'Pin Destroyer', desc: 'Knock down 500 pins', check: s => s.totalPins >= 500 },
  { id: 'pins_1000', name: 'Demolition', desc: '1000 career pins', check: s => s.totalPins >= 1000 },
  { id: 'pins_5000', name: 'Annihilation', desc: '5000 career pins', check: s => s.totalPins >= 5000 },
  { id: 'throws_100', name: 'Frequent Roller', desc: '100 total throws', check: s => s.totalThrows >= 100 },
  { id: 'throws_500', name: 'Dedicated', desc: '500 total throws', check: s => s.totalThrows >= 500 },
  { id: 'throws_1000', name: 'Tireless', desc: '1000 total throws', check: s => s.totalThrows >= 1000 },
  { id: 'streak_3', name: 'Turkey', desc: '3 strikes in a row', check: s => s.bestStreak >= 3 },
  { id: 'streak_5', name: 'Five Bagger', desc: '5 strikes in a row', check: s => s.bestStreak >= 5 },
  { id: 'streak_8', name: 'Eight Bagger', desc: '8 strikes in a row', check: s => s.bestStreak >= 8 },
  { id: 'streak_12', name: 'Perfect Streak', desc: '12 strikes in a row', check: s => s.bestStreak >= 12 },
  { id: 'level_5', name: 'Apprentice', desc: 'Reach level 5', check: s => s.level >= 5 },
  { id: 'level_10', name: 'Skilled', desc: 'Reach level 10', check: s => s.level >= 10 },
  { id: 'level_20', name: 'Expert', desc: 'Reach level 20', check: s => s.level >= 20 },
  { id: 'level_50', name: 'Legendary', desc: 'Reach level 50', check: s => s.level >= 50 },
  { id: 'all_modes', name: 'Explorer', desc: 'Try all 8 game modes', check: () => false }, // special
  { id: 'ten_high', name: 'Scoreboard', desc: 'Fill the top 10 leaderboard', check: s => s.highScores.length >= 10 },
  { id: 'all_balls', name: 'Collector', desc: 'Try all 8 ball skins', check: () => false }, // special
  { id: 'no_gutter', name: 'Clean Sheet', desc: 'Full game with no gutters', check: () => false },
  { id: 'all_spares', name: 'Spare Perfection', desc: 'Spare every frame in a game', check: () => false },
  { id: 'speed_30', name: 'Speed Demon', desc: 'Score 30+ pins in Speed mode', check: () => false },
  { id: 'score_total_1k', name: 'Lifetime Scorer', desc: '1000 total career score', check: s => s.totalScore >= 1000 },
  { id: 'score_total_5k', name: 'Career Builder', desc: '5000 total career score', check: s => s.totalScore >= 5000 },
  { id: 'score_total_10k', name: 'Hall of Fame', desc: '10000 total career score', check: s => s.totalScore >= 10000 },
  { id: 'three_perfects', name: 'Triple Perfect', desc: '3 perfect games', check: s => s.perfectGames >= 3 },
  { id: 'thousand_strikes', name: 'Strike Legend', desc: '1000 career strikes', check: s => s.totalStrikes >= 1000 },
  // New achievements (round 2)
  { id: 'speed_50', name: 'Lightning', desc: '50+ pins in Speed mode', check: () => false },
  { id: 'power_strike', name: 'Power Strike', desc: 'Strike at max power in Power mode', check: () => false },
  { id: 'zen_master', name: 'Zen Master', desc: 'Complete Zen mode with 0 gutters', check: () => false },
  { id: 'daily_streak_3', name: 'Daily Grind', desc: 'Play Daily mode 3 times', check: () => false },
  { id: 'avg_over_200', name: 'Consistent', desc: 'Career average over 200', check: s => s.gamesPlayed > 0 && (s.totalScore / s.gamesPlayed) >= 200 },
  { id: 'pins_10000', name: 'Total Carnage', desc: '10000 career pins', check: s => s.totalPins >= 10000 },
  { id: 'xp_5000', name: 'XP Hunter', desc: 'Earn 5000 total XP', check: s => s.xp >= 5000 },
  { id: 'xp_25000', name: 'XP Lord', desc: 'Earn 25000 total XP', check: s => s.xp >= 25000 },
  { id: 'first_spare_no_guide', name: 'Split Save', desc: 'Spare from a 7-10 split', check: () => false },
  { id: 'five_in_a_row_spares', name: 'Spare Machine', desc: '5 spares in a row', check: () => false },
  { id: 'score_under_50', name: 'Rough Day', desc: 'Score under 50', check: () => false },
  { id: 'max_power_throw', name: 'Full Force', desc: 'Throw at 100% power', check: () => false },
  { id: 'tournament_win', name: 'Champion', desc: 'Score 200+ in Tournament mode', check: () => false },
];

// ══════════════════════════════════════════════════════════════
// Audio helpers (oscillator-based, no external files)
// ══════════════════════════════════════════════════════════════

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  return audioCtx;
}

function playTone(freq: number, dur: number, vol = 0.15, type: OscillatorType = 'sine') {
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + dur);
  } catch { /* audio not available */ }
}

function sfxRoll() { playTone(80, 0.5, 0.08, 'sawtooth'); }
function sfxHitPins(count: number) {
  playTone(200 + count * 30, 0.3, 0.12, 'triangle');
  setTimeout(() => playTone(150, 0.2, 0.08, 'sawtooth'), 50);
}
function sfxStrike() {
  playTone(523, 0.15, 0.15, 'square');
  setTimeout(() => playTone(659, 0.15, 0.15, 'square'), 120);
  setTimeout(() => playTone(784, 0.2, 0.18, 'square'), 240);
}
function sfxSpare() {
  playTone(440, 0.15, 0.12, 'square');
  setTimeout(() => playTone(554, 0.2, 0.15, 'square'), 150);
}
function sfxGutter() { playTone(110, 0.4, 0.1, 'sawtooth'); }
function sfxCharge() { playTone(220, 0.05, 0.06, 'sine'); }
function sfxSelect() { playTone(660, 0.08, 0.1, 'sine'); }
function sfxCountdown() { playTone(440, 0.15, 0.12, 'sine'); }
function sfxGo() { playTone(880, 0.25, 0.15, 'square'); }
function sfxAchievement() {
  playTone(523, 0.1, 0.15, 'sine');
  setTimeout(() => playTone(659, 0.1, 0.15, 'sine'), 100);
  setTimeout(() => playTone(784, 0.15, 0.18, 'sine'), 200);
  setTimeout(() => playTone(1047, 0.2, 0.2, 'sine'), 300);
}

// ── Keyboard type shim (runtime has keyboard; types expose only XRInputManager) ──
interface KeyboardLike {
  getKeyDown(code: string): boolean;
  getKeyPressed(code: string): boolean;
  getKeyUp(code: string): boolean;
}


// ══════════════════════════════════════════════════════════════
// BowlingSystem
// ══════════════════════════════════════════════════════════════

export class BowlingSystem extends createSystem({
  title: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/title.json')] },
  modeselect: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/modeselect.json')] },
  hud: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/hud.json')] },
  scorecard: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/scorecard.json')] },
  powerbar: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/powerbar.json')] },
  gameover: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/gameover.json')] },
  pause: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/pause.json')] },
  leaderboard: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/leaderboard.json')] },
  achievements: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/achievements.json')] },
  settings: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/settings.json')] },
  help: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/help.json')] },
  ballselect: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/ballselect.json')] },
  stats: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/stats.json')] },
  toast: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/toast.json')] },
  countdown: { required: [PanelUI, PanelDocument], where: [eq(PanelUI, 'config', './ui/countdown.json')] },
}) {
  // ── Scene objects ──
  private pinGroup!: Group;
  private pinMeshes: Mesh[] = [];
  private pinStanding: boolean[] = [];
  private pinFallDir: Vector3[] = [];
  private pinFallProgress: number[] = [];

  private ballGroup!: Group;
  private ballMesh!: Mesh;
  private ballMat!: MeshStandardMaterial;

  // ── Game state ──
  private state: GameState = GameState.MENU;
  private prevState: GameState = GameState.MENU;
  private mode: GameMode = GameMode.CLASSIC;
  private frame = 1;
  private throwNum = 1; // 1 or 2 (or 3 in 10th frame)
  private throws: number[] = []; // all throw pin counts for scoring
  private frameScores: (number | null)[] = new Array(10).fill(null);
  private frameMarks: string[][] = Array.from({ length: 10 }, () => []);
  private totalScore = 0;
  private gameStrikes = 0;
  private gameSpares = 0;
  private gameGutters = 0;
  private currentStreak = 0;

  // Aiming
  private aimX = 0;
  private spinAmount = 0;
  private power = 0;
  private charging = false;

  // Ball physics
  private ballX = 0;
  private ballZ = BALL_START_Z;
  private ballVelX = 0;
  private ballVelZ = 0;
  private ballInGutter = false;
  private ballSpeed = 0;

  // Timing
  private countdownTimer = 3;
  private resultTimer = 0;
  private toastTimer = 0;
  private toastText = '';
  private speedModeTimer = 60;
  private speedModePins = 0;

  // Panel docs
  private docs: Map<string, { entity: Entity; doc: UIKitDocument }> = new Map();

  // Career stats
  private career!: CareerStats;
  private achPage = 0;
  private modesPlayed: Set<string> = new Set();
  private ballsUsed: Set<number> = new Set();
  private gameHadGutter = false;
  private gameAllSpares = true;

  // Effects
  private particles!: ParticleSystem;
  private ballTrail!: BallTrail;
  private aimGuide!: AimGuide;
  private pinSweep!: PinSweep;
  private floorArrows!: FloorArrows;
  private ambientMusic!: AmbientMusic;
  private sweepPending = false;
  private trailTimer = 0;

  // Screen shake
  private shakeIntensity = 0;
  private shakeDuration = 0;
  private shakeTimer = 0;
  private originalCamPos = new Vector3(0, 1.7, 1.0);

  // Spare streak tracking
  private spareStreak = 0;
  private lastPower = 0; // track power of last throw for achievement

  /** Access keyboard via the runtime InputManager (not exposed in types) */
  private _kb(): KeyboardLike {
    return (this.input as unknown as { keyboard: KeyboardLike }).keyboard;
  }

  // ── Init ──

  init() {
    this.career = this.loadStats();
    this.ballsUsed.add(this.career.selectedBall);
    this.createPins();
    this.createBall();

    // Initialize effects
    this.particles = new ParticleSystem(this.world.scene);
    const skin = BALL_SKINS[this.career.selectedBall] || BALL_SKINS[0];
    this.ballTrail = new BallTrail(this.world.scene, skin.emissive);
    this.aimGuide = new AimGuide(this.world.scene);
    this.pinSweep = new PinSweep(this.world.scene, LANE_W, PIN_ZONE_Z);
    this.floorArrows = new FloorArrows(this.world.scene);
    this.ambientMusic = new AmbientMusic();

    this.bindPanels();
  }

  private loadStats(): CareerStats {
    try {
      const raw = localStorage.getItem('neon-lanes-stats');
      if (raw) return { ...DEFAULT_STATS, ...JSON.parse(raw) };
    } catch { /* ignore */ }
    return { ...DEFAULT_STATS };
  }

  private saveStats() {
    try { localStorage.setItem('neon-lanes-stats', JSON.stringify(this.career)); } catch { /* */ }
  }

  // ── Scene objects ──

  private createPins() {
    this.pinGroup = new Group();
    this.pinGroup.position.set(0, 0, PIN_ZONE_Z);
    this.world.scene.add(this.pinGroup);

    const pinGeo = new CylinderGeometry(PIN_RADIUS * 0.7, PIN_RADIUS, PIN_HEIGHT, 8);
    const pinMat = new MeshStandardMaterial({
      color: 0xeeeeee,
      emissive: 0xffffff,
      emissiveIntensity: 0.15,
    });

    // Red stripe material
    const stripeMat = new MeshStandardMaterial({
      color: 0xcc0000,
      emissive: 0xff2200,
      emissiveIntensity: 0.2,
    });

    for (let i = 0; i < 10; i++) {
      const pinGroup = new Group();
      const body = new Mesh(pinGeo, pinMat);
      body.position.y = PIN_HEIGHT / 2;
      pinGroup.add(body);

      // Red stripe
      const stripe = new Mesh(
        new CylinderGeometry(PIN_RADIUS * 0.72, PIN_RADIUS * 0.72, PIN_HEIGHT * 0.1, 8),
        stripeMat,
      );
      stripe.position.y = PIN_HEIGHT * 0.7;
      pinGroup.add(stripe);

      // Neck
      const neck = new Mesh(
        new CylinderGeometry(PIN_RADIUS * 0.35, PIN_RADIUS * 0.6, PIN_HEIGHT * 0.2, 8),
        pinMat,
      );
      neck.position.y = PIN_HEIGHT * 0.85;
      pinGroup.add(neck);

      const [px, pz] = PIN_POSITIONS[i];
      pinGroup.position.set(px, 0, pz);

      this.pinGroup.add(pinGroup);
      this.pinMeshes.push(pinGroup as unknown as Mesh);
      this.pinStanding.push(true);
      this.pinFallDir.push(new Vector3(0, 0, 1));
      this.pinFallProgress.push(0);
    }
  }

  private createBall() {
    this.ballGroup = new Group();
    const skin = BALL_SKINS[this.career.selectedBall] || BALL_SKINS[0];
    this.ballMat = new MeshStandardMaterial({
      color: skin.color,
      emissive: skin.emissive,
      emissiveIntensity: 0.4,
    });
    this.ballMesh = new Mesh(new SphereGeometry(BALL_RADIUS, 16, 16), this.ballMat);
    this.ballMesh.position.y = BALL_RADIUS;
    this.ballGroup.add(this.ballMesh);

    // Finger holes (darker spots)
    const holeMat = new MeshBasicMaterial({ color: 0x111111 });
    for (const [dx, dz] of [[0, -0.04], [-0.025, 0.02], [0.025, 0.02]]) {
      const hole = new Mesh(new SphereGeometry(0.018, 6, 6), holeMat);
      hole.position.set(dx, BALL_RADIUS + 0.08, dz);
      this.ballGroup.add(hole);
    }

    this.ballGroup.position.set(0, 0, BALL_START_Z);
    this.ballGroup.visible = false;
    this.world.scene.add(this.ballGroup);
  }

  private updateBallSkin() {
    const skin = BALL_SKINS[this.career.selectedBall] || BALL_SKINS[0];
    this.ballMat.color.setHex(skin.color);
    this.ballMat.emissive.setHex(skin.emissive);
    if (this.ballTrail) this.ballTrail.setColor(skin.emissive);
    if (this.aimGuide) this.aimGuide.setColor(skin.emissive);
  }

  private resetPins(fullReset: boolean) {
    for (let i = 0; i < 10; i++) {
      if (fullReset || !this.pinStanding[i]) {
        this.pinStanding[i] = true;
      }
      const [px, pz] = PIN_POSITIONS[i];
      const m = this.pinMeshes[i];
      m.position.set(px, 0, pz);
      m.rotation.set(0, 0, 0);
      this.pinFallProgress[i] = 0;
      m.visible = fullReset ? true : this.pinStanding[i];
    }
  }

  private resetBall() {
    this.aimX = 0;
    this.spinAmount = 0;
    this.power = 0;
    this.charging = false;
    this.ballX = 0;
    this.ballZ = BALL_START_Z;
    this.ballVelX = 0;
    this.ballVelZ = 0;
    this.ballInGutter = false;
    this.ballSpeed = 0;
    this.ballGroup.position.set(0, 0, BALL_START_Z);
    this.ballGroup.visible = true;
  }


  // ══════════════════════════════════════════════════════════
  // Panel binding
  // ══════════════════════════════════════════════════════════

  private bindPanels() {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const bind = (name: string, query: any, handler: (doc: UIKitDocument, entity: Entity) => void) => {
      query.subscribe('qualify', (entity: Entity) => {
        const doc = PanelDocument.data.document[entity.index] as UIKitDocument | undefined;
        if (!doc) return;
        this.docs.set(name, { entity, doc });
        handler(doc, entity);
        // Hide all panels initially except title
        if (name !== 'title') {
          entity.object3D!.visible = false;
        }
      });
    };

    // Title
    bind('title', this.queries.title, (doc) => {
      this.setText(doc, 'best-score', 'Best: ' + this.career.bestScore);
      this.setText(doc, 'level-display', 'Lv.' + this.career.level + ' ' + this.getLevelName());
      this.setText(doc, 'games-played', 'Games: ' + this.career.gamesPlayed);
      this.clickHandler(doc, 'btn-play', () => this.showPanel('modeselect'));
      this.clickHandler(doc, 'btn-scores', () => this.showPanel('leaderboard'));
      this.clickHandler(doc, 'btn-achievements', () => this.showPanel('achievements'));
      this.clickHandler(doc, 'btn-stats', () => this.showPanel('stats'));
      this.clickHandler(doc, 'btn-balls', () => this.showPanel('ballselect'));
      this.clickHandler(doc, 'btn-settings', () => this.showPanel('settings'));
      this.clickHandler(doc, 'btn-help', () => this.showPanel('help'));
    });

    // Mode select
    bind('modeselect', this.queries.modeselect, (doc) => {
      const modes: [string, GameMode][] = [
        ['btn-classic', GameMode.CLASSIC],
        ['btn-speed', GameMode.SPEED],
        ['btn-strike', GameMode.STRIKE_ZONE],
        ['btn-power', GameMode.POWER],
        ['btn-daily', GameMode.DAILY],
        ['btn-practice', GameMode.PRACTICE],
        ['btn-tournament', GameMode.TOURNAMENT],
        ['btn-zen', GameMode.ZEN],
      ];
      for (const [id, m] of modes) {
        this.clickHandler(doc, id, () => this.startGame(m));
      }
      this.clickHandler(doc, 'btn-back', () => this.showPanel('title'));
    });

    // HUD
    bind('hud', this.queries.hud, () => { /* updated each frame */ });

    // Scorecard
    bind('scorecard', this.queries.scorecard, () => { /* updated each frame */ });

    // Power bar
    bind('powerbar', this.queries.powerbar, () => { /* updated each frame */ });

    // Game over
    bind('gameover', this.queries.gameover, (doc) => {
      this.clickHandler(doc, 'btn-rematch', () => this.startGame(this.mode));
      this.clickHandler(doc, 'btn-menu', () => this.showPanel('title'));
    });

    // Pause
    bind('pause', this.queries.pause, (doc) => {
      this.clickHandler(doc, 'btn-resume', () => this.resumeGame());
      this.clickHandler(doc, 'btn-quit', () => {
        this.state = GameState.MENU;
        this.showPanel('title');
      });
    });

    // Leaderboard
    bind('leaderboard', this.queries.leaderboard, (doc) => {
      this.updateLeaderboard(doc);
      this.clickHandler(doc, 'btn-back', () => this.showPanel('title'));
    });

    // Achievements
    bind('achievements', this.queries.achievements, (doc) => {
      this.achPage = 0;
      this.updateAchievementsPanel(doc);
      this.clickHandler(doc, 'btn-prev', () => { if (this.achPage > 0) { this.achPage--; this.updateAchievementsPanel(doc); } });
      this.clickHandler(doc, 'btn-next', () => { if (this.achPage < 3) { this.achPage++; this.updateAchievementsPanel(doc); } });
      this.clickHandler(doc, 'btn-back', () => this.showPanel('title'));
    });

    // Settings
    bind('settings', this.queries.settings, (doc) => {
      this.clickHandler(doc, 'btn-master-up', () => { this.career.masterVol = Math.min(100, this.career.masterVol + 10); this.updateSettingsPanel(doc); this.saveStats(); });
      this.clickHandler(doc, 'btn-master-down', () => { this.career.masterVol = Math.max(0, this.career.masterVol - 10); this.updateSettingsPanel(doc); this.saveStats(); });
      this.clickHandler(doc, 'btn-sfx-up', () => { this.career.sfxVol = Math.min(100, this.career.sfxVol + 10); this.updateSettingsPanel(doc); this.saveStats(); });
      this.clickHandler(doc, 'btn-sfx-down', () => { this.career.sfxVol = Math.max(0, this.career.sfxVol - 10); this.updateSettingsPanel(doc); this.saveStats(); });
      this.clickHandler(doc, 'btn-music-up', () => { this.career.musicVol = Math.min(100, this.career.musicVol + 10); this.updateSettingsPanel(doc); this.saveStats(); });
      this.clickHandler(doc, 'btn-music-down', () => { this.career.musicVol = Math.max(0, this.career.musicVol - 10); this.updateSettingsPanel(doc); this.saveStats(); });
      this.clickHandler(doc, 'btn-theme-prev', () => {
        this.career.laneTheme = (this.career.laneTheme - 1 + LANE_THEMES.length) % LANE_THEMES.length;
        this.updateSettingsPanel(doc);
        this.saveStats();
        this.showToast('Theme: ' + LANE_THEMES[this.career.laneTheme].name);
      });
      this.clickHandler(doc, 'btn-theme-next', () => {
        this.career.laneTheme = (this.career.laneTheme + 1) % LANE_THEMES.length;
        this.updateSettingsPanel(doc);
        this.saveStats();
        this.showToast('Theme: ' + LANE_THEMES[this.career.laneTheme].name);
      });
      this.clickHandler(doc, 'btn-bumpers', () => {
        this.career.bumpers = !this.career.bumpers;
        this.updateSettingsPanel(doc);
        this.saveStats();
        this.showToast('Bumpers: ' + (this.career.bumpers ? 'ON' : 'OFF'));
      });
      this.clickHandler(doc, 'btn-reset-scores', () => {
        this.career.highScores = [];
        this.career.bestScore = 0;
        this.saveStats();
        sfxSelect();
        this.showToast('Scores reset');
      });
      this.clickHandler(doc, 'btn-back', () => this.showPanel('title'));
      this.updateSettingsPanel(doc);
    });

    // Help
    bind('help', this.queries.help, (doc) => {
      this.clickHandler(doc, 'btn-back', () => this.showPanel('title'));
    });

    // Ball select
    bind('ballselect', this.queries.ballselect, (doc) => {
      for (let i = 0; i < 8; i++) {
        const idx = i;
        this.clickHandler(doc, 's' + (i + 1), () => {
          this.career.selectedBall = idx;
          this.ballsUsed.add(idx);
          this.updateBallSkin();
          this.saveStats();
          sfxSelect();
          this.showToast('Ball: ' + BALL_SKINS[idx].name);
        });
      }
      this.clickHandler(doc, 'btn-back', () => this.showPanel('title'));
    });

    // Stats
    bind('stats', this.queries.stats, (doc) => {
      this.updateStatsPanel(doc);
      this.clickHandler(doc, 'btn-back', () => this.showPanel('title'));
    });

    // Toast
    bind('toast', this.queries.toast, () => { /* updated dynamically */ });

    // Countdown
    bind('countdown', this.queries.countdown, () => { /* updated dynamically */ });
  }

  // ── Panel helpers ──

  private getDoc(name: string): UIKitDocument | undefined {
    return this.docs.get(name)?.doc;
  }

  private getEntity(name: string): Entity | undefined {
    return this.docs.get(name)?.entity;
  }

  private setText(doc: UIKitDocument, id: string, text: string) {
    const el = doc.getElementById(id) as UIKit.Text | undefined;
    el?.setProperties({ text });
  }

  private clickHandler(doc: UIKitDocument, id: string, handler: () => void) {
    const el = doc.getElementById(id) as UIKit.Text | undefined;
    el?.addEventListener('click', () => { sfxSelect(); handler(); });
  }

  private showPanel(name: string) {
    // Track state
    const stateMap: Record<string, GameState> = {
      title: GameState.MENU,
      modeselect: GameState.MODE_SELECT,
      ballselect: GameState.BALL_SELECT,
      settings: GameState.SETTINGS,
      help: GameState.HELP,
      achievements: GameState.ACHIEVEMENTS,
      stats: GameState.STATS,
      leaderboard: GameState.LEADERBOARD,
    };
    if (stateMap[name]) {
      this.prevState = this.state;
      this.state = stateMap[name];
    }

    // Hide all, show target
    const menuPanels = ['title', 'modeselect', 'gameover', 'pause', 'leaderboard',
      'achievements', 'settings', 'help', 'ballselect', 'stats'];
    for (const p of menuPanels) {
      const e = this.getEntity(p);
      if (e?.object3D) e.object3D.visible = (p === name);
    }

    // Hide game panels when in menu
    const gamePanels = ['hud', 'scorecard', 'powerbar', 'countdown'];
    for (const p of gamePanels) {
      const e = this.getEntity(p);
      if (e?.object3D) e.object3D.visible = false;
    }

    this.ballGroup.visible = false;
    this.pinGroup.visible = (name === 'title');

    // Refresh panel data
    if (name === 'stats') {
      const d = this.getDoc('stats');
      if (d) this.updateStatsPanel(d);
    }
    if (name === 'leaderboard') {
      const d = this.getDoc('leaderboard');
      if (d) this.updateLeaderboard(d);
    }
    if (name === 'achievements') {
      const d = this.getDoc('achievements');
      if (d) this.updateAchievementsPanel(d);
    }
    if (name === 'title') {
      const d = this.getDoc('title');
      if (d) {
        this.setText(d, 'best-score', 'Best: ' + this.career.bestScore);
        this.setText(d, 'level-display', 'Lv.' + this.career.level + ' ' + this.getLevelName());
        this.setText(d, 'games-played', 'Games: ' + this.career.gamesPlayed);
      }
    }
  }

  private showToast(text: string) {
    this.toastText = text;
    this.toastTimer = 2.5;
    const e = this.getEntity('toast');
    if (e?.object3D) e.object3D.visible = true;
    const d = this.getDoc('toast');
    if (d) this.setText(d, 'toast-text', text);
  }


  // ══════════════════════════════════════════════════════════
  // Game flow
  // ══════════════════════════════════════════════════════════

  private startGame(mode: GameMode) {
    this.mode = mode;
    this.modesPlayed.add(mode);
    this.frame = 1;
    this.throwNum = 1;
    this.throws = [];
    this.frameScores = new Array(10).fill(null);
    this.frameMarks = Array.from({ length: 10 }, () => []);
    this.totalScore = 0;
    this.gameStrikes = 0;
    this.gameSpares = 0;
    this.gameGutters = 0;
    this.currentStreak = 0;
    this.gameHadGutter = false;
    this.gameAllSpares = true;
    this.speedModeTimer = 60;
    this.speedModePins = 0;
    this.sweepPending = false;

    // Clear effects
    this.particles.clear();
    this.ballTrail.clear();
    this.aimGuide.hide();

    // Start ambient music
    const musicVol = (this.career.masterVol / 100) * (this.career.musicVol / 100) * 0.06;
    if (!this.ambientMusic.isPlaying()) {
      this.ambientMusic.start(musicVol);
    } else {
      this.ambientMusic.setVolume(musicVol);
    }

    // Hide all menu panels
    for (const p of ['title', 'modeselect', 'gameover', 'pause', 'leaderboard',
      'achievements', 'settings', 'help', 'ballselect', 'stats']) {
      const e = this.getEntity(p);
      if (e?.object3D) e.object3D.visible = false;
    }

    // Start countdown
    this.state = GameState.COUNTDOWN;
    this.countdownTimer = 3;
    const ce = this.getEntity('countdown');
    if (ce?.object3D) ce.object3D.visible = true;
    const cd = this.getDoc('countdown');
    if (cd) this.setText(cd, 'countdown-text', '3');

    this.resetPins(true);
    this.pinGroup.visible = true;

    sfxCountdown();
  }

  private startAiming() {
    this.state = GameState.AIMING;
    this.resetBall();

    // Show game panels
    for (const p of ['hud', 'scorecard', 'powerbar']) {
      const e = this.getEntity(p);
      if (e?.object3D) e.object3D.visible = true;
    }
    const ce = this.getEntity('countdown');
    if (ce?.object3D) ce.object3D.visible = false;

    this.updateHUD();
    this.updateScorecard();
  }

  private pauseGame() {
    if (this.state !== GameState.AIMING && this.state !== GameState.CHARGING) return;
    this.prevState = this.state;
    this.state = GameState.PAUSED;
    const e = this.getEntity('pause');
    if (e?.object3D) e.object3D.visible = true;
  }

  private resumeGame() {
    this.state = this.prevState;
    const e = this.getEntity('pause');
    if (e?.object3D) e.object3D.visible = false;
  }

  private throwBall() {
    this.state = GameState.ROLLING;
    this.charging = false;
    this.ballX = this.aimX;
    this.ballZ = BALL_START_Z;
    this.ballSpeed = MIN_POWER + (MAX_POWER - MIN_POWER) * (this.power / 100);
    this.ballVelZ = -this.ballSpeed;
    this.ballVelX = this.spinAmount * SPIN_CURVE_FACTOR;
    this.ballInGutter = false;
    this.lastPower = this.power;

    // Clear effects
    this.ballTrail.clear();
    this.aimGuide.hide();
    this.trailTimer = 0;

    sfxRoll();
  }

  // ══════════════════════════════════════════════════════════
  // Main update loop
  // ══════════════════════════════════════════════════════════

  update(delta: number, _time: number) {
    // Clamp delta
    const dt = Math.min(delta, 0.1);

    this.updateToast(dt);
    this.particles.update(dt);
    this.ballTrail.update(dt);
    this.pinSweep.update(dt);
    const isAiming = this.state === GameState.AIMING || this.state === GameState.CHARGING;
    this.floorArrows.update(dt, isAiming);

    switch (this.state) {
      case GameState.COUNTDOWN:
        this.updateCountdown(dt);
        break;
      case GameState.AIMING:
      case GameState.CHARGING:
        this.handleInput(dt);
        this.updatePowerBar();
        this.updateAimVisual();
        // Show aim guide
        this.aimGuide.show(this.aimX, BALL_START_Z, this.spinAmount, LANE_W);
        break;
      case GameState.ROLLING:
        this.updateBallPhysics(dt);
        // Ball trail
        this.trailTimer += dt;
        if (this.trailTimer > 0.02) {
          this.trailTimer = 0;
          this.ballTrail.addPoint(new Vector3(this.ballX, BALL_RADIUS, this.ballZ));
        }
        break;
      case GameState.PIN_RESULT:
        this.updatePinResult(dt);
        break;
      case GameState.PAUSED:
        this.handlePauseInput();
        break;
      default:
        // Hide aim guide when not aiming
        this.aimGuide.hide();
        break;
    }

    // Animate falling pins
    this.animatePins(dt);

    // Screen shake
    this.updateShake(dt);

    // Speed mode timer
    if ((this.state === GameState.AIMING || this.state === GameState.CHARGING ||
         this.state === GameState.ROLLING || this.state === GameState.PIN_RESULT) &&
        this.mode === GameMode.SPEED) {
      this.speedModeTimer -= dt;
      if (this.speedModeTimer <= 0) {
        this.speedModeTimer = 0;
        this.endGame();
      }
    }
  }

  // ── Countdown ──

  private updateCountdown(dt: number) {
    const prev = Math.ceil(this.countdownTimer);
    this.countdownTimer -= dt;
    const curr = Math.ceil(this.countdownTimer);
    if (curr !== prev && curr > 0) {
      sfxCountdown();
    }

    const d = this.getDoc('countdown');
    if (d) {
      if (this.countdownTimer > 0) {
        this.setText(d, 'countdown-text', '' + Math.ceil(this.countdownTimer));
      } else {
        this.setText(d, 'countdown-text', 'GO!');
      }
    }

    if (this.countdownTimer <= -0.5) {
      sfxGo();
      this.startAiming();
    }
  }

  // ── Input handling ──

  private handleInput(dt: number) {
    const kb = this._kb();
    const rightGP = this.input.gamepads.right;
    const leftGP = this.input.gamepads.left;

    // Aim (A/D or right thumbstick)
    let aimDelta = 0;
    if (kb.getKeyPressed('KeyA') || kb.getKeyPressed('ArrowLeft')) aimDelta -= 1;
    if (kb.getKeyPressed('KeyD') || kb.getKeyPressed('ArrowRight')) aimDelta += 1;

    if (rightGP) {
      const stick = rightGP.getAxesValues(InputComponent.Thumbstick);
      if (stick && Math.abs(stick.x) > 0.15) aimDelta += stick.x;
    }

    this.aimX = Math.max(-MAX_AIM, Math.min(MAX_AIM, this.aimX + aimDelta * AIM_SPEED * dt));

    // Spin (W/S or left thumbstick)
    let spinDelta = 0;
    if (kb.getKeyPressed('KeyW') || kb.getKeyPressed('ArrowUp')) spinDelta += 1;
    if (kb.getKeyPressed('KeyS') || kb.getKeyPressed('ArrowDown')) spinDelta -= 1;

    if (leftGP) {
      const stick = leftGP.getAxesValues(InputComponent.Thumbstick);
      if (stick && Math.abs(stick.x) > 0.15) spinDelta += stick.x;
    }

    this.spinAmount = Math.max(-MAX_SPIN, Math.min(MAX_SPIN, this.spinAmount + spinDelta * SPIN_SPEED * dt));

    // Charge (Space or right trigger)
    const spaceDown = kb.getKeyDown('Space');
    const spaceHeld = kb.getKeyPressed('Space');
    const spaceUp = kb.getKeyUp('Space');

    let triggerDown = false;
    let triggerHeld = false;
    let triggerUp = false;
    if (rightGP) {
      triggerDown = rightGP.getButtonDown(InputComponent.Trigger) || false;
      triggerHeld = rightGP.getButtonPressed(InputComponent.Trigger) || false;
      triggerUp = rightGP.getButtonUp(InputComponent.Trigger) || false;
    }

    if (this.state === GameState.AIMING) {
      if (spaceDown || triggerDown) {
        this.state = GameState.CHARGING;
        this.charging = true;
        this.power = 0;
      }
    }

    if (this.state === GameState.CHARGING) {
      if (spaceHeld || triggerHeld) {
        this.power = Math.min(100, this.power + POWER_CHARGE_RATE * dt * 50);
        if (Math.random() < 0.3) sfxCharge();
      }
      if (spaceUp || triggerUp) {
        this.throwBall();
      }
    }

    // Pause (ESC or B button)
    if (kb.getKeyDown('Escape')) {
      this.pauseGame();
    }
    if (rightGP?.getButtonDown(InputComponent.B_Button)) {
      this.pauseGame();
    }
  }

  private handlePauseInput() {
    const kb = this._kb();
    const rightGP = this.input.gamepads.right;
    if (kb.getKeyDown('Escape') || rightGP?.getButtonDown(InputComponent.B_Button)) {
      this.resumeGame();
    }
  }


  // ══════════════════════════════════════════════════════════
  // Ball physics (simplified trajectory simulation)
  // ══════════════════════════════════════════════════════════

  private updateBallPhysics(dt: number) {
    // Apply spin curve (lateral acceleration)
    this.ballVelX += this.spinAmount * SPIN_CURVE_FACTOR * dt;

    // Move ball
    this.ballX += this.ballVelX * dt;
    this.ballZ += this.ballVelZ * dt;

    // Gutter check (with bumper support)
    if (!this.ballInGutter && Math.abs(this.ballX) > GUTTER_X) {
      if (this.career.bumpers || this.mode === GameMode.PRACTICE || this.mode === GameMode.ZEN) {
        // Bumpers: bounce back
        this.ballX = Math.sign(this.ballX) * (GUTTER_X - 0.02);
        this.ballVelX = -this.ballVelX * 0.6;
        playTone(300, 0.1, 0.08, 'triangle'); // bump sound
      } else {
        this.ballInGutter = true;
        this.ballVelX = 0;
        this.particles.emitGutter(new Vector3(this.ballX, BALL_RADIUS, this.ballZ));
        sfxGutter();
      }
    }

    // Keep ball in gutter channel
    if (this.ballInGutter) {
      this.ballX = Math.sign(this.ballX) * (GUTTER_X + 0.1);
    }

    // Update visual
    this.ballGroup.position.set(this.ballX, 0, this.ballZ);
    // Rotate ball for rolling effect
    const rollAngle = (-this.ballVelZ * dt) / BALL_RADIUS;
    this.ballMesh.rotation.x += rollAngle;
    // Spin rotation on Y axis
    this.ballMesh.rotation.y += this.spinAmount * dt * 2;

    // Check if ball reached pin zone
    if (this.ballZ <= PIN_ZONE_Z + 1.5 && !this.ballInGutter) {
      this.checkPinCollisions();
    }

    // Ball past the pins or slowed down
    if (this.ballZ < PIN_ZONE_Z - 2.5 || this.ballInGutter && this.ballZ < PIN_ZONE_Z) {
      this.onBallDone();
    }
  }

  private checkPinCollisions() {
    const ballWorldX = this.ballX;
    const ballWorldZ = this.ballZ;
    const hitRadius = BALL_RADIUS + PIN_RADIUS;
    let hitCount = 0;

    for (let i = 0; i < 10; i++) {
      if (!this.pinStanding[i]) continue;

      const [px, pz] = PIN_POSITIONS[i];
      const pinWorldX = px;
      const pinWorldZ = pz + PIN_ZONE_Z;

      const dx = ballWorldX - pinWorldX;
      const dz = ballWorldZ - pinWorldZ;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < hitRadius) {
        this.knockPin(i, dx, dz);
        hitCount++;
      }
    }

    // Pin hit particles
    if (hitCount > 0) {
      this.particles.emitPinHit(
        new Vector3(ballWorldX, 0.2, ballWorldZ),
        hitCount,
      );
    }
  }

  private knockPin(index: number, impactDx: number, impactDz: number) {
    if (!this.pinStanding[index]) return;
    this.pinStanding[index] = false;

    // Fall direction based on impact
    const len = Math.sqrt(impactDx * impactDx + impactDz * impactDz) || 1;
    this.pinFallDir[index].set(impactDx / len, 0, impactDz / len);
    this.pinFallProgress[index] = 0;

    // Chain reaction - neighboring pins have a chance of falling
    for (const ni of PIN_NEIGHBORS[index]) {
      if (this.pinStanding[ni] && Math.random() < 0.45) {
        // Delayed chain knock
        setTimeout(() => {
          if (this.pinStanding[ni]) {
            const [px1, pz1] = PIN_POSITIONS[index];
            const [px2, pz2] = PIN_POSITIONS[ni];
            this.knockPin(ni, px2 - px1, pz2 - pz1);
          }
        }, 80 + Math.random() * 120);
      }
    }
  }

  private animatePins(dt: number) {
    for (let i = 0; i < 10; i++) {
      if (this.pinStanding[i]) continue;
      if (this.pinFallProgress[i] >= 1) continue;

      this.pinFallProgress[i] = Math.min(1, this.pinFallProgress[i] + dt * 4);
      const t = this.pinFallProgress[i];
      const m = this.pinMeshes[i];
      const dir = this.pinFallDir[i];

      // Rotate to fall over
      const angle = t * (Math.PI / 2);
      m.rotation.x = dir.z * angle;
      m.rotation.z = -dir.x * angle;

      // Slide away slightly
      const [px, pz] = PIN_POSITIONS[i];
      m.position.x = px + dir.x * t * 0.15;
      m.position.z = pz + dir.z * t * 0.15;
      m.position.y = -t * 0.1;
    }
  }

  private onBallDone() {
    // Count knocked pins this throw
    const pinsDown = this.pinStanding.filter(s => !s).length;
    const previouslyDown = this.throws.length > 0 && this.throwNum === 2
      ? this.throws[this.throws.length - 1]
      : 0;
    const pinsThisThrow = this.ballInGutter ? 0 : Math.max(0, pinsDown - (this.throwNum === 1 ? 0 : previouslyDown));

    // Wait a moment for chain reactions to finish
    this.state = GameState.PIN_RESULT;
    this.resultTimer = 1.0;

    // Clear ball trail
    this.ballTrail.clear();

    // Store the throw count for scoring after the delay
    (this as any)._pendingPinsThisThrow = pinsThisThrow;
    (this as any)._pendingPinsDown = pinsDown;
  }

  private updatePinResult(dt: number) {
    // Skip if pin sweep is playing
    if (this.sweepPending) return;

    this.resultTimer -= dt;
    if (this.resultTimer > 0) return;

    // Recount after chain reactions settled
    const pinsDown = this.pinStanding.filter(s => !s).length;
    const previouslyDown = this.throwNum > 1 ? this.getPreviousThrowPins() : 0;
    const pinsThisThrow = this.ballInGutter ? 0 : Math.max(0, pinsDown - previouslyDown);

    this.throws.push(pinsThisThrow);
    this.career.totalThrows++;
    this.career.totalPins += pinsThisThrow;

    if (this.ballInGutter) {
      this.gameHadGutter = true;
      this.gameGutters++;
    }

    const hitCount = pinsThisThrow;
    if (hitCount > 0) sfxHitPins(hitCount);

    // Speed mode: accumulate pins
    if (this.mode === GameMode.SPEED) {
      this.speedModePins += pinsThisThrow;
    }

    this.ballGroup.visible = false;

    // Determine next action
    this.processThrowResult(pinsThisThrow, pinsDown);
  }

  private getPreviousThrowPins(): number {
    // Sum of pins knocked in previous throws this frame
    if (this.throws.length === 0) return 0;
    return this.throws[this.throws.length - 1] || 0;
  }

  private processThrowResult(pinsThisThrow: number, totalPinsDown: number) {
    const isStrike = this.throwNum === 1 && totalPinsDown === 10;
    const isSpare = this.throwNum === 2 && totalPinsDown === 10;
    const isFrame10 = this.frame === 10;

    // Record marks
    if (isStrike) {
      this.frameMarks[this.frame - 1].push('X');
      this.gameStrikes++;
      this.currentStreak++;
      this.spareStreak = 0;
      if (this.currentStreak > this.career.bestStreak) {
        this.career.bestStreak = this.currentStreak;
      }
      this.particles.emitStrike(new Vector3(0, 0.5, PIN_ZONE_Z));
      this.triggerShake(0.06, 0.4);
      sfxStrike();
      if (this.currentStreak >= 5) {
        this.showToast(this.currentStreak + 'x STREAK!');
      } else if (this.currentStreak >= 3) {
        this.showToast('TURKEY!');
      } else {
        this.showToast('STRIKE!');
      }
    } else if (isSpare) {
      this.frameMarks[this.frame - 1].push('/');
      this.gameSpares++;
      this.spareStreak++;
      this.currentStreak = 0;
      this.particles.emitSpare(new Vector3(0, 0.5, PIN_ZONE_Z));
      this.triggerShake(0.03, 0.25);
      sfxSpare();
      this.showToast('SPARE!');
    } else {
      if (this.throwNum >= 2 && totalPinsDown < 10) {
        this.gameAllSpares = false;
      }
      if (pinsThisThrow === 0) {
        this.frameMarks[this.frame - 1].push('-');
        this.currentStreak = 0;
      } else {
        this.frameMarks[this.frame - 1].push('' + pinsThisThrow);
        this.currentStreak = 0;
      }
    }

    // Calculate scores
    this.calculateScores();
    this.updateScorecard();
    this.updateHUD();

    // Determine next step
    if (isFrame10) {
      this.handleFrame10(isStrike, isSpare, totalPinsDown);
    } else if (isStrike) {
      // Strike - advance to next frame
      this.nextFrame();
    } else if (this.throwNum >= 2) {
      // Two throws done - next frame
      this.nextFrame();
    } else {
      // Second throw
      this.throwNum = 2;
      this.resetBall();
      this.state = GameState.AIMING;
    }
  }

  private handleFrame10(isStrike: boolean, isSpare: boolean, totalPinsDown: number) {
    if (this.throwNum === 1) {
      if (isStrike) {
        // Bonus throw(s) in 10th frame
        this.throwNum = 2;
        this.resetPins(true);
        this.resetBall();
        this.state = GameState.AIMING;
      } else {
        this.throwNum = 2;
        this.resetBall();
        this.state = GameState.AIMING;
      }
    } else if (this.throwNum === 2) {
      if (isSpare || this.frameMarks[9][0] === 'X') {
        // Bonus throw
        this.throwNum = 3;
        if (isSpare || totalPinsDown === 10) {
          this.resetPins(true);
        }
        this.resetBall();
        this.state = GameState.AIMING;
      } else {
        this.endGame();
      }
    } else {
      // Third throw done
      this.endGame();
    }
  }

  private nextFrame() {
    this.frame++;
    this.throwNum = 1;

    if (this.frame > 10) {
      this.endGame();
    } else {
      // Pin sweep animation before resetting
      this.sweepPending = true;
      this.ballGroup.visible = false;
      this.ballTrail.clear();
      this.pinSweep.start(() => {
        this.sweepPending = false;
        this.resetPins(true);
        this.resetBall();
        this.state = GameState.AIMING;
      });
      // Temporarily idle while sweep plays
      this.state = GameState.PIN_RESULT;
      this.resultTimer = -99; // won't re-trigger result logic
    }
  }


  // ══════════════════════════════════════════════════════════
  // Scoring
  // ══════════════════════════════════════════════════════════

  private calculateScores() {
    let throwIdx = 0;
    let total = 0;

    for (let f = 0; f < 10 && throwIdx < this.throws.length; f++) {
      if (f === 9) {
        // 10th frame: sum all remaining throws (up to 3)
        let frameTotal = 0;
        const remaining = this.throws.length - throwIdx;
        for (let t = 0; t < remaining && t < 3; t++) {
          frameTotal += this.throws[throwIdx + t];
        }
        total += frameTotal;
        this.frameScores[f] = total;
        break;
      }

      const first = this.throws[throwIdx];
      if (first === 10) {
        // Strike
        const bonus1 = throwIdx + 1 < this.throws.length ? this.throws[throwIdx + 1] : -1;
        const bonus2 = throwIdx + 2 < this.throws.length ? this.throws[throwIdx + 2] : -1;
        if (bonus1 >= 0 && bonus2 >= 0) {
          total += 10 + bonus1 + bonus2;
          this.frameScores[f] = total;
        } else {
          this.frameScores[f] = null; // pending
        }
        throwIdx++;
      } else if (throwIdx + 1 < this.throws.length) {
        const second = this.throws[throwIdx + 1];
        if (first + second === 10) {
          // Spare
          const bonus = throwIdx + 2 < this.throws.length ? this.throws[throwIdx + 2] : -1;
          if (bonus >= 0) {
            total += 10 + bonus;
            this.frameScores[f] = total;
          } else {
            this.frameScores[f] = null;
          }
        } else {
          total += first + second;
          this.frameScores[f] = total;
        }
        throwIdx += 2;
      } else {
        // Only first throw done, frame incomplete
        this.frameScores[f] = null;
        throwIdx++;
        break;
      }
    }

    // Update total score from last resolved frame
    for (let f = 9; f >= 0; f--) {
      if (this.frameScores[f] !== null) {
        this.totalScore = this.frameScores[f]!;
        break;
      }
    }
  }

  // ══════════════════════════════════════════════════════════
  // End game
  // ══════════════════════════════════════════════════════════

  private endGame() {
    this.state = GameState.GAME_OVER;
    this.calculateScores();

    // Stop ambient music
    this.ambientMusic.stop();
    this.aimGuide.hide();
    this.ballTrail.clear();

    let finalScore = this.totalScore;
    if (this.mode === GameMode.SPEED) {
      finalScore = this.speedModePins;
    } else if (this.mode === GameMode.STRIKE_ZONE) {
      finalScore = this.gameStrikes * 30; // 30 pts per strike
    } else if (this.mode === GameMode.ZEN) {
      finalScore = this.totalScore; // no special scoring
    }

    // Update career stats
    this.career.gamesPlayed++;
    this.career.totalScore += finalScore;
    if (finalScore > this.career.bestScore) this.career.bestScore = finalScore;
    this.career.totalStrikes += this.gameStrikes;
    this.career.totalSpares += this.gameSpares;

    if (this.mode === GameMode.CLASSIC && finalScore === 300) {
      this.career.perfectGames++;
    }

    // XP and level
    this.career.xp += finalScore;
    const newLevel = Math.floor(this.career.xp / 500) + 1;
    if (newLevel > this.career.level) {
      this.career.level = newLevel;
      this.showToast('Level Up! ' + this.career.level);
      this.particles.emitLevelUp(new Vector3(0, 1, -2));
    }

    // High scores
    const dateStr = new Date().toLocaleDateString();
    this.career.highScores.push({ score: finalScore, mode: this.mode, date: dateStr });
    this.career.highScores.sort((a, b) => b.score - a.score);
    if (this.career.highScores.length > 10) this.career.highScores.length = 10;

    // Check achievements
    this.checkAchievements();

    this.saveStats();

    // Show game over panel
    this.ballGroup.visible = false;
    for (const p of ['hud', 'scorecard', 'powerbar']) {
      const e = this.getEntity(p);
      if (e?.object3D) e.object3D.visible = false;
    }

    const e = this.getEntity('gameover');
    if (e?.object3D) e.object3D.visible = true;

    const d = this.getDoc('gameover');
    if (d) {
      this.setText(d, 'final-score', 'Score: ' + finalScore);
      this.setText(d, 'high-score', 'Best: ' + this.career.bestScore);
      this.setText(d, 'strikes-count', '' + this.gameStrikes);
      this.setText(d, 'spares-count', '' + this.gameSpares);
      this.setText(d, 'gutters-count', '' + this.gameGutters);
      this.setText(d, 'throws-count', 'Throws: ' + this.throws.length);
      const totalPins = this.throws.reduce((a, b) => a + b, 0);
      const avg = this.throws.length > 0 ? (totalPins / this.throws.length).toFixed(1) : '0.0';
      this.setText(d, 'avg-pins', 'Avg: ' + avg + ' pins/throw');
      this.setText(d, 'streak-display', 'Best Run: ' + this.currentStreak);
      this.setText(d, 'xp-gained', '+' + finalScore + ' XP');

      // New best indicator
      if (finalScore >= this.career.bestScore && finalScore > 0) {
        this.setText(d, 'new-best', 'NEW PERSONAL BEST!');
      } else {
        this.setText(d, 'new-best', ' ');
      }

      // Rating
      let rating = '';
      if (finalScore >= 280) rating = 'LEGENDARY';
      else if (finalScore >= 240) rating = 'AMAZING!';
      else if (finalScore >= 200) rating = 'GREAT!';
      else if (finalScore >= 150) rating = 'GOOD';
      else if (finalScore >= 100) rating = 'OK';
      else rating = 'KEEP TRYING';
      this.setText(d, 'result-rating', rating);
    }

    // Handle keyboard shortcuts for rematch
    this.handleGameOverInput();
  }

  private handleGameOverInput() {
    // This is checked in the main update via state
  }

  private checkAchievements() {
    let newAchievements = false;
    for (const ach of ACHIEVEMENTS) {
      if (this.career.unlockedAchievements.includes(ach.id)) continue;
      let unlocked = false;

      // Special achievements
      if (ach.id === 'all_modes') {
        unlocked = this.modesPlayed.size >= 8;
      } else if (ach.id === 'all_balls') {
        unlocked = this.ballsUsed.size >= 8;
      } else if (ach.id === 'no_gutter') {
        unlocked = this.career.gamesPlayed > 0 && !this.gameHadGutter && this.frame >= 10;
      } else if (ach.id === 'all_spares') {
        unlocked = this.career.gamesPlayed > 0 && this.gameAllSpares && this.frame >= 10;
      } else if (ach.id === 'speed_30') {
        unlocked = this.mode === GameMode.SPEED && this.speedModePins >= 30;
      } else if (ach.id === 'speed_50') {
        unlocked = this.mode === GameMode.SPEED && this.speedModePins >= 50;
      } else if (ach.id === 'power_strike') {
        unlocked = this.mode === GameMode.POWER && this.gameStrikes > 0 && this.power >= 95;
      } else if (ach.id === 'zen_master') {
        unlocked = this.mode === GameMode.ZEN && !this.gameHadGutter && this.frame >= 10;
      } else if (ach.id === 'daily_streak_3') {
        unlocked = this.mode === GameMode.DAILY && this.career.gamesPlayed >= 3;
      } else if (ach.id === 'score_under_50') {
        unlocked = this.totalScore < 50 && this.totalScore > 0 && this.frame >= 10;
      } else if (ach.id === 'max_power_throw') {
        unlocked = this.lastPower >= 99;
      } else if (ach.id === 'tournament_win') {
        unlocked = this.mode === GameMode.TOURNAMENT && this.totalScore >= 200;
      } else if (ach.id === 'first_spare_no_guide') {
        // 7-10 split spare: check if frame had pins 7 and 10 standing alone
        unlocked = false; // complex - skip for now
      } else if (ach.id === 'five_in_a_row_spares') {
        unlocked = this.spareStreak >= 5;
      } else {
        unlocked = ach.check(this.career);
      }

      if (unlocked) {
        this.career.unlockedAchievements.push(ach.id);
        newAchievements = true;
        sfxAchievement();
        this.showToast('[*] ' + ach.name);
      }
    }
    if (newAchievements) this.saveStats();
  }

  // ══════════════════════════════════════════════════════════
  // UI Updates
  // ══════════════════════════════════════════════════════════

  private updateHUD() {
    const d = this.getDoc('hud');
    if (!d) return;
    this.setText(d, 'frame-label', 'Frame ' + Math.min(this.frame, 10) + '/10');
    this.setText(d, 'throw-label', 'Throw ' + this.throwNum);
    this.setText(d, 'score-label', '' + this.totalScore);
    this.setText(d, 'mode-label', this.mode.toUpperCase().replace('_', ' '));

    const standingPins = this.pinStanding.filter(s => s).length;
    this.setText(d, 'pins-label', standingPins + ' pins');

    // Combo text with color
    let combo = ' ';
    let comboColor = '#ff00ff';
    if (this.currentStreak >= 5) { combo = this.currentStreak + 'x STREAK!'; comboColor = '#ffcc00'; }
    else if (this.currentStreak >= 3) { combo = 'Turkey!'; comboColor = '#ff8800'; }
    else if (this.currentStreak >= 2) { combo = 'Double!'; comboColor = '#ff00ff'; }
    this.setText(d, 'combo-label', combo);
    const comboEl = d.getElementById('combo-label') as UIKit.Text | undefined;
    if (comboEl) comboEl.setProperties({ color: comboColor });

    // Timer for speed mode
    if (this.mode === GameMode.SPEED) {
      const timeColor = this.speedModeTimer < 10 ? '#ff4444' : '#ffff00';
      this.setText(d, 'time-label', 'Time: ' + Math.ceil(this.speedModeTimer) + 's');
      const timeEl = d.getElementById('time-label') as UIKit.Text | undefined;
      if (timeEl) timeEl.setProperties({ color: timeColor });
    } else {
      this.setText(d, 'time-label', ' ');
    }

    // XP display
    const nextLevelXP = this.career.level * 500;
    const currentLevelXP = (this.career.level - 1) * 500;
    const progress = this.career.xp - currentLevelXP;
    const needed = nextLevelXP - currentLevelXP;
    this.setText(d, 'xp-label', 'XP ' + progress + '/' + needed);
  }

  private updateScorecard() {
    const d = this.getDoc('scorecard');
    if (!d) return;

    for (let f = 0; f < 10; f++) {
      const marks = this.frameMarks[f].join(' ');
      this.setText(d, 'f' + (f + 1) + '-marks', marks || '  ');
      const score = this.frameScores[f];
      this.setText(d, 'f' + (f + 1) + '-score', score !== null ? '' + score : ' ');
    }
    this.setText(d, 'total-score', 'Total: ' + this.totalScore);
  }

  private updatePowerBar() {
    const d = this.getDoc('powerbar');
    if (!d) return;

    const filled = Math.floor(this.power / 10);
    const bar = '#'.repeat(filled) + '-'.repeat(10 - filled);
    this.setText(d, 'power-bar', bar);
    this.setText(d, 'power-pct', Math.round(this.power) + '%');

    // Color based on power
    const el = d.getElementById('power-bar') as UIKit.Text | undefined;
    if (el) {
      if (this.power > 80) el.setProperties({ color: '#ff4444' });
      else if (this.power > 50) el.setProperties({ color: '#ff8800' });
      else el.setProperties({ color: '#ffaa00' });
    }
    const pctEl = d.getElementById('power-pct') as UIKit.Text | undefined;
    if (pctEl) {
      if (this.power > 80) pctEl.setProperties({ color: '#ff4444' });
      else if (this.power > 50) pctEl.setProperties({ color: '#ff8800' });
      else pctEl.setProperties({ color: '#ffaa00' });
    }

    // Aim display
    const aimPct = Math.round(Math.abs(this.aimX / MAX_AIM) * 100);
    const aimLabel = this.aimX < -0.05 ? 'Left ' + aimPct + '%' : this.aimX > 0.05 ? 'Right ' + aimPct + '%' : 'Center';
    this.setText(d, 'aim-value', aimLabel);

    // Spin display
    const spinPct = Math.round(Math.abs(this.spinAmount / MAX_SPIN) * 100);
    const spinLabel = this.spinAmount < -0.15 ? 'Left ' + spinPct + '%' : this.spinAmount > 0.15 ? 'Right ' + spinPct + '%' : 'None';
    this.setText(d, 'spin-value', spinLabel);

    // Instruction text
    const instrEl = d.getElementById('instruction') as UIKit.Text | undefined;
    if (instrEl) {
      if (this.state === GameState.AIMING) {
        instrEl.setProperties({ text: 'SPACE to charge | A/D aim | W/S spin' });
      } else if (this.state === GameState.CHARGING) {
        instrEl.setProperties({ text: 'Release to throw!' });
      }
    }
  }

  private updateAimVisual() {
    // Update ball position to show aiming
    if (this.state === GameState.AIMING || this.state === GameState.CHARGING) {
      this.ballGroup.position.set(this.aimX, 0, BALL_START_Z);
      this.ballGroup.visible = true;
    }
  }

  private updateToast(dt: number) {
    if (this.toastTimer > 0) {
      this.toastTimer -= dt;
      if (this.toastTimer <= 0) {
        const e = this.getEntity('toast');
        if (e?.object3D) e.object3D.visible = false;
      }
    }
  }

  private updateLeaderboard(doc: UIKitDocument) {
    for (let i = 0; i < 10; i++) {
      const entry = this.career.highScores[i];
      const prefix = 'r' + (i + 1) + '-';
      if (entry) {
        this.setText(doc, prefix + 'score', '' + entry.score);
        this.setText(doc, prefix + 'mode', entry.mode.replace('_', ' '));
        this.setText(doc, prefix + 'date', entry.date);
      } else {
        this.setText(doc, prefix + 'score', '---');
        this.setText(doc, prefix + 'mode', '---');
        this.setText(doc, prefix + 'date', '---');
      }
    }
  }

  private updateAchievementsPanel(doc: UIKitDocument) {
    const perPage = 15;
    const start = this.achPage * perPage;
    const unlocked = this.career.unlockedAchievements;

    this.setText(doc, 'ach-count', unlocked.length + ' / ' + ACHIEVEMENTS.length + ' unlocked');
    this.setText(doc, 'page-label', (this.achPage + 1) + '/4');

    for (let i = 0; i < perPage; i++) {
      const achIdx = start + i;
      const ach = ACHIEVEMENTS[achIdx];
      const el = 'a' + (i + 1);
      if (ach) {
        const isUnlocked = unlocked.includes(ach.id);
        const mark = isUnlocked ? '[*]' : '[ ]';
        const text = mark + ' ' + ach.name + ': ' + ach.desc;
        this.setText(doc, el, text);
        const textEl = doc.getElementById(el) as UIKit.Text | undefined;
        if (textEl) {
          textEl.setProperties({ color: isUnlocked ? '#00ffff' : '#444444' });
        }
      } else {
        this.setText(doc, el, ' ');
      }
    }
  }

  private updateStatsPanel(doc: UIKitDocument) {
    const s = this.career;
    this.setText(doc, 'stat-games', '' + s.gamesPlayed);
    this.setText(doc, 'stat-total-score', '' + s.totalScore);
    this.setText(doc, 'stat-best-score', '' + s.bestScore);
    this.setText(doc, 'stat-strikes', '' + s.totalStrikes);
    this.setText(doc, 'stat-spares', '' + s.totalSpares);
    this.setText(doc, 'stat-perfects', '' + s.perfectGames);
    this.setText(doc, 'stat-throws', '' + s.totalThrows);
    this.setText(doc, 'stat-pins', '' + s.totalPins);
    const rate = s.totalThrows > 0 ? ((s.totalStrikes / s.totalThrows) * 100).toFixed(0) : '0';
    this.setText(doc, 'stat-strike-rate', rate + '%');
    const avg = s.gamesPlayed > 0 ? Math.round(s.totalScore / s.gamesPlayed) : 0;
    this.setText(doc, 'stat-avg', '' + avg);
    this.setText(doc, 'stat-streak', '' + s.bestStreak);
    this.setText(doc, 'stat-level', s.level + ' - ' + this.getLevelName());
  }

  private updateSettingsPanel(doc: UIKitDocument) {
    this.setText(doc, 'master-vol', this.career.masterVol + '%');
    this.setText(doc, 'sfx-vol', this.career.sfxVol + '%');
    this.setText(doc, 'music-vol', this.career.musicVol + '%');
    const theme = LANE_THEMES[this.career.laneTheme] || LANE_THEMES[0];
    this.setText(doc, 'theme-name', theme.name);
    this.setText(doc, 'btn-bumpers', this.career.bumpers ? 'ON' : 'OFF');
    const bumperEl = doc.getElementById('btn-bumpers') as UIKit.Text | undefined;
    if (bumperEl) {
      bumperEl.setProperties({ color: this.career.bumpers ? '#00ff88' : '#ff4444' });
    }
  }

  // ── Helpers ──

  private getLevelName(): string {
    const l = this.career.level;
    if (l >= 50) return 'Legend';
    if (l >= 40) return 'Grandmaster';
    if (l >= 30) return 'Master';
    if (l >= 20) return 'Expert';
    if (l >= 15) return 'Pro';
    if (l >= 10) return 'Skilled';
    if (l >= 5) return 'Apprentice';
    if (l >= 3) return 'Amateur';
    return 'Rookie';
  }

  private triggerShake(intensity: number, duration: number) {
    this.shakeIntensity = intensity;
    this.shakeDuration = duration;
    this.shakeTimer = 0;
  }

  private updateShake(dt: number) {
    if (this.shakeDuration <= 0) return;
    this.shakeTimer += dt;
    if (this.shakeTimer >= this.shakeDuration) {
      this.shakeDuration = 0;
      this.world.camera.position.copy(this.originalCamPos);
      return;
    }
    const decay = 1 - (this.shakeTimer / this.shakeDuration);
    const amp = this.shakeIntensity * decay;
    this.world.camera.position.set(
      this.originalCamPos.x + (Math.random() - 0.5) * amp,
      this.originalCamPos.y + (Math.random() - 0.5) * amp * 0.5,
      this.originalCamPos.z + (Math.random() - 0.5) * amp * 0.3,
    );
  }
}
