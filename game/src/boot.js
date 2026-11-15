// RAILHEAD — boot.js: the entry point.
//
// Builds the renderer, the yard, the player, the bots and the match, then
// runs the fixed-step loop (60 Hz simulation, rendering decoupled). Input is
// read as a snapshot each sim step so a seeded run is reproducible. The
// player is "Switch", one attacker beside three bot teammates, against five
// defender bots. The charge starts on the player.
//
// URL params: ?seed=N (deterministic RNG), ?shot=start|play|plant|end
// (cinematic screenshot mode), ?debug=1 (window.__railhead handle).

import * as THREE from 'three';
import { createRng, hashSeed } from './rng.js';
import { buildYardMeshes, SPAWNS, SITES, losBlocked } from './yard.js';
import { createMover, stepMover, eyeHeight, WALK_SPEED } from './mover.js';
import {
  WEAPONS, GRENADE_PRICE, createArsenal, currentDef, currentSlot,
  buyWeapon, selectWeapon, startReload, updateArsenal, isReloading,
  fireWeapon, createViewmodel, updateViewmodel, createTracers,
  createGrenades, createSmokeVisual,
} from './guns.js';
import { createBots, resetBots, stepBots, aliveCount, killBot } from './bots.js';
import {
  createMatch, startRound, stepMatch, plantBy, defuseBy,
  interruptChannel, siteAt, buyFor,
} from './match.js';
import {
  createHud, updateHud, showBanner, addKillfeed, showHitmarker,
  showDamageArc, buildBuyMenu, setBuyOpen, setChannel,
} from './hud.js';
import { createAudio } from './audio.js';
import { setupShots } from './shots.js';
import { installDebug } from './debug.js';
import { angleDiff, dist2D, clamp } from './math3.js';

const STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const SEED = Number(params.get('seed') ?? hashSeed('railhead'));
const rng = createRng(SEED);

// ---------------------------------------------------------------- world

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.1, 200);
camera.rotation.order = 'YXZ';
scene.add(camera);

buildYardMeshes(THREE, scene, rng);
const hud = createHud();
const audio = createAudio();
const tracers = createTracers(THREE, scene);
const grenades = createGrenades(THREE, scene);
const smokeVisual = createSmokeVisual(THREE, scene);
const viewmodel = createViewmodel(THREE, camera);
const muzzleLight = new THREE.PointLight(0xffc27a, 0, 9, 1.8);
scene.add(muzzleLight);

// ---------------------------------------------------------------- actors

const playerMover = createMover(SPAWNS.atk[3][0], SPAWNS.atk[3][1], SPAWNS.atk[3][2]);
const playerObj = { kind: 'player' };
let playerYaw = SPAWNS.atk[3][2];
let playerPitch = 0;
let playerHealth = 100;
let playerAlive = true;
let recoilPitch = 0;
let shakeT = 0;
let stepTimer = 0;
let scoped = false;
let buyOpen = false;
let spectateTarget = null;

const arsenal = createArsenal(['p9'], 'p9');
const bots = createBots(THREE, scene, rng);
const playerChar = {
  get pos() { return playerMover.pos; },
  get crouch() { return playerMover.crouch; },
  get alive() { return playerAlive; },
  team: 'atk',
  name: 'Switch',
  ref: playerObj,
};
const botChars = bots.bots.map((bot) => ({
  get pos() { return bot.mover.pos; },
  get crouch() { return bot.mover.crouch; },
  get alive() { return bot.alive; },
  team: bot.team,
  name: bot.name,
  ref: bot,
}));
const chars = [playerChar, ...botChars];

// ---------------------------------------------------------------- match

