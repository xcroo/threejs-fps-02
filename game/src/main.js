// Emberworks — main game. A fixed-step simulation (60 Hz) drives the player, the
// bots, the rounds and the combat; the render loop only draws. The player plants a
// charge at Site A or B, the defenders hold, and the first team to 5 rounds takes
// the match. Shot modes (?shot=start|play|plant|end&seed=N) run the same game
// headless-friendly and set window.__shotReady for screenshots.
//
// Rewritten in session for the threejs-fps-02 entry (transcript coverage).
// Revised once after the first write: the rewrite note now names the right entry.
import * as THREE from 'three';
import { MAP } from './mapdata.js';
import { PALETTE, cssVars } from './palette.js';
import { mulberry32 } from './rng.js';
import { createWorld } from './world.js';
import { createPlayer } from './player.js';
import { createArsenal, WEAPONS, GRENADES } from './weapons.js';
import { createCombat } from './combat.js';
import { createBots, nearestWaypoint } from './bots.js';
import { createRounds, PLANT_SECONDS, BOMB_FUSE } from './rounds.js';
import { createMinimap } from './minimap.js';
import { createHud } from './hud.js';
import { createInput } from './input.js';
import { createAudio } from './audio.js';

const FIXED_DT = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shotMode = params.get('shot');
const seed = Number(params.get('seed') || 7);
const rng = mulberry32(seed);
const random = rng;

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 30, 70);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 120);
camera.rotation.order = 'YXZ';
scene.add(camera);

cssVars(document.documentElement);
const world = createWorld(scene);
const combat = createCombat(scene, world.shootables);
const player = createPlayer(world.colliders);
const arsenal = createArsenal(camera);
const bots = createBots(scene, world, combat, random);
const hud = createHud(document);
const input = createInput(document, canvas);
const audio = createAudio();
const minimap = createMinimap(document.getElementById('minimap'));

// The player's own hit body: invisible meshes the bots' rays can hit, never the
// player's own shots (they use a separate target list without these meshes).
const playerProxy = { team: 'atk', isPlayer: true, name: 'You' };
const playerHitGroup = new THREE.Group();
const playerTorso = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.78, 0.3), new THREE.MeshBasicMaterial({ visible: false }));
playerTorso.position.y = 1.0;
playerTorso.userData = { fighter: playerProxy, part: 'torso' };
const playerHead = new THREE.Mesh(new THREE.SphereGeometry(0.155, 8, 6), new THREE.MeshBasicMaterial({ visible: false }));
playerHead.position.y = 1.53;
playerHead.userData = { fighter: playerProxy, part: 'head' };
playerHitGroup.add(playerTorso, playerHead);
scene.add(playerHitGroup);

// Bomb mesh: a dark charge with a blinking red light, shown only while planted.
const bombGroup = new THREE.Group();
const bombBody = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.28), new THREE.MeshStandardMaterial({ color: 0x1a1d22, roughness: 0.4, metalness: 0.6 }));
bombBody.position.y = 0.09;
const bombLight = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), new THREE.MeshBasicMaterial({ color: 0xe0492f }));
bombLight.position.set(0.12, 0.2, 0);
bombGroup.add(bombBody, bombLight);
bombGroup.visible = false;
scene.add(bombGroup);
const bombLightPoint = new THREE.PointLight(0xe0492f, 0, 4);
scene.add(bombLightPoint);

const rounds = createRounds({
  onRoundStart(round) {
    resetPositions();
    arsenal.refillReserve();
    bombGroup.visible = false;
    hud.killfeed(`— Round ${round} —`);
  },
  onLive() {
    hud.killfeed('Round live — plant the charge');
  },
  onRoundEnd(winner, message) {
    hud.killfeed(message);
    audio.roundEnd(winner === 'atk');
    setBanner(message, 3.5);
  },
  onMatchEnd(winner) {
    setBanner(winner === 'atk' ? 'VICTORY — Emberworks is ours' : 'DEFEAT — the defenders held', 0);
    showOverlay('match', winner === 'atk' ? 'VICTORY' : 'DEFEAT', `Final score ${rounds.state.score.atk} — ${rounds.state.score.def}. Click to play again.`);
  },
  onBombPlanted(site) {
    bombGroup.visible = true;
    bombGroup.position.set(MAP.sites[site].center[0], 0, MAP.sites[site].center[1]);
    hud.killfeed(`Charge planted at Site ${site}`);
    audio.plantBeep();
    setBanner(`Charge planted at Site ${site} — defend it`, 3);
  },
});

