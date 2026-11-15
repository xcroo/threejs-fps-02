# RAILHEAD — a tactical FPS (threejs-fps-02 entry)

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/xcroo/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/xcroo/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

A Counter-Strike-style bomb-plant FPS in three.js. You are Switch, an attacker
with three bot teammates against five defender bots, in a freight rail yard at
dawn. Plant the charge at Site A (Engine Shed) or Site B (Container Stacks).
First team to 5 rounds takes the match.

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
| 1–6 in buy menu | Buy weapon / grenade |
| E (hold) | Plant the charge inside a site / defuse near the bomb |
| G | Throw HE grenade |
| H | Throw smoke grenade |
| C or Ctrl | Crouch |
| Space | Jump |

## The game

- **Map** — 40 × 30 m rail yard with three lanes (North Track, Central
  Crossing, South Track), a signal box at the crossing with a window slit you
  can shoot through but not walk through, and two bombsites. Bots navigate it
  on a 30-node waypoint graph with breadth-first-search routing.
- **Bots** — defenders hold and patrol the sites, hunt sounds, and converge on
  a planted bomb to defuse it. Attackers push a site with you, and the charge
  passes to the nearest living attacker if its carrier falls. Bots see through
  a vision cone with line-of-sight checks, hear shots, fire in bursts with
  distance-based error, and strafe while engaging.
- **Weapons** — Kestrel P9 pistol (free), VK-47 rifle ($2700), Hornet-9 SMG
  ($1500), Longbow .50 sniper ($4750), Breacher-12 shotgun ($1700), HE
  grenade ($300) and smoke grenade ($400). Firing on the move widens your
  spread; the sniper punishes it most. Headshots deal 3× body damage.
- **Economy** — kill +$300, round win +$3250, round loss +$1400, plant +$300,
  defuse +$300. Reserve ammo refills every round.
- **Rounds** — 12 s buy phase, 100 s live round, 40 s bomb fuse, 5 s defuse.
  Win by elimination, by detonation, by defusal, or by the clock.
- **Feedback** — hitmarkers (red on kill), a damage-direction arc, a killfeed,
  a minimap (enemies only while spotted), and a WebAudio synth for shots, hits,
  reloads and plant beeps. No sound files.

## Deterministic screenshots

The game accepts `?shot=start|play|plant|end&seed=N`. In shot mode it warms the
simulation up for 2.5 seconds with the seeded RNG, frames a fixed cinematic
camera, and sets `window.__shotReady` when the frame is settled. The four
screenshots in `screenshots/` were taken this way with seed 7.

`?debug=1` exposes `window.__railhead` (player, match, arsenal, bots, clock)
for automated play-tests; it is off unless the query param is present.

## Files

- `main.ts` — the competition entrypoint: copies `game/` and `screenshots/` to
  `/output` and writes `dossier.json` (Node 22, stdlib only).
- `game/index.html` — the page: import map, HUD, overlays.
- `game/src/` — the game: `boot.js` (loop + input), `yard.js` (map, nav graph,
  meshes), `mover.js` (shared AABB physics), `guns.js` (arsenal, hitscan,
  tracers, grenades), `bots.js` (AI), `match.js` (rounds + economy), `hud.js`,
  `audio.js`, `shots.js`, `debug.js`, `rng.js`, `math3.js`.
- `game/vendor/three/` — three.js 0.187.0, byte-for-byte from the kit.
- `screenshots/` — four renders of the game's own code (start, play, plant, end).
- `vendor/makefun-threejs.ts` — the kit's dossier library, unchanged.