let time = 0;
const noises = [];
const match = createMatch({
  onBanner: (title, sub, seconds) => showBanner(hud, title, sub, seconds, time),
  onPlant: () => {
    audio.plantDone();
    addKillfeed(hud, 'Charge planted', 'atk');
  },
  onRoundLive: () => {},
  onRoundEnd: (winner) => {
    if (winner === 'atk') audio.roundWin();
    else audio.roundLose();
  },
  onDetonate: (pos) => {
    audio.explosion();
    shakeT = 0.6;
    if (!pos) return;
    const d = dist2D(playerMover.pos.x, playerMover.pos.z, pos.x, pos.z);
    if (d < 12) {
      const dmg = Math.round(120 - (d / 12) * 100);
      damageCharacter(playerChar, dmg, null, 'body');
    }
  },
  onMatchEnd: () => {
    document.exitPointerLock?.();
    hud.endTitle.textContent = match.score.atk >= 5 ? 'Attackers take the match' : 'Defenders take the match';
    hud.endScore.textContent = `${match.score.atk} — ${match.score.def}`;
    hud.endScreen.classList.remove('hidden');
  },
  onNextRound: () => {
    resetWorld();
    startRound(match);
  },
});

function resetWorld() {
  playerMover.pos.x = SPAWNS.atk[3][0];
  playerMover.pos.y = 0;
  playerMover.pos.z = SPAWNS.atk[3][1];
  playerMover.vel.x = 0;
  playerMover.vel.y = 0;
  playerMover.vel.z = 0;
  playerYaw = SPAWNS.atk[3][2];
  playerPitch = 0;
  playerHealth = 100;
  playerAlive = true;
  recoilPitch = 0;
  spectateTarget = null;
  for (const id of Object.keys(arsenal.slots)) {
    arsenal.slots[id].mag = WEAPONS[id].mag;
    arsenal.slots[id].reserve = WEAPONS[id].reserve;
  }
  arsenal.reloadUntil = 0;
  arsenal.reloading = null;
  arsenal.bloom = 0;
  resetBots(bots, SPAWNS);
  grenades.clear();
  smokeVisual.clear();
  setBuyOpen(hud, false);
  buyOpen = false;
}

// ---------------------------------------------------------------- damage

function addNoise(x, z, radius) {
  noises.push({ x, z, radius, at: time });
}

/** Apply damage to a character record; returns true when it died. */
function damageCharacter(char, dmg, attacker, part) {
  if (char.ref === playerObj) {
    if (!playerAlive) return false;
    playerHealth -= dmg;
    interruptChannel(match, 'player');
    audio.hurt();
    if (attacker && attacker.mover) {
      const dx = attacker.mover.pos.x - playerMover.pos.x;
      const dz = attacker.mover.pos.z - playerMover.pos.z;
      showDamageArc(hud, angleDiff(playerYaw, Math.atan2(-dx, -dz)));
    }
    if (playerHealth <= 0) {
      playerHealth = 0;
      playerAlive = false;
      document.exitPointerLock?.();
      hud.deploy.classList.remove('hidden');
      addKillfeed(hud, `${attacker ? attacker.name : '—'} ✕ Switch`, 'def');
      transferBomb();
    }
    return !playerAlive;
  }
  const bot = char.ref;
  if (!bot.alive) return false;
  bot.health -= dmg;
  interruptChannel(match, bot);
  if (bot.health <= 0) {
    const killerName = attacker === 'player' ? 'Switch' : attacker ? attacker.name : '—';
    killBot(bot, killerName);
    addKillfeed(hud, `${killerName} ✕ ${bot.name}`, attacker === 'player' ? 'atk' : bot.team);
    if (attacker === 'player') match.money += 300;
    if (match.bomb.carrier === bot) transferBomb();
  }
  return !bot.alive;
}

/** Pass the charge to the nearest living attacker (bot or player). */
function transferBomb() {
  if (match.bomb.planted) return;
  let best = null;
  let bestD = Infinity;
  for (const bot of bots.bots) {
    if (!bot.alive || bot.team !== 'atk') continue;
    const d = dist2D(bot.mover.pos.x, bot.mover.pos.z, playerMover.pos.x, playerMover.pos.z);
    if (d < bestD) {
      bestD = d;
      best = bot;
    }
  }
  match.bomb.carrier = playerAlive ? 'player' : best;
}

// ---------------------------------------------------------------- player fire

function playerEye() {
  return { x: playerMover.pos.x, y: playerMover.pos.y + eyeHeight(playerMover), z: playerMover.pos.z };
}

function playerForward() {
  const cp = Math.cos(playerPitch + recoilPitch);
  return {
    x: -Math.sin(playerYaw) * cp,
    y: Math.sin(playerPitch + recoilPitch),
    z: -Math.cos(playerYaw) * cp,
  };
}