const DEF_PATROLS = [
  [18, 7, 25, 8],
  [19, 14, 13, 22],
  [20, 5, 3, 4],
  [17, 16, 18],
  [17, 19, 12],
];
const ATK_PATROLS = [
  [0, 1, 2, 3, 6, 7, 8],
  [0, 1, 2, 4, 11, 12, 13, 14],
  [0, 1, 2, 3, 5, 20],
];

function resetPositions() {
  bots.remove();
  dead = false;
  setBanner('', 0);
  const defSpawns = MAP.spawns.def;
  for (let i = 0; i < 5; i += 1) {
    const bot = bots.spawn('def', defSpawns[i][0], defSpawns[i][1]);
    bot.patrol = DEF_PATROLS[i];
    bot.patrolIndex = 0;
    bot.state = 'patrol';
    bot.yaw = Math.PI;
  }
  const atkSpawns = MAP.spawns.atk;
  for (let i = 0; i < 3; i += 1) {
    const bot = bots.spawn('atk', atkSpawns[i + 1][0], atkSpawns[i + 1][1]);
    bot.patrol = ATK_PATROLS[i];
    bot.patrolIndex = 0;
    bot.state = 'patrol';
    bot.yaw = Math.PI;
  }
  player.reset(atkSpawns[0][0], atkSpawns[0][1]);
  player.state.yaw = Math.PI;
  arsenal.reset();
  bots.reset();
}

let bannerText = '';
let bannerTimer = 0;
function setBanner(text, seconds) {
  bannerText = text;
  bannerTimer = seconds;
}

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayBody = document.getElementById('overlay-body');
let overlayMode = 'start';
function showOverlay(mode, title, body) {
  overlayMode = mode;
  overlayTitle.textContent = title;
  overlayBody.textContent = body;
  overlay.style.display = 'flex';
}
function hideOverlay() {
  overlay.style.display = 'none';
}

let time = 0;
let buyOpen = false;
let scoped = false;
let dead = false;
let beepTimer = 0;

const shootOrigin = new THREE.Vector3();
const shootDirection = new THREE.Vector3();
const cameraForward = new THREE.Vector3();

function playerTargets() {
  return world.shootables.concat(bots.hitMeshes());
}
// A bot's ray must see every fighter except itself: the world, the player, and
// the other bots. The shooter's own head sits around its eye, so its meshes are
// left out or every shot would hit itself at point blank.
const botTargetList = [];
function botTargets(excludeBot) {
  botTargetList.length = 0;
  for (const mesh of world.shootables) botTargetList.push(mesh);
  botTargetList.push(playerTorso, playerHead);
  for (const other of bots.bots) {
    if (!other.alive || other === excludeBot) continue;
    botTargetList.push(other.model.torso, other.model.head);
  }
  return botTargetList;
}

