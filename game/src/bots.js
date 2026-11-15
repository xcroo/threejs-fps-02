// RAILHEAD — bots.js: the bot squads.
//
// Three attacker bots fight beside you; five defender bots hold the sites.
// Each bot is a small state machine:
//
//   hold     — stand at a waypoint, scanning slowly
//   patrol   — walk a short loop between two waypoints
//   push     — attackers walk a BFS route toward their assigned site
//   hunt     — walk toward the last heard noise
//   engage   — a target is visible: strafe, burst-fire, keep 6-14 m
//   converge — defenders run to a planted bomb
//   defuse   — channel the defuse at the bomb (5 s, broken by damage)
//   plant    — the bomb carrier channels the plant at a site (3 s)
//
// Vision is a cone (18 m, 110 degrees) with a line-of-sight ray and smoke
// blocking; hearing is a radius (gunshots 22 m). Bots fire in bursts with
// distance-based error and reload when dry. Bots only think every 0.12 s
// (staggered), but move and shoot every frame.

import { WAYPOINTS, SITES, SPAWNS, bfsRoute, nearestWaypoint, losBlocked } from './yard.js';
import { createMover, stepMover, eyeHeight } from './mover.js';
import { createArsenal, fireWeapon, updateArsenal, startReload, WEAPONS } from './guns.js';
import { segmentThroughSmoke } from './guns.js';
import { turnToward, angleDiff, dist2D, clamp } from './math3.js';

export const BOT_NAMES = {
  atk: ['Ash', 'Bram', 'Cato'],
  def: ['Dara', 'Fenn', 'Gus', 'Hale', 'Ivo'],
};
export const VISION_RANGE = 18;
export const VISION_HALF_ANGLE = (110 * Math.PI) / 180 / 2;
export const HEARING_RANGE = 22;
export const BOT_SPEED = 3.6;
export const DEFUSE_TIME = 5;
export const PLANT_TIME = 3;

function teamColor(team) {
  return team === 'atk' ? 0x4a8a3f : 0x8a3f3f;
}

/** Build one blocky bot model: legs, torso + team vest, head + headband, gun. */
function buildBotModel(THREE, team) {
  const group = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a586, roughness: 0.8 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x2e2e33, roughness: 0.9 });
  const vest = new THREE.MeshStandardMaterial({ color: teamColor(team), roughness: 0.85 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.6, metalness: 0.3 });
  const add = (w, h, d, x, y, z, material) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  const legL = add(0.16, 0.5, 0.16, -0.11, 0.25, 0, cloth);
  const legR = add(0.16, 0.5, 0.16, 0.11, 0.25, 0, cloth);
  add(0.5, 0.6, 0.28, 0, 0.8, 0, cloth);
  add(0.52, 0.38, 0.3, 0, 0.86, 0, vest);
  const armL = add(0.12, 0.48, 0.12, -0.32, 0.85, 0.02, cloth);
  const armR = add(0.12, 0.48, 0.12, 0.32, 0.85, 0.02, cloth);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 10), skin);
  head.position.set(0, 1.52, 0);
  head.castShadow = true;
  group.add(head);
  add(0.34, 0.06, 0.34, 0, 1.6, 0, vest);
  add(0.06, 0.08, 0.55, 0, 1.02, -0.22, dark);
  return { group, legL, legR, armL, armR, head };
}

/** Create the eight bots and their models. */
export function createBots(THREE, scene, rng) {
  const bots = [];
  const mk = (team, i, spawn) => {
    const bot = {
      name: BOT_NAMES[team][i],
      team,
      slot: i, // index inside the team (0..2 attackers, 0..4 defenders)
      mover: createMover(spawn[0], spawn[1], spawn[2]),
      yaw: spawn[2],
      health: 100,
      alive: true,
      state: 'hold',
      route: [],
      target: null,
      lastSeen: null,
      reactAt: 0,
      burstLeft: 0,
      burstPauseUntil: 0,
      strafeDir: 1,
      strafeUntil: 0,
      holdUntil: 0,
      thinkAt: rng.range(0, 0.12),
      site: team === 'atk' ? (i < 2 ? 'A' : 'B') : i < 2 ? 'A' : i < 4 ? 'B' : null,
      holdWp: 0,
      patrolWp: 0,
      arsenal: createArsenal(['vk47', 'p9'], 'vk47'),
      walkPhase: rng.range(0, Math.PI * 2),
      model: null,
      fell: false,
    };
    bot.model = buildBotModel(THREE, team);
    scene.add(bot.model.group);
    bots.push(bot);
    return bot;
  };
  // Three attackers and five defenders, on their spawns.
  for (let i = 0; i < 3; i++) mk('atk', i, SPAWNS.atk[i]);
  for (let i = 0; i < 5; i++) mk('def', i, SPAWNS.def[i]);
  return { bots, rng };
}