function tryPlayerFire() {
  const def = currentDef(arsenal);
  const speed = Math.sqrt(playerMover.vel.x * playerMover.vel.x + playerMover.vel.z * playerMover.vel.z);
  const result = fireWeapon(arsenal, {
    now: time,
    rng,
    origin: playerEye(),
    dir: playerForward(),
    speed01: clamp(speed / WALK_SPEED, 0, 1),
    airborne: !playerMover.onGround,
    scoped,
    team: 'atk',
    targets: chars,
    onHit: (char, dmg, part, point) => {
      if (char.team === 'atk') return;
      const died = damageCharacter(char, dmg, 'player', part);
      showHitmarker(hud, died);
      if (died) audio.kill();
      else audio.hit();
      hud.spotted.set(char.name, time);
    },
  });
  if (result.fired) {
    recoilPitch = Math.min(0.09, recoilPitch + (def.kick * Math.PI) / 180);
    const eye = playerEye();
    const dir = playerForward();
    const end = result.hits[0]
      ? result.hits[0].point
      : { x: eye.x + dir.x * def.range, y: eye.y + dir.y * def.range, z: eye.z + dir.z * def.range };
    tracers.spawn({ x: eye.x + dir.x * 0.4, y: eye.y - 0.08, z: eye.z + dir.z * 0.4 }, end);
    muzzleLight.position.set(eye.x, eye.y, eye.z);
    muzzleLight.intensity = 7;
    audio.shot(def.kind, 0);
    addNoise(playerMover.pos.x, playerMover.pos.z, 22);
  } else if (result.dry) {
    audio.dry();
    startReload(arsenal, time);
  }
}

// ---------------------------------------------------------------- input

const keys = new Set();
let mouseDown = false;
let mouseEdge = false;
let locked = false;
let everLocked = false;

const canvas = renderer.domElement;
hud.deploy.addEventListener('click', () => {
  audio.unlock();
  canvas.requestPointerLock();
});
hud.pause.addEventListener('click', () => {
  canvas.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  locked = document.pointerLockElement === canvas;
  if (locked) {
    everLocked = true;
    hud.deploy.classList.add('hidden');
    hud.pause.classList.add('hidden');
  } else if (everLocked && playerAlive && !game.cinematic) {
    hud.pause.classList.remove('hidden');
  }
});
document.addEventListener('mousemove', (e) => {
  if (!locked) return;
  playerYaw -= e.movementX * 0.0022;
  playerPitch = clamp(playerPitch - e.movementY * 0.0022, -1.5, 1.5);
});
document.addEventListener('mousedown', (e) => {
  if (!locked) return;
  if (e.button === 0) {
    mouseDown = true;
    mouseEdge = true;
  } else if (e.button === 2) {
    scoped = true;
  }
});
document.addEventListener('mouseup', (e) => {
  if (e.button === 0) mouseDown = false;
  else if (e.button === 2) scoped = false;
});
document.addEventListener('contextmenu', (e) => e.preventDefault());
document.addEventListener('wheel', (e) => {
  if (!locked || buyOpen) return;
  const order = arsenal.order;
  const idx = order.indexOf(arsenal.current);
  const next = order[(idx + (e.deltaY > 0 ? 1 : order.length - 1)) % order.length];
  selectWeapon(arsenal, next);
});

function buyItem(id) {
  if (match.phase !== 'buy') return;
  if (id === 'he' || id === 'smoke') {
    if (match.money < GRENADE_PRICE[id]) {
      audio.denied();
      return;
    }
    match.money -= GRENADE_PRICE[id];
    arsenal[id] += 1;
    audio.buy();
    return;
  }
  const result = buyFor(match, arsenal, id, WEAPONS[id].price);
  if (result === 'ok') {
    buyWeapon(arsenal, id);
    selectWeapon(arsenal, id);
    audio.buy();
  } else {
    audio.denied();
  }
}

buildBuyMenu(hud, buyItem);