function damageFighter(fighter, amount, part, attacker) {
  if (fighter.isPlayer) {
    if (!player.state.alive) return;
    player.state.health -= amount;
    audio.hurt();
    if (attacker) {
      const dx = attacker.mover.position.x - player.position.x;
      const dz = attacker.mover.position.z - player.position.z;
      const angle = Math.atan2(dx, dz) - player.state.yaw;
      hud.damageFrom((angle * 180) / Math.PI);
    }
    if (player.state.health <= 0) {
      player.state.health = 0;
      player.state.alive = false;
      dead = true;
      hud.killfeed(`${attacker ? attacker.name : 'The yard'} ✕ You`);
      setBanner('You are down — spectating your squad', 0);
    }
    return;
  }
  const killed = bots.damage(fighter, amount);
  hud.hitmarker(killed);
  if (killed) {
    const killer = attacker && attacker.isPlayer ? 'You' : attacker ? attacker.name : 'The yard';
    hud.killfeed(`${killer} ✕ ${fighter.name}`);
    if (attacker && attacker.isPlayer) {
      rounds.onKill();
      audio.kill();
    } else {
      audio.hit();
    }
  } else if (attacker && attacker.isPlayer) {
    audio.hit();
  }
}

function playerShoot() {
  if (!arsenal.ready()) return;
  const def = arsenal.def();
  if (!arsenal.takeRound()) {
    audio.click();
    return;
  }
  arsenal.pullTrigger();
  audio.shot(arsenal.state.current, 0);
  camera.getWorldPosition(shootOrigin);
  camera.getWorldDirection(cameraForward);
  const spread = arsenal.spread(player.groundSpeed());
  if (def.pellets) {
    const hits = combat.firePellets(shootOrigin, cameraForward, spread, def.pellets, random, playerTargets());
    for (const hit of hits) {
      damageFighter(hit.fighter, def.damage[hit.part === 'head' ? 1 : 0], hit.part, playerProxy);
    }
  } else {
    shootDirection.copy(cameraForward);
    shootDirection.x += (random() * 2 - 1) * spread;
    shootDirection.y += (random() * 2 - 1) * spread;
    shootDirection.z += (random() * 2 - 1) * spread;
    shootDirection.normalize();
    const hit = combat.fire(shootOrigin, shootDirection, playerTargets());
    if (hit && hit.fighter) {
      damageFighter(hit.fighter, def.damage[hit.part === 'head' ? 1 : 0], hit.part, playerProxy);
    }
  }
  player.recoil(arsenal.kick(), (random() * 2 - 1) * arsenal.kick() * 0.4);
  bots.hearShot(player.position, 'atk', time);
}

function botShoot(bot, eye, direction, def, kind) {
  audio.shot(kind, bot.mover.position.distanceTo(player.position));
  const hit = combat.fire(eye, direction, botTargets(bot));
  if (hit && hit.fighter) {
    // A teammate in the way stops the shot but takes no damage: no friendly fire,
    // including a friendly bot's stray round hitting the player.
    if (hit.fighter.team === bot.team) {
      combat.spawnImpact(hit.point, false);
      return;
    }
    const amount = def.damage[hit.part === 'head' ? 1 : 0] * 0.75;
    damageFighter(hit.fighter, amount, hit.part, bot);
  }
  bots.hearShot(eye, bot.team, time);
}

function enemiesOf(bot) {
  if (bot.team === 'def') {
    const list = [];
    if (player.state.alive) list.push(playerProxy);
    for (const mate of bots.bots) if (mate.team === 'atk' && mate.alive) list.push(mate);
    return list;
  }
  const list = [];
  for (const enemy of bots.bots) if (enemy.team === 'def' && enemy.alive) list.push(enemy);
  return list;
}
// The player proxy needs a mover-shaped position for bot vision; keep it in sync.
playerProxy.mover = { position: player.position };

