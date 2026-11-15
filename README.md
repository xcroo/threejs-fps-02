# EMBERWORKS — a tactical FPS (threejs-fps-02 entry)

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/xcroo/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/xcroo/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A Counter-Strike-style bomb-plant FPS in three.js. You are an attacker with three
bot teammates against five defender bots, on a decommissioned power-station yard at
dusk. Plant the charge at Site A (Turbine Hall) or Site B (Tank Farm). First team to
5 rounds takes the match.

## How to play

Open `game/index.html` through a local server (the game loads ES modules, so a
plain `file://` open will not work):

```bash
node serve.ts
# then open http://localhost:8080
```

Click the title screen to deploy (pointer lock). Press Esc to pause.

| Key | Action |
| --- | --- |
| WASD | Move |
| Mouse | Look |
| Left click | Fire |
| Right click (hold) | Aim down sights (sniper scope) |
| R | Reload |
| 1–5 | Switch weapon (pistol / rifle / SMG / sniper / shotgun) |
| Mouse wheel | Cycle weapons |
| B | Buy menu (buy phase only, 12 s) |
| 1–7 in buy menu | Buy weapon / grenade |
| E (hold) | Plant the charge inside a site |
| G | Throw HE grenade |
| H | Throw smoke grenade |
| C or Ctrl | Crouch |
| Space | Jump |

## The game

- **Map** — 36 × 28 m yard with three lanes (A-long, mid, B-long), a mid window
  wall you can shoot through but not walk through, and two bombsites. Bots navigate
  it on a 26-node waypoint graph with breadth-first-search routing.
- **Bots** — defenders hold and patrol the sites, hunt sounds, and converge on a
  planted bomb to defuse it. Attackers push a site with you. Bots see through a
  vision cone with line-of-sight checks, hear shots, fire in bursts with
  distance-based error, and strafe while engaging.
- **Weapons** — P9 pistol (free), AR-77 rifle ($2700), SMG-9 Wasp ($1500),
  SR-50 sniper ($4750), SG-12 shotgun ($1700), HE-1 ($300) and SMK-2 smoke ($400).
  Firing on the move widens your spread; the sniper punishes it most.
- **Economy** — kill +$300, round win +$3250, round loss +$1400, plant +$300,
  defuse +$300. Reserve ammo refills every round.
- **Rounds** — 12 s buy phase, 100 s live round, 40 s bomb fuse, 5 s defuse.
  Win by elimination, by detonation, by defusal, or by the clock.
- **Feedback** — hitmarkers (red on kill), a damage-direction arc, a killfeed,
  a minimap (enemies only while spotted), and a WebAudio synth for shots, hits,
  reloads and plant beeps. No sound files.

## Deterministic screenshots

The game accepts `?shot=start|play|plant|end&seed=N`. In shot mode it warms the
simulation up for 2.5 seconds with the seeded RNG, frames a fixed cinematic camera,
and sets `window.__shotReady` when the frame is settled. The four screenshots in
`screenshots/` were taken this way with seed 7.

## Files

- `main.ts` — the competition entrypoint: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` (Node 22, stdlib only).
- `game/index.html` — the page: import map, HUD, overlay.
- `game/src/` — the game: `main.js` (loop), `mapdata.js` (map + nav graph),
  `world.js` (meshes + lights), `physics.js` (shared AABB mover), `player.js`,
  `weapons.js`, `combat.js` (hitscan, tracers, grenades, smoke), `bots.js` (AI),
  `rounds.js` (match state machine), `minimap.js`, `hud.js`, `input.js`,
  `audio.js`, `palette.js`, `rng.js`.
- `game/vendor/three/` — three.js 0.187.0, byte-for-byte from the kit.
- `screenshots/` — four renders of the game's own code (start, play, plant, end).
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged.

<!-- Rewritten in session for the threejs-fps-02 entry (transcript coverage). -->
<!-- Revised once after the first write: the rewrite note now names the right entry. -->