document.addEventListener('keydown', (e) => {
  if (e.code === 'KeyB' && match.phase === 'buy' && playerAlive) {
    buyOpen = !buyOpen;
    setBuyOpen(hud, buyOpen);
    return;
  }
  if (buyOpen) {
    const idx = ['Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6'].indexOf(e.code);
    if (idx >= 0) {
      const rows = hud.buyList.querySelectorAll('.buy-row');
      const row = rows[idx];
      if (row) buyItem(row.dataset.id);
    }
    if (e.code === 'Escape') {
      buyOpen = false;
      setBuyOpen(hud, false);
    }
    return;
  }
  keys.add(e.code);
  if (e.code === 'KeyR') {
    if (startReload(arsenal, time)) audio.reload();
  }
  if (e.code.startsWith('Digit')) {
    const idx = Number(e.code.slice(5)) - 1;
    const id = arsenal.order[idx];
    if (id) selectWeapon(arsenal, id);
  }
  if (e.code === 'KeyG' && arsenal.he > 0) {
    arsenal.he -= 1;
    grenades.throw('he', playerEye(), playerForward(), 14);
  }
  if (e.code === 'KeyH' && arsenal.smoke > 0) {
    arsenal.smoke -= 1;
    grenades.throw('smoke', playerEye(), playerForward(), 14);
  }
});
document.addEventListener('keyup', (e) => keys.delete(e.code));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ---------------------------------------------------------------- sim step

const botCtx = {
  get now() { return time; },
  rng,
  get phase() { return match.phase; },
  chars,
  get smokes() { return grenades.smokes; },
  noises,
  get bomb() { return match.bomb; },
  get bombCarrier() { return match.bomb.carrier; },
  onDamage: (char, dmg, attacker, part) => damageCharacter(char, dmg, attacker, part),
  onShot: (bot, dist) => {
    audio.shot('rifle', dist);
    addNoise(bot.mover.pos.x, bot.mover.pos.z, 22);
  },
  tracers,
  matchApi: {
    defuseBy: (bot, dt) => {
      const bomb = match.bomb;
      if (!bomb.planted || !bomb.pos) return 'idle';
      if (dist2D(bot.mover.pos.x, bot.mover.pos.z, bomb.pos.x, bomb.pos.z) > 2.6) return 'idle';
      return defuseBy(match, bot, dt);
    },
    plantBy: (bot, dt) => {
      const site = siteAt(bot.mover.pos.x, bot.mover.pos.z);
      if (!site || site !== bot.site) return 'idle';
      return plantBy(match, bot, site, bot.mover.pos, dt);
    },
    onDefused: () => {},
    onPlanted: () => {},
  },
};