function step(dt) {
  time += dt;
  const roundState = rounds.state;

  // Input: look, move, fire, reload, switch, grenades, buy, plant.
  const mouse = input.takeMouse();
  if (player.state.alive && input.state.locked) {
    player.look(mouse.dx, mouse.dy, scoped ? 0.0011 : 0.0022);
  }
  player.step(dt, input.keys);

  if (input.wasPressed('KeyR')) {
    arsenal.reload();
    audio.reload();
  }
  const wheel = input.takeWheel();
  if (wheel !== 0) {
    const owned = Object.keys(arsenal.state.owned);
    const index = owned.indexOf(arsenal.state.current);
    const next = owned[(index + (wheel > 0 ? 1 : -1) + owned.length) % owned.length];
    arsenal.equip(next);
  }
  const digitKeys = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6', 'Digit7'];
  const weaponOrder = ['pistol', 'rifle', 'smg', 'sniper', 'shotgun'];
  if (buyOpen) {
    for (let i = 0; i < digitKeys.length; i += 1) {
      if (!input.wasPressed(digitKeys[i])) continue;
      if (i < 5) {
        const result = arsenal.buy(weaponOrder[i], roundState.money);
        if (result.ok) {
          rounds.spend(result.price);
          arsenal.equip(weaponOrder[i]);
          audio.click();
        }
      } else {
        const kind = i === 5 ? 'he' : 'smoke';
        const result = arsenal.buyGrenade(kind, roundState.money);
        if (result.ok) rounds.spend(result.price);
        audio.click();
      }
    }
  } else {
    for (let i = 0; i < 5; i += 1) {
      if (input.wasPressed(digitKeys[i])) arsenal.equip(weaponOrder[i]);
    }
  }
  if (input.wasPressed('KeyB') && roundState.phase === 'buy') {
    buyOpen = !buyOpen;
    audio.click();
  }
  if (roundState.phase !== 'buy') buyOpen = false;
  if (input.wasPressed('KeyG') && player.state.alive) {
    const grenade = arsenal.throwGrenade('he', shootOrigin, cameraForward);
    if (grenade) combat.addGrenade(grenade);
  }
  if (input.wasPressed('KeyH') && player.state.alive) {
    const grenade = arsenal.throwGrenade('smoke', shootOrigin, cameraForward);
    if (grenade) combat.addGrenade(grenade);
  }

  // Planting: hold E inside a site during a live round.
  let plantProgress = 0;
  if (input.keys.has('KeyE') && player.state.alive && roundState.phase === 'live') {
    camera.getWorldPosition(shootOrigin);
    if (rounds.plantTick(dt, player.position)) {
      // Planted this step.
    }
    plantProgress = 1 - roundState.plantLeft / PLANT_SECONDS;
  } else if (roundState.phase === 'live' && !roundState.bomb.planted) {
    roundState.plantLeft = PLANT_SECONDS;
  }

  // Fire.
  if (player.state.alive && input.state.firing && input.state.locked && roundState.phase === 'live') {
    if (arsenal.def().auto || input.wasPressed('Mouse0')) playerShoot();
  }

  // Scope.
  scoped = arsenal.state.current === 'sniper' && input.state.aiming && player.state.alive;
  const targetFov = scoped ? 30 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
    camera.updateProjectionMatrix();
  }

  arsenal.step(dt);

  // Bots.
  // The bots only fight during a live round: during the buy phase they hold
  // their posts (a spawn is safe), and after the round ends they stand down.
  if (roundState.phase === 'live') {
    const context = {
      enemiesOf,
      bomb: roundState.bomb,
      playerAlive: player.state.alive,
      onShoot: botShoot,
      onDefused(bot) {
        hud.killfeed(`${bot.name} defused the charge`);
        rounds.onDefused();
      },
    };
    bots.step(dt, time, context);
  }

  // Rounds.
  rounds.step(dt, {
    aliveAtk: (player.state.alive ? 1 : 0) + bots.aliveCount('atk'),
    aliveDef: bots.aliveCount('def'),
  });
  if (bannerTimer > 0) {
    bannerTimer -= dt;
    if (bannerTimer <= 0) bannerText = '';
  }

  // Bomb beep and blink, accelerating as the fuse runs down.
  if (roundState.bomb.planted) {
    beepTimer -= dt;
    const urgency = 1 - roundState.bomb.fuseLeft / BOMB_FUSE;
    if (beepTimer <= 0) {
      beepTimer = 1.2 - urgency * 0.9;
      audio.plantBeep();
    }
    const blink = Math.sin(time * (6 + urgency * 14)) > 0;
    bombLight.material.color.setHex(blink ? 0xe0492f : 0x3a0d08);
    bombLightPoint.intensity = blink ? 2 : 0;
    bombLightPoint.position.copy(bombGroup.position).y = 0.4;
  }

  // Explosion damage from grenades and the bomb.
  combat.step(dt, time, (at, radius, maxDamage, minDamage) => {
    const fighters = [];
    if (player.state.alive) fighters.push(playerProxy);
    for (const bot of bots.bots) if (bot.alive) fighters.push(bot);
    for (const fighter of fighters) {
      const position = fighter.mover ? fighter.mover.position : fighter.position;
      const distance = Math.hypot(position.x - at.x, position.z - at.z);
      if (distance > radius) continue;
      const amount = maxDamage - ((maxDamage - minDamage) * distance) / radius;
      damageFighter(fighter, amount, 'torso', null);
    }
  }, world.colliders);

  // Bomb detonation: the rounds module ends the round; the blast is visual here.
  if (roundState.bomb.planted && roundState.bomb.fuseLeft <= 0 && !roundState.bomb.blew) {
    roundState.bomb.blew = true;
    combat.detonate(new THREE.Vector3(roundState.bomb.position.x, 0.5, roundState.bomb.position.z), () => {});
    bombGroup.visible = false;
  }

  // Player hit meshes follow the player for bot rays.
  playerHitGroup.position.copy(player.position);
  playerHitGroup.rotation.y = player.state.yaw;

  // Camera: first person, or a spectate view behind a living teammate.
  if (!player.state.alive && dead) {
    const mate = bots.bots.find((bot) => bot.team === 'atk' && bot.alive);
    if (mate) {
      camera.position.set(
        mate.mover.position.x + Math.sin(mate.yaw) * 2.5,
        mate.mover.position.y + 2.2,
        mate.mover.position.z + Math.cos(mate.yaw) * 2.5,
      );
      camera.lookAt(mate.mover.position.x, mate.mover.position.y + 1.2, mate.mover.position.z);
    }
  } else {
    camera.position.set(player.position.x, player.position.y + player.state.eye, player.position.z);
    camera.rotation.set(player.state.pitch, player.state.yaw, 0);
  }

  // HUD + minimap.
  const spotted = [];
  for (const enemy of bots.bots) {
    if (enemy.team !== 'def' || !enemy.alive) continue;
    const targeted = bots.bots.some((mate) => mate.team === 'atk' && mate.alive && mate.target === enemy);
    const nearPlayer = Math.hypot(enemy.mover.position.x - player.position.x, enemy.mover.position.z - player.position.z) < 12;
    if (targeted || nearPlayer) spotted.push({ x: enemy.mover.position.x, z: enemy.mover.position.z });
  }
  const mates = bots.bots.filter((bot) => bot.team === 'atk' && bot.alive).map((bot) => ({ x: bot.mover.position.x, z: bot.mover.position.z }));
  minimap.draw({
    player: { x: player.position.x, z: player.position.z, yaw: player.state.yaw },
    mates,
    spotted,
    bomb: roundState.bomb.planted ? { position: roundState.bomb.position } : null,
  });
  const ammo = arsenal.current();
  const inSite = !roundState.bomb.planted && roundState.phase === 'live' && Object.values(MAP.sites).some((site) => Math.hypot(player.position.x - site.center[0], player.position.z - site.center[1]) < site.radius);
  hud.update({
    health: player.state.health,
    mag: ammo.mag,
    reserve: ammo.reserve,
    weaponName: arsenal.def().name,
    money: roundState.money,
    timer: roundState.timer,
    scoreAtk: roundState.score.atk,
    scoreDef: roundState.score.def,
    round: roundState.round,
    objective: roundState.bomb.planted
      ? `Defend the charge — ${Math.ceil(roundState.bomb.fuseLeft)}s`
      : roundState.phase === 'buy'
        ? 'Buy phase — press B for the shop'
        : 'Plant the charge at Site A or B',
    banner: bannerText,
    showBuy: buyOpen,
    progress: plantProgress,
    progressKind: 'plant',
    scoped,
    alive: player.state.alive,
    hint: inSite ? 'Hold E to plant the charge' : '',
    reloadLeft: arsenal.state.reloadLeft,
  }, dt);

  input.endFrame();
}