/** Put every bot back on its spawn: full health, fresh route, assigned site. */
export function resetBots(bots, spawns) {
  bots.bots.forEach((bot) => {
    const spawn = spawns[bot.team][bot.slot];
    bot.mover.pos.x = spawn[0];
    bot.mover.pos.y = 0;
    bot.mover.pos.z = spawn[1];
    bot.mover.vel.x = 0;
    bot.mover.vel.y = 0;
    bot.mover.vel.z = 0;
    bot.mover.yaw = spawn[2];
    bot.yaw = spawn[2];
    bot.health = 100;
    bot.alive = true;
    bot.state = bot.team === 'def' ? 'hold' : 'push';
    bot.route = [];
    bot.target = null;
    bot.lastSeen = null;
    bot.burstLeft = 0;
    bot.fell = false;
    bot.arsenal = createArsenal(['vk47', 'p9'], 'vk47');
    bot.model.group.rotation.set(0, bot.yaw, 0);
    bot.model.group.position.set(spawn[0], 0, spawn[1]);
    bot.model.group.visible = true;
    // Defenders hold near their site; one patrols mid.
    if (bot.team === 'def') {
      bot.holdWp = bot.site === 'A' ? 28 : bot.site === 'B' ? 29 : 30;
      bot.patrolWp = bot.site === 'A' ? 4 : bot.site === 'B' ? 20 : 14;
      bot.holdUntil = 0;
    }
  });
}

export function aliveCount(bots, team) {
  return bots.bots.filter((b) => b.alive && b.team === team).length;
}

/** Can `bot` see `char` (a char record with pos/crouch/alive/team)? */
function canSee(bot, char, smokes) {
  if (!char.alive) return false;
  const eye = eyeHeight(bot.mover);
  const dx = char.pos.x - bot.mover.pos.x;
  const dz = char.pos.z - bot.mover.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist > VISION_RANGE) return false;
  const want = Math.atan2(-dx, -dz);
  if (Math.abs(angleDiff(bot.yaw, want)) > VISION_HALF_ANGLE) return false;
  if (losBlocked(bot.mover.pos.x, bot.mover.pos.z, char.pos.x, char.pos.z)) return false;
  const chestY = char.pos.y + (char.crouch ? 0.7 : 1.2);
  if (segmentThroughSmoke(bot.mover.pos.x, bot.mover.pos.y + eye, bot.mover.pos.z, char.pos.x, chestY, char.pos.z, smokes)) return false;
  return true;
}

/** Nearest visible enemy for a bot, or null. */
function nearestVisibleEnemy(bot, chars, smokes) {
  let best = null;
  let bestD = Infinity;
  for (const char of chars) {
    if (char.team === bot.team || !char.alive) continue;
    if (!canSee(bot, char, smokes)) continue;
    const d = dist2D(bot.mover.pos.x, bot.mover.pos.z, char.pos.x, char.pos.z);
    if (d < bestD) {
      bestD = d;
      best = char;
    }
  }
  return best;
}

/** Walk a bot along its route (BFS waypoints); true when the route is done. */
function followRoute(bot, dt) {
  if (bot.route.length === 0) return true;
  const wp = WAYPOINTS[bot.route[0]];
  const dx = wp.x - bot.mover.pos.x;
  const dz = wp.z - bot.mover.pos.z;
  const dist = Math.sqrt(dx * dx + dz * dz);
  if (dist < 0.7) {
    bot.route.shift();
    return bot.route.length === 0;
  }
  const want = Math.atan2(-dx, -dz);
  bot.yaw = turnToward(bot.yaw, want, dt * 5);
  bot.mover.yaw = bot.yaw;
  stepMover(bot.mover, { fwd: 1, strafe: 0, jump: false, crouch: false }, dt);
  return false;
}

/** (Re)route a bot to a waypoint index. */
function routeTo(bot, wpIndex) {
  const from = nearestWaypoint(bot.mover.pos.x, bot.mover.pos.z);
  const route = bfsRoute(from, wpIndex);
  bot.route = route.length > 0 && route[0] === from ? route.slice(1) : route;
}

