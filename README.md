# Neon Lanes VR

A holodeck-style VR bowling game built with [IWSDK](https://iwsdk.dev) (Immersive Web SDK). Play in your browser or in VR with full spatial UI, career progression, and 100 achievements.

🎳 **[Play Now](https://ellyz2426.github.io/neon-lanes/)**

## Features

### Gameplay
- **10-pin bowling** with simplified physics, chain reactions, and spin curves
- **8 game modes**: Classic, Speed, Strike Zone, Power, Daily, Practice, Tournament, Zen
- **8 ball skins** with unique attributes (weight, hook potential, speed)
- **Standard bowling scoring** with strikes, spares, and 10th frame bonuses
- **Oil pattern system** (House, Sport, Cheetah, Shark, Dry) affecting ball curve
- **Lane wear system** — oil degrades over frames for realistic lane play
- **Split detection** with named splits (7-10, 3-10, Big Four, etc.)
- **Bumper mode** with automatic bumpers in Practice and Zen modes

### Progression
- **100 achievements** across gameplay milestones, modes, and challenges
- **XP and leveling** (Rookie through Legend)
- **Career stats** tracking games, strikes, spares, splits, brooklyns, and more
- **Top 10 leaderboard** with per-mode tracking
- **Ball unlock system** with 8 distinct bowling balls

### Visual & Audio
- **Neon holodeck aesthetic** — glowing lanes, particle effects, atmospheric lighting
- **4 lane themes** (Blue, Purple, Green, Red) with full color scheme changes
- **Particle effects** for strikes, spares, gutters, pin hits, and level ups
- **Ball trail** and **aim guide** during aiming
- **Pin sweep animation** between frames
- **Pin wobble** near-miss effect
- **Screen shake** on strikes and spares
- **Pocket target indicator** showing ideal hit zone
- **Oscillator-based sound effects** and ambient music (no external audio files)
- **Scoring monitors** and **ball return machine** decorations

### VR Support
- **Full VR controller support** via WebXR
  - Right thumbstick: aim
  - Left thumbstick: spin
  - Right trigger: charge and throw
  - B button: pause
- **Haptic feedback** for strikes, spares, pin hits, and gutters
- **Spatial PanelUI** — all 15 UI panels are head-tracked 3D panels
- **Keyboard fallback** (A/D aim, W/S spin, Space charge/throw, ESC pause)

## Tech Stack

- **IWSDK 0.4.x** (Immersive Web SDK) — WebXR framework on Three.js + ECS
- **PanelUI / uikitml** — Spatial UI system (no HTML DOM overlays)
- **TypeScript** — Full type safety, zero type errors
- **Vite** — Build tooling

## Development

```bash
npm install
npm run dev    # Start dev server at https://127.0.0.1:8081/
npm run build  # Production build to dist/
```

## Controls

| Action        | Keyboard        | VR Controller       |
| ------------- | --------------- | -------------------- |
| Aim           | A / D           | Right thumbstick     |
| Spin          | W / S           | Left thumbstick      |
| Charge/Throw  | Space (hold)    | Right trigger (hold) |
| Pause         | ESC             | B button             |

## License

MIT