function stepSim(dt) {
  time += dt;
  // Prune old noises.
  for (let i = noises.length - 1; i >= 0; i--) {
    if (time - noises[i].at > 2) noises.splice(i, 1);
  }
  updateArsenal(arsenal, time, dt);
  recoilPitch = Math.max(0, recoilPitch - dt * 0.25);
  muzzleLight.intensity = Math.max(0, muzzleLight.intensity - dt * 60);

  // Player movement + fire.
  if (playerAlive && !game.cinematic && match.phase !== 'over' && match.phase !== 'matchover') {
    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    playerMover.yaw = playerYaw;
    stepMover(playerMover, {
      fwd,
      strafe,
      jump: keys.has('Space'),
      crouch: keys.has('KeyC') || keys.has('ControlLeft'),
    }, dt);
    const speed = Math.sqrt(playerMover.vel.x * playerMover.vel.x + playerMover.vel.z * playerMover.vel.z);
    if (playerMover.onGround && speed > 1) {
      stepTimer -= dt;
      if (stepTimer <= 0) {
        stepTimer = 0.38;
        audio.step();
      }
    }
    const def = currentDef(arsenal);
    if (locked && (def.auto ? mouseDown : mouseEdge)) tryPlayerFire();
    mouseEdge = false;
    // Plant / defuse channel on E.
    if (keys.has('KeyE')) {
      if (match.phase === 'live' && match.bomb.carrier === 'player') {
        const site = siteAt(playerMover.pos.x, playerMover.pos.z);
        if (site) {
          const res = plantBy(match, 'player', site, playerMover.pos, dt);
          setChannel(hud, 'Planting the charge…', match.bomb.plantProgress / 3);
          if (res === 'planted') audio.plantDone();
        } else {
          setChannel(hud, null, 0);
        }
      } else if (match.phase === 'planted' && match.bomb.pos) {
        const d = dist2D(playerMover.pos.x, playerMover.pos.z, match.bomb.pos.x, match.bomb.pos.z);
        if (d < 2.6) {
          defuseBy(match, 'player', dt);
          setChannel(hud, 'Defusing the charge…', match.bomb.defuseProgress / 5);
        } else {
          setChannel(hud, null, 0);
        }
      } else {
        setChannel(hud, null, 0);
      }
    } else {
      setChannel(hud, null, 0);
    }
  } else {
    mouseEdge = false;
    setChannel(hud, null, 0);
  }

  // Bots, match, grenades.
  stepBots(bots, dt, botCtx);
  stepMatch(match, dt, {
    aliveAtk: aliveCount(bots, 'atk') + (playerAlive ? 1 : 0),
    aliveDef: aliveCount(bots, 'def'),
    onNextRound: match.hooks.onNextRound,
  });
  grenades.update(dt, {
    now: time,
    onExplode: (pos) => {
      match.hooks.onDetonate(pos);
      for (const char of chars) {
        if (!char.alive) continue;
        const d = dist2D(char.pos.x, char.pos.z, pos.x, pos.z);
        if (d > 6) continue;
        if (losBlocked(char.pos.x, char.pos.z, pos.x, pos.z)) continue;
        damageCharacter(char, Math.round(120 - (d / 6) * 100), null, 'body');
      }
    },
    onSmoke: (cloud) => smokeVisual.add(cloud, rng),
    onSmokeGone: (cloud) => smokeVisual.remove(cloud),
  });
  tracers.update(dt);

  // Planted-bomb beeps, quickening as the fuse runs down.
  if (match.phase === 'planted' && match.bomb.fuseLeft > 0) {
    const interval = match.bomb.fuseLeft > 20 ? 1.0 : match.bomb.fuseLeft > 10 ? 0.6 : 0.3;
    if (time - (stepSim.lastBeep ?? 0) >= interval) {
      stepSim.lastBeep = time;
      audio.plantBeep();
    }
  }
}

// ---------------------------------------------------------------- frame

function syncCamera() {
  if (game.cinematic) return;
  if (playerAlive) {
    camera.position.set(playerMover.pos.x, playerMover.pos.y + eyeHeight(playerMover), playerMover.pos.z);
    camera.rotation.y = playerYaw;
    camera.rotation.x = playerPitch + recoilPitch;
  } else {
    // Spectate the first living attacker bot.
    if (!spectateTarget || !spectateTarget.alive) {
      spectateTarget = bots.bots.find((b) => b.alive && b.team === 'atk') ?? bots.bots.find((b) => b.alive) ?? null;
    }
    if (spectateTarget) {
      camera.position.set(
        spectateTarget.mover.pos.x,
        spectateTarget.mover.pos.y + eyeHeight(spectateTarget.mover),
        spectateTarget.mover.pos.z
      );
      camera.rotation.y = spectateTarget.yaw;
      camera.rotation.x = 0;
    }
  }
  if (shakeT > 0) {
    shakeT -= 1 / 60;
    camera.position.x += (rng.next() - 0.5) * shakeT * 0.3;
    camera.position.y += (rng.next() - 0.5) * shakeT * 0.3;
  }
  const def = currentDef(arsenal);
  const targetFov = scoped && def.scope ? 28 : scoped ? 68 : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * 0.2;
    camera.updateProjectionMatrix();
  }
}

function syncViewmodel(dt) {
  const speed = Math.sqrt(playerMover.vel.x * playerMover.vel.x + playerMover.vel.z * playerMover.vel.z);
  updateViewmodel(viewmodel, dt, playerAlive && speed > 0.5, scoped && currentDef(arsenal).scope, false);
  viewmodel.group.visible = playerAlive && !game.cinematic && !(scoped && currentDef(arsenal).scope);
}