/** The bot's decision tick: pick a state and a route. Runs every 0.12 s. */
function think(bot, ctx) {
  const { now, chars, smokes, bomb, phase } = ctx;
  if (phase !== 'live' && phase !== 'planted') {
    bot.state = 'hold';
    bot.target = null;
    return;
  }
  // A defender standing on the planted bomb defuses first, even under fire.
  if (bomb.planted && bot.team === 'def' && bomb.pos) {
    const d = dist2D(bot.mover.pos.x, bot.mover.pos.z, bomb.pos.x, bomb.pos.z);
    if (d < 2.6) {
      bot.state = 'defuse';
      bot.route = [];
      bot.target = null;
      return;
    }
  }
  const enemy = nearestVisibleEnemy(bot, chars, smokes);
  if (enemy) {
    if (bot.target !== enemy) bot.reactAt = now + ctx.rng.range(0.35, 0.6);
    bot.target = enemy;
    bot.lastSeen = { x: enemy.pos.x, z: enemy.pos.z, at: now };
    bot.state = 'engage';
    bot.route = [];
    return;
  }
  // Lost sight: keep hunting the last seen spot briefly.
  if (bot.state === 'engage' && bot.lastSeen && now - bot.lastSeen.at < 2) {
    bot.state = 'hunt';
    routeTo(bot, nearestWaypoint(bot.lastSeen.x, bot.lastSeen.z));
    return;
  }
  bot.target = null;
  // A fresh noise pulls bots toward it.
  for (let i = ctx.noises.length - 1; i >= 0; i--) {
    const noise = ctx.noises[i];
    if (now - noise.at > 1.5) continue;
    const d = dist2D(bot.mover.pos.x, bot.mover.pos.z, noise.x, noise.z);
    if (d < noise.radius) {
      bot.state = 'hunt';
      routeTo(bot, nearestWaypoint(noise.x, noise.z));
      return;
    }
  }
  if (bomb.planted) {
    if (bot.team === 'def') {
      const siteWp = bomb.site === 'A' ? 4 : 20;
      // bomb.pos is set by plantBy; guard anyway so a missing pos never freezes the sim.
      const d = bomb.pos ? dist2D(bot.mover.pos.x, bot.mover.pos.z, bomb.pos.x, bomb.pos.z) : Infinity;
      if (d < 2.6) {
        bot.state = 'defuse';
        bot.route = [];
      } else {
        bot.state = 'converge';
        routeTo(bot, siteWp);
      }
    } else {
      // Attackers guard the planted bomb.
      const siteWp = bomb.site === 'A' ? 4 : 20;
      if (bot.route.length === 0) {
        bot.state = 'hold';
        routeTo(bot, siteWp);
      }
    }
    return;
  }
  if (bot.team === 'atk') {
    if (ctx.bombCarrier === bot) {
      const site = SITES[bot.site];
      const inside = bot.mover.pos.x >= site.x0 && bot.mover.pos.x <= site.x1 && bot.mover.pos.z >= site.z0 && bot.mover.pos.z <= site.z1;
      if (inside) {
        bot.state = 'plant';
        bot.route = [];
      } else {
        bot.state = 'push';
        routeTo(bot, bot.site === 'A' ? 4 : 20);
      }
      return;
    }
    bot.state = 'push';
    if (bot.route.length === 0) routeTo(bot, bot.site === 'A' ? 4 : 20);
    return;
  }
  // Defenders: hold, then patrol between two waypoints.
  if (bot.state === 'hold' && now >= bot.holdUntil) {
    bot.state = 'patrol';
    routeTo(bot, bot.patrolWp);
  } else if (bot.state === 'patrol' && bot.route.length === 0) {
    bot.state = 'hold';
    bot.holdUntil = now + ctx.rng.range(3, 7);
    const tmp = bot.holdWp;
    bot.holdWp = bot.patrolWp;
    bot.patrolWp = tmp;
  } else if (bot.state !== 'patrol' && bot.state !== 'hold') {
    bot.state = 'hold';
    bot.holdUntil = now + ctx.rng.range(2, 5);
  }
}