// Shot-mode camera presets: a fixed cinematic view per mode, over the live game.
const SHOT_CAMERAS = {
  start: { pos: [10, 8, 12], look: [-6, 0, -6] },
  play: { pos: [-6, 6, 8], look: [4, 1, -6] },
  plant: { pos: [-3, 7, 1], look: [-13, 0.5, -9.5] },
  end: { pos: [0, 12, 14], look: [0, 0, -6] },
};

let accumulator = 0;
let lastTime = performance.now();
let shotReady = false;

function frame(now) {
  requestAnimationFrame(frame);
  const frameDt = Math.min(0.1, (now - lastTime) / 1000);
  lastTime = now;
  const paused = !shotMode && !input.state.locked;
  // The pause overlay only appears after pointer lock was held once and then lost
  // (Esc). Before the first lock — the click that deploys — the lock is still
  // being granted, and re-showing the overlay there would swallow the click.
  if (!shotMode && overlay.style.display === 'none' && !input.state.locked && input.state.hasLocked && overlayMode !== 'match') {
    showOverlay('paused', 'PAUSED', 'Click to resume.');
  }
  if (!paused) {
    accumulator += frameDt;
    let steps = 0;
    while (accumulator >= FIXED_DT && steps < 5) {
      step(FIXED_DT);
      accumulator -= FIXED_DT;
      steps += 1;
    }
    if (steps === 5) accumulator = 0;
  }
  if (shotMode) {
    const preset = SHOT_CAMERAS[shotMode] || SHOT_CAMERAS.play;
    camera.position.set(...preset.pos);
    camera.lookAt(...preset.look);
    if (camera.fov !== 60) {
      camera.fov = 60;
      camera.updateProjectionMatrix();
    }
    if (!shotReady) {
      shotReady = true;
      window.__shotReady = true;
    }
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

overlay.addEventListener('click', () => {
  audio.unlock();
  if (overlayMode === 'match') {
    rounds.startMatch();
    dead = false;
    hideOverlay();
    input.lock();
    return;
  }
  if (overlayMode === 'start') {
    rounds.startMatch();
    dead = false;
  }
  hideOverlay();
  input.lock();
});

// Shot mode: no pointer lock, no start screen — warm the simulation up so bots
// have left their spawns, then let the frame loop mark the shot ready.
if (shotMode) {
  hideOverlay();
  rounds.startMatch();
  rounds.state.phase = 'live';
  rounds.state.timer = 90;
  if (shotMode === 'plant') {
    rounds.state.bomb = { planted: true, site: 'A', position: { x: -13.5, z: -9.5 }, fuseLeft: 35 };
    bombGroup.visible = true;
    bombGroup.position.set(-13.5, 0, -9.5);
  }
  if (shotMode === 'end') {
    rounds.state.phase = 'match';
    rounds.state.score = { atk: 5, def: 3 };
  }
  for (let i = 0; i < 150; i += 1) step(FIXED_DT);
  // resetPositions() re-enables the pistol view model, so hide the view models
  // after the warm-up, not before it.
  arsenal.setViewVisible(false);
} else {
  showOverlay('start', 'EMBERWORKS', 'A tactical FPS at a decommissioned power station. Plant the charge at Site A or B — first to 5 rounds wins. Click to deploy.');
}

// A debug handle for automated tests (?debug=1): read-only-ish access to the live
// game state. It is off unless the query param is present, so a normal play session
// never exposes it.
if (params.get('debug') === '1') {
  window.__ember = {
    player,
    rounds,
    bots,
    arsenal,
    get time() {
      return time;
    },
  };
}

requestAnimationFrame(frame);
