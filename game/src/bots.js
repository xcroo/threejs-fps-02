// Bot AI: one state machine for both teams. A bot holds a post, patrols a route,
// hunts a sound, or converges on a planted bomb; it sees through a vision cone with
// a line-of-sight ray, hears shots, and shoots back in bursts with distance-based
// error. Movement rides the shared mover, routes are breadth-first searches over the
// map's waypoint graph, and every vector a bot needs is pre-allocated.
//
// Rewritten in session for the threejs-fps-02 entry (transcript coverage).
// Revised once after the first write: the rewrite note now names the right entry.
import * as THREE from 'three';
import { MAP } from './mapdata.js';
import { PALETTE } from './palette.js';
import { createMover } from './physics.js';
import { WEAPONS } from './weapons.js';
import { chance, pick, range, shuffled } from './rng.js';

const EYE_HEIGHT = 1.55;
const WALK_SPEED = 3.4;
const CROUCH_SPEED = 1.8;
const VISION_RANGE = 18;
const VISION_HALF_FOV = 0.96; // ~110 degrees total
const HEAR_RANGE = 22;
const BOT_WEAPON = 'rifle';
const CALLSIGNS = {
  atk: ['Juno', 'Pike', 'Wren'],
  def: ['Vex', 'Rook', 'Havoc', 'Sable', 'Nomad'],
};

// Breadth-first search over the waypoint graph; returns node indices from start to
// goal, or an empty list when already there or unreachable.
export function findRoute(start, goal, adjacency) {
  if (start === goal) return [];
  const previous = new Array(MAP.waypoints.length).fill(-1);
  const queue = [start];
  previous[start] = start;
  while (queue.length > 0) {
    const node = queue.shift();
    for (const next of adjacency[node]) {
      if (previous[next] !== -1) continue;
      previous[next] = node;
      if (next === goal) {
        const route = [goal];
        let at = goal;
        while (at !== start) {
          at = previous[at];
          route.unshift(at);
        }
        return route.slice(1);
      }
      queue.push(next);
    }
  }
  return [];
}

export function nearestWaypoint(x, z) {
  let best = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < MAP.waypoints.length; i += 1) {
    const [wx, wz] = MAP.waypoints[i];
    const d = (wx - x) * (wx - x) + (wz - z) * (wz - z);
    if (d < bestDistance) {
      bestDistance = d;
      best = i;
    }
  }
  return best;
}