/** One bot's shooting while engaging: bursts with distance-based error. */
function shootAt(bot, ctx) {
  const target = bot.target;
  if (!target || !target.alive) return;
  if (ctx.now < bot.reactAt || ctx.now < bot.burstPauseUntil) return;
  const eye = eyeHeight(bot.mover);
  const origin = { x: bot.mover.pos.x, y: bot.mover.pos.y + eye, z: bot.mover.pos.z };
  const chestY = target.pos.y + (target.crouch ? 0.7 : 1.2);
  const dx = target.pos.x - origin.x;
  const dy = chestY - origin.y;
  const dz = target.pos.z - origin.z;
  const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (dist > WEAPONS.vk47.range) return;
  if (bot.burstLeft <= 0) {
    bot.burstLeft = ctx.rng.int(3, 4);
    bot.burstPauseUntil = 0;
  }
  const errDeg = 2.0 + dist * 0.12 + (bot.mover.vel.x !== 0 || bot.mover.vel.z !== 0 ? 0.6 : 0);
  const err = (errDeg * Math.PI) / 180;
  const aim = {
    x: dx / dist + (ctx.rng.next() - 0.5) * 2 * err,
    y: dy / dist + (ctx.rng.next() - 0.5) * 2 * err,
    z: dz / dist + (ctx.rng.next() - 0.5) * 2 * err,
  };
  const len = Math.sqrt(aim.x * aim.x + aim.y * aim.y + aim.z * aim.z) || 1;
  aim.x /= len;
  aim.y /= len;
  aim.z /= len;
  const result = fireWeapon(bot.arsenal, {
    now: ctx.now,
    rng: ctx.rng,
    origin,
    dir: aim,
    speed01: 0.4,
    airborne: false,
    scoped: false,
    team: bot.team,
    targets: ctx.chars,
    dmgScale: 0.45,
    onHit: (char, dmg, part, point) => ctx.onDamage(char, dmg, bot, part),
  });
  if (result.fired) {
    bot.burstLeft -= 1;
    const end = result.hits[0] ? result.hits[0].point : { x: origin.x + aim.x * 30, y: origin.y + aim.y * 30, z: origin.z + aim.z * 30 };
    ctx.tracers.spawn(origin, end);
    ctx.onShot(bot, dist);
    if (bot.burstLeft <= 0) bot.burstPauseUntil = ctx.now + ctx.rng.range(0.8, 1.3);
    if (bot.arsenal.slots[bot.arsenal.current].mag === 0) startReload(bot.arsenal, ctx.now);
  } else if (result.dry) {
    startReload(bot.arsenal, ctx.now);
  }
}

/** Step every bot one frame. */
export function stepBots(bots, dt, ctx) {
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    updateArsenal(bot.arsenal, ctx.now, dt);
    if (ctx.now >= bot.thinkAt) {
      bot.thinkAt = ctx.now + 0.12;
      think(bot, ctx);
    }
    const moving = bot.state === 'push' || bot.state === 'patrol' || bot.state === 'hunt' || bot.state === 'converge';
    if (moving) {
      followRoute(bot, dt);
    } else if (bot.state === 'engage' && bot.target) {
      // Face the target, strafe sideways, close or open the distance.
      const dx = bot.target.pos.x - bot.mover.pos.x;
      const dz = bot.target.pos.z - bot.mover.pos.z;
      const dist = Math.sqrt(dx * dx + dz * dz) || 1;
      bot.yaw = turnToward(bot.yaw, Math.atan2(-dx, -dz), dt * 6);
      bot.mover.yaw = bot.yaw;
      if (ctx.now >= bot.strafeUntil) {
        bot.strafeDir = ctx.rng.chance(0.5) ? 1 : -1;
        bot.strafeUntil = ctx.now + ctx.rng.range(0.7, 1.4);
      }
      const fwd = dist > 14 ? 0.5 : dist < 5 ? -0.5 : 0;
      stepMover(bot.mover, { fwd, strafe: bot.strafeDir * 0.7, jump: false, crouch: false }, dt);
      shootAt(bot, ctx);
    } else if (bot.state === 'hold') {
      // Slow scan: drift the yaw back and forth.
      bot.yaw += Math.sin(ctx.now * 0.5 + bot.walkPhase) * dt * 0.35;
      bot.mover.yaw = bot.yaw;
    } else if (bot.state === 'defuse') {
      const done = ctx.matchApi.defuseBy(bot, dt);
      if (done === 'defused') ctx.matchApi.onDefused(bot);
    } else if (bot.state === 'plant') {
      const done = ctx.matchApi.plantBy(bot, dt);
      if (done === 'planted') ctx.matchApi.onPlanted(bot);
    }
    // Sync the model to the sim.
    bot.model.group.position.set(bot.mover.pos.x, bot.mover.pos.y, bot.mover.pos.z);
    bot.model.group.rotation.y = bot.yaw;
    const speed = Math.sqrt(bot.mover.vel.x * bot.mover.vel.x + bot.mover.vel.z * bot.mover.vel.z);
    if (speed > 0.4) {
      bot.walkPhase += dt * speed * 2.4;
      const swing = Math.sin(bot.walkPhase) * 0.45;
      bot.model.legL.rotation.x = swing;
      bot.model.legR.rotation.x = -swing;
    } else {
      bot.model.legL.rotation.x = 0;
      bot.model.legR.rotation.x = 0;
    }
  }
}

/** Kill a bot: fall over, stop shooting, tell the match. */
export function killBot(bot, killerName) {
  bot.alive = false;
  bot.health = 0;
  bot.target = null;
  bot.route = [];
  bot.fell = true;
  bot.model.group.rotation.set(-Math.PI / 2, bot.yaw, 0);
  bot.model.group.position.y = 0.25;
  return killerName;
}