/** Push the live state into the HUD (used by the frame loop and by shots). */
function refreshHud(dt) {
  updateHud(hud, {
    playerHealth,
    match,
    aliveAtk: aliveCount(bots, 'atk') + (playerAlive ? 1 : 0),
    aliveDef: aliveCount(bots, 'def'),
    weapon: currentDef(arsenal),
    slot: currentSlot(arsenal),
    reloading: isReloading(arsenal),
    spreadPx: clamp(arsenal.bloom * 6, 0, 10),
    scoped: scoped && currentDef(arsenal).scope,
    bombCarrier: match.bomb.carrier,
    bots: bots.bots,
    now: time,
    playerX: playerMover.pos.x,
    playerZ: playerMover.pos.z,
    playerYaw,
  }, time, dt);
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - (frame.last ?? now)) / 1000 || 0);
  frame.last = now;
  let acc = (frame.acc ?? 0) + dt;
  let steps = 0;
  while (acc >= STEP && steps < 5) {
    stepSim(STEP);
    acc -= STEP;
    steps++;
  }
  frame.acc = acc;
  syncCamera();
  syncViewmodel(dt);
  // Spot enemies for the minimap.
  for (const bot of bots.bots) {
    if (!bot.alive || bot.team === 'atk') continue;
    const d = dist2D(bot.mover.pos.x, bot.mover.pos.z, playerMover.pos.x, playerMover.pos.z);
    if (d > 40) continue;
    const want = Math.atan2(-(bot.mover.pos.x - playerMover.pos.x), -(bot.mover.pos.z - playerMover.pos.z));
    if (Math.abs(angleDiff(playerYaw, want)) > 1.1) continue;
    if (losBlocked(playerMover.pos.x, playerMover.pos.z, bot.mover.pos.x, bot.mover.pos.z)) continue;
    hud.spotted.set(bot.name, time);
  }
  refreshHud(dt);
  renderer.render(scene, camera);
}

// ---------------------------------------------------------------- the game object (shots + debug)

const game = {
  cinematic: false,
  camera,
  match,
  bots,
  arsenal,
  playerMover,
  get playerYaw() { return playerYaw; },
  get playerHealth() { return playerHealth; },
  get playerAlive() { return playerAlive; },
  get time() { return time; },
  currentWeaponDef: () => currentDef(arsenal),
  currentSlot: () => currentSlot(arsenal),
  damageBot: (bot, amount) => {
    const char = botChars.find((c) => c.ref === bot);
    if (char) damageCharacter(char, amount, null, 'body');
  },
  setViewVisible: (visible) => {
    viewmodel.group.visible = visible;
  },
  hideOverlays: () => {
    hud.deploy.classList.add('hidden');
    hud.pause.classList.add('hidden');
    hud.buyMenu.classList.add('hidden');
    hud.channel.classList.add('hidden');
    hud.endScreen.classList.add('hidden');
    hud.banner.classList.add('hidden');
    hud.bannerUntil = 0;
  },
  forceLive: () => {
    match.phase = 'live';
    match.timer = 90;
  },
  warmSim: (seconds) => {
    const steps = Math.round(seconds / STEP);
    for (let i = 0; i < steps; i++) stepSim(STEP);
  },
  plantForShot: (site) => {
    const s = SITES[site];
    match.bomb.planted = true;
    match.bomb.site = site;
    match.bomb.pos = { x: s.cx, z: s.cz };
    match.bomb.fuseLeft = 35;
    match.phase = 'planted';
  },
  fireTracerForShot: () => {
    const def = bots.bots.find((b) => b.alive && b.team === 'def');
    if (!def) return;
    const eye = { x: def.mover.pos.x, y: def.mover.pos.y + 1.5, z: def.mover.pos.z };
    tracers.spawn(eye, { x: 0, y: 1.2, z: 4 });
  },
  renderOnce: () => {
    syncCamera();
    hud.minimapAt = 1; // force a minimap draw for the still frame
    refreshHud(0);
    renderer.render(scene, camera);
  },
};

// ---------------------------------------------------------------- go

resetBots(bots, SPAWNS);
startRound(match);
installDebug(game);

if (params.get('shot')) {
  setupShots(game);
} else {
  requestAnimationFrame(frame);
}