export function createBots(scene, world, combat, random) {
  const adjacency = MAP.waypoints.map(() => []);
  for (const [a, b] of MAP.edges) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  const raycaster = new THREE.Raycaster();
  raycaster.far = VISION_RANGE;
  const eye = new THREE.Vector3();
  const target = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const forward = new THREE.Vector3();
  const toTarget = new THREE.Vector3();

  const bodyGeometry = new THREE.BoxGeometry(0.52, 0.78, 0.3);
  const headGeometry = new THREE.SphereGeometry(0.155, 12, 10);
  const legGeometry = new THREE.BoxGeometry(0.2, 0.7, 0.2);
  const gunGeometry = new THREE.BoxGeometry(0.07, 0.09, 0.5);
  const teamMaterial = {
    atk: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ally), roughness: 0.6, metalness: 0.05 }),
    def: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.danger), roughness: 0.6, metalness: 0.05 }),
  };
  const headMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.45, metalness: 0.1 });
  const darkMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.85 });

  const bots = [];
  let nextId = 0;

  function buildModel(team) {
    const group = new THREE.Group();
    const torso = new THREE.Mesh(bodyGeometry, teamMaterial[team]);
    torso.position.y = 1.0;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.53;
    head.userData.part = 'head';
    const legL = new THREE.Mesh(legGeometry, darkMaterial);
    legL.position.set(-0.14, 0.35, 0);
    const legR = new THREE.Mesh(legGeometry, darkMaterial);
    legR.position.set(0.14, 0.35, 0);
    const gun = new THREE.Mesh(gunGeometry, darkMaterial);
    gun.position.set(0.2, 1.15, -0.3);
    group.add(torso, head, legL, legR, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    return { group, torso, head };
  }

  function spawn(team, x, z) {
    const id = nextId;
    nextId += 1;
    const mover = createMover(world.colliders, x, z);
    const model = buildModel(team);
    model.group.position.set(x, 0, z);
    scene.add(model.group);
    const bot = {
      id,
      team,
      name: CALLSIGNS[team][id % CALLSIGNS[team].length],
      mover,
      model,
      health: 100,
      alive: true,
      yaw: 0,
      state: 'hold',
      route: [],
      routeIndex: 0,
      holdNode: nearestWaypoint(x, z),
      patrol: [],
      patrolIndex: 0,
      scanAngle: 0,
      target: null,
      lastSeen: null,
      lastSeenAt: -99,
      investigate: null,
      investigateAt: -99,
      burstLeft: 0,
      burstPause: 0,
      cooldown: 0,
      holdTimer: range(random, 2, 5),
      visionTimer: Math.random() * 0.15,
      crouching: false,
      defuseLeft: 0,
      fall: 0,
    };
    model.torso.userData.fighter = bot;
    model.head.userData.fighter = bot;
    bots.push(bot);
    return bot;
  }

  function setRoute(bot, goalNode) {
    const from = nearestWaypoint(bot.mover.position.x, bot.mover.position.z);
    bot.route = findRoute(from, goalNode, adjacency);
    bot.routeIndex = 0;
  }

  function canSee(bot, enemy, time) {
    eye.set(bot.mover.position.x, EYE_HEIGHT, bot.mover.position.z);
    target.set(enemy.mover.position.x, enemy.mover.position.y + 1.2, enemy.mover.position.z);
    toTarget.copy(target).sub(eye);
    const distance = toTarget.length();
    if (distance > VISION_RANGE) return false;
    forward.set(-Math.sin(bot.yaw), 0, -Math.cos(bot.yaw));
    toTarget.normalize();
    if (forward.dot(toTarget) < Math.cos(VISION_HALF_FOV)) return false;
    if (combat.smokeBlocks(eye, target)) return false;
    direction.copy(toTarget);
    raycaster.set(eye, direction);
    const hits = raycaster.intersectObjects(world.shootables, false);
    if (hits.length > 0 && hits[0].distance < distance - 0.3) return false;
    return true;
  }

  function shootAt(bot, enemy, dt, time, onShoot) {
    if (bot.cooldown > 0) {
      bot.cooldown -= dt;
      return;
    }
    if (bot.burstLeft <= 0) {
      if (bot.burstPause > 0) {
        bot.burstPause -= dt;
        return;
      }
      bot.burstLeft = 3 + Math.floor(random() * 3);
      bot.burstPause = range(random, 0.5, 1.2);
    }
    bot.burstLeft -= 1;
    bot.cooldown = 0.13;
    // Aim error grows with distance and with the bot's own movement.
    const distance = bot.mover.position.distanceTo(enemy.mover.position);
    const moving = Math.hypot(bot.mover.velocity.x, bot.mover.velocity.z);
    const error = 0.012 + distance * 0.0016 + Math.min(1, moving / 5) * 0.02;
    eye.set(bot.mover.position.x, EYE_HEIGHT, bot.mover.position.z);
    target.set(enemy.mover.position.x, enemy.mover.position.y + range(random, 0.9, 1.45), enemy.mover.position.z);
    direction.copy(target).sub(eye).normalize();
    direction.x += (random() * 2 - 1) * error;
    direction.y += (random() * 2 - 1) * error;
    direction.z += (random() * 2 - 1) * error;
    direction.normalize();
    onShoot(bot, eye, direction, WEAPONS[BOT_WEAPON], BOT_WEAPON);
  }

  function stepBot(bot, dt, time, context) {
    if (!bot.alive) {
      bot.fall = Math.min(1, bot.fall + dt / 0.4);
      bot.model.group.rotation.x = -bot.fall * 1.45;
      return;
    }
    bot.visionTimer -= dt;
    if (bot.visionTimer <= 0) {
      bot.visionTimer = 0.15;
      bot.target = null;
      for (const enemy of context.enemiesOf(bot)) {
        if (!enemy.alive) continue;
        if (canSee(bot, enemy, time)) {
          bot.target = enemy;
          bot.lastSeen = { x: enemy.mover.position.x, z: enemy.mover.position.z };
          bot.lastSeenAt = time;
          break;
        }
      }
      // A target seen recently but out of view now is still hunted for a while.
      if (!bot.target && bot.lastSeen && time - bot.lastSeenAt < 4) {
        bot.investigate = bot.lastSeen;
        bot.investigateAt = time;
      }
    }

    const bomb = context.bomb;
    let goalNode = null;
    let wantCrouch = false;
    if (bomb.planted && bot.team === 'def') {
      // Defenders converge on the planted bomb and defuse it.
      goalNode = nearestWaypoint(bomb.position.x, bomb.position.z);
      const distance = Math.hypot(bot.mover.position.x - bomb.position.x, bot.mover.position.z - bomb.position.z);
      if (distance < 1.6) {
        bot.defuseLeft -= dt;
      } else {
        bot.defuseLeft = 5;
      }
      if (bot.defuseLeft <= 0) context.onDefused(bot);
    } else if (bomb.planted && bot.team === 'atk') {
      goalNode = nearestWaypoint(bomb.position.x, bomb.position.z);
    } else if (bot.target) {
      goalNode = null;
    } else if (bot.investigate && time - bot.investigateAt < 6) {
      goalNode = nearestWaypoint(bot.investigate.x, bot.investigate.z);
      if (Math.hypot(bot.mover.position.x - bot.investigate.x, bot.mover.position.z - bot.investigate.z) < 1.2) {
        bot.investigate = null;
      }
    } else if (bot.state === 'patrol' && bot.patrol.length > 0) {
      goalNode = bot.patrol[bot.patrolIndex % bot.patrol.length];
      const [gx, gz] = MAP.waypoints[goalNode];
      if (Math.hypot(bot.mover.position.x - gx, bot.mover.position.z - gz) < 1.0) {
        bot.patrolIndex += 1;
        bot.state = 'hold';
        bot.holdTimer = range(random, 1.5, 4);
      }
    } else {
      bot.holdTimer = (bot.holdTimer ?? 0) - dt;
      if (bot.holdTimer <= 0) {
        bot.state = 'patrol';
        bot.patrolIndex += 1;
      }
    }

    // Face the target while engaging; otherwise face the direction of travel, or
    // slowly scan while holding.
    if (bot.target) {
      const dx = bot.target.mover.position.x - bot.mover.position.x;
      const dz = bot.target.mover.position.z - bot.mover.position.z;
      bot.yaw = Math.atan2(-dx, -dz);
      wantCrouch = chance(random, 0.3);
    } else if (goalNode !== null) {
      const [gx, gz] = MAP.waypoints[goalNode];
      const dx = gx - bot.mover.position.x;
      const dz = gz - bot.mover.position.z;
      if (Math.hypot(dx, dz) > 0.4) bot.yaw = Math.atan2(-dx, -dz);
    } else {
      bot.scanAngle += dt * 0.7;
      bot.yaw += Math.sin(bot.scanAngle) * dt * 0.4;
    }

    // Walk the route one node at a time.
    if (goalNode !== null && !bot.target) {
      if (bot.route.length === 0 || bot.route[bot.route.length - 1] !== goalNode) setRoute(bot, goalNode);
      const node = bot.route[bot.routeIndex];
      if (node !== undefined) {
        const [gx, gz] = MAP.waypoints[node];
        const dx = gx - bot.mover.position.x;
        const dz = gz - bot.mover.position.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.9) {
          bot.routeIndex += 1;
        } else {
          const speed = wantCrouch ? CROUCH_SPEED : WALK_SPEED;
          bot.mover.velocity.x = (dx / distance) * speed;
          bot.mover.velocity.z = (dz / distance) * speed;
        }
      }
    }
    if (bot.target) {
      // Strafe a little while firing so the bot is not a statue.
      const strafe = Math.sin(time * 1.3 + bot.id * 2.1) * 1.2;
      bot.mover.velocity.x = Math.cos(bot.yaw) * strafe;
      bot.mover.velocity.z = -Math.sin(bot.yaw) * strafe;
    } else if (goalNode === null) {
      bot.mover.velocity.x *= Math.max(0, 1 - 9 * dt);
      bot.mover.velocity.z *= Math.max(0, 1 - 9 * dt);
    }

    bot.mover.velocity.y -= 20 * dt;
    bot.mover.move(bot.mover.velocity.x * dt, bot.mover.velocity.z * dt, bot.mover.velocity.y * dt);
    bot.model.group.position.set(bot.mover.position.x, bot.mover.position.y, bot.mover.position.z);
    bot.model.group.rotation.y = bot.yaw;

    if (bot.target) shootAt(bot, bot.target, dt, time, context.onShoot);
  }

  function hearShot(position, team, time) {
    for (const bot of bots) {
      if (!bot.alive || bot.team === team) continue;
      const distance = Math.hypot(bot.mover.position.x - position.x, bot.mover.position.z - position.z);
      if (distance < HEAR_RANGE) {
        bot.investigate = { x: position.x, z: position.z };
        bot.investigateAt = time;
      }
    }
  }

  return {
    bots,
    spawn,
    step(dt, time, context) {
      for (const bot of bots) stepBot(bot, dt, time, context);
    },
    hearShot,
    aliveCount(team) {
      return bots.filter((bot) => bot.team === team && bot.alive).length;
    },
    hitMeshes() {
      const meshes = [];
      for (const bot of bots) {
        if (!bot.alive) continue;
        meshes.push(bot.model.torso, bot.model.head);
      }
      return meshes;
    },
    damage(bot, amount) {
      if (!bot.alive) return false;
      bot.health -= amount;
      if (bot.health > 0) return false;
      bot.health = 0;
      bot.alive = false;
      bot.fall = 0;
      return true;
    },
    reset() {
      for (const bot of bots) {
        bot.health = 100;
        bot.alive = true;
        bot.fall = 0;
        bot.target = null;
        bot.lastSeen = null;
        bot.investigate = null;
        bot.route = [];
        bot.routeIndex = 0;
        bot.defuseLeft = 5;
        bot.model.group.rotation.x = 0;
      }
    },
    remove() {
      for (const bot of bots) scene.remove(bot.model.group);
      bots.length = 0;
      nextId = 0;
    },
  };
}
