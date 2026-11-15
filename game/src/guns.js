// RAILHEAD — guns.js: weapons, hitscan, tracers, grenades, view model.
//
// One code path serves the player and the bots: an arsenal is a set of owned
// weapons with magazine/reserve counts, a fire timer and a reload timer.
// fireWeapon() takes an origin and a direction, applies spread, and resolves
// the shot against the world (yard colliders) and every character on the
// list. Damage is handed to the caller's onHit callback; same-team hits deal
// no damage but still stop the bullet.
//
// Spread is a random cone around the aim direction: base spread, plus a
// penalty for moving and for the air, plus bloom that grows while firing.
// Headshots deal 3x body damage on the player's weapons and the bots' too.

import { worldHit, pointBlocked } from './yard.js';
import { rayCharacter } from './math3.js';

/** The armoury. Prices are the economy's, names are the yard's own. */
export const WEAPONS = {
  p9: {
    id: 'p9', name: 'Kestrel P9', kind: 'pistol', price: 0,
    damage: 34, headMult: 3, mag: 12, reserve: 48,
    interval: 0.28, auto: false, spread: 0.9, moveSpread: 1.2,
    reload: 1.4, kick: 0.9, range: 60, pellets: 1, scope: false,
  },
  vk47: {
    id: 'vk47', name: 'VK-47', kind: 'rifle', price: 2700,
    damage: 33, headMult: 3, mag: 30, reserve: 90,
    interval: 0.1, auto: true, spread: 1.1, moveSpread: 1.8,
    reload: 2.2, kick: 1.1, range: 80, pellets: 1, scope: false,
  },
  hornet: {
    id: 'hornet', name: 'Hornet-9', kind: 'smg', price: 1500,
    damage: 26, headMult: 3, mag: 32, reserve: 96,
    interval: 0.07, auto: true, spread: 1.4, moveSpread: 1.5,
    reload: 1.9, kick: 0.7, range: 50, pellets: 1, scope: false,
  },
  longbow: {
    id: 'longbow', name: 'Longbow .50', kind: 'sniper', price: 4750,
    damage: 95, headMult: 3, mag: 5, reserve: 15,
    interval: 1.2, auto: false, spread: 0.15, moveSpread: 3.0,
    reload: 3.0, kick: 3.5, range: 120, pellets: 1, scope: true,
    scopedSpread: 0.15, unscopedSpread: 6.0,
  },
  breacher: {
    id: 'breacher', name: 'Breacher-12', kind: 'shotgun', price: 1700,
    damage: 12, headMult: 3, mag: 6, reserve: 24,
    interval: 0.8, auto: false, spread: 4.0, moveSpread: 2.0,
    reload: 2.6, kick: 2.2, range: 30, pellets: 8, scope: false,
  },
};

export const GRENADE_PRICE = { he: 300, smoke: 400 };
export const BUY_ORDER = ['vk47', 'hornet', 'breacher', 'longbow', 'p9'];

/** A fresh arsenal owning `weaponIds`, with `currentId` selected. */
export function createArsenal(weaponIds, currentId) {
  const slots = {};
  for (const id of weaponIds) {
    const def = WEAPONS[id];
    slots[id] = { mag: def.mag, reserve: def.reserve };
  }
  return {
    slots,
    order: weaponIds.slice(),
    current: currentId,
    he: 0,
    smoke: 0,
    nextShotAt: 0,
    reloadUntil: 0,
    reloading: null,
    bloom: 0,
  };
}

export function currentDef(arsenal) {
  return WEAPONS[arsenal.current];
}

export function currentSlot(arsenal) {
  return arsenal.slots[arsenal.current];
}

/** Add a weapon to the arsenal (bought). False when already owned. */
export function buyWeapon(arsenal, id) {
  if (arsenal.slots[id]) return false;
  const def = WEAPONS[id];
  arsenal.slots[id] = { mag: def.mag, reserve: def.reserve };
  arsenal.order.push(id);
  return true;
}

/** Select an owned weapon. False when not owned. */
export function selectWeapon(arsenal, id) {
  if (!arsenal.slots[id]) return false;
  if (arsenal.current === id) return true;
  arsenal.current = id;
  arsenal.reloadUntil = 0;
  arsenal.reloading = null;
  return true;
}

/** Begin a reload. False when the magazine is full or the reserve is dry. */
export function startReload(arsenal, now) {
  const def = currentDef(arsenal);
  const slot = currentSlot(arsenal);
  if (arsenal.reloading || slot.mag >= def.mag || slot.reserve <= 0) return false;
  arsenal.reloading = arsenal.current;
  arsenal.reloadUntil = now + def.reload;
  return true;
}

/** Per-frame upkeep: bloom decay and reload completion. */
export function updateArsenal(arsenal, now, dt) {
  arsenal.bloom = Math.max(0, arsenal.bloom - dt * 2.2);
  if (arsenal.reloading && now >= arsenal.reloadUntil) {
    const def = WEAPONS[arsenal.reloading];
    const slot = arsenal.slots[arsenal.reloading];
    const need = def.mag - slot.mag;
    const take = Math.min(need, slot.reserve);
    slot.mag += take;
    slot.reserve -= take;
    arsenal.reloading = null;
  }
}

export function isReloading(arsenal) {
  return arsenal.reloading !== null;
}

// ---------------------------------------------------------------- shooting

/** A roughly-normal random in [-1, 1] from three uniform draws. */
function randn(rng) {
  return (rng.next() + rng.next() + rng.next() - 1.5) / 1.5;
}

/** Perturb a unit direction by `spreadRad` radians in a random direction. */
function spreadDir(dir, spreadRad, rng) {
  const up = Math.abs(dir.y) > 0.9 ? { x: 1, y: 0, z: 0 } : { x: 0, y: 1, z: 0 };
  // right = dir x up, up2 = right x dir.
  let rx = dir.y * up.z - dir.z * up.y;
  let ry = dir.z * up.x - dir.x * up.z;
  let rz = dir.x * up.y - dir.y * up.x;
  const rl = Math.sqrt(rx * rx + ry * ry + rz * rz) || 1;
  rx /= rl;
  ry /= rl;
  rz /= rl;
  let ux = ry * dir.z - rz * dir.y;
  let uy = rz * dir.x - rx * dir.z;
  let uz = rx * dir.y - ry * dir.x;
  const a = randn(rng) * spreadRad;
  const b = randn(rng) * spreadRad;
  let x = dir.x + rx * a + ux * b;
  let y = dir.y + ry * a + uy * b;
  let z = dir.z + rz * a + uz * b;
  const len = Math.sqrt(x * x + y * y + z * z) || 1;
  return { x: x / len, y: y / len, z: z / len };
}

/**
 * Resolve one shot against the world and a list of characters.
 * `targets` are { pos, crouch, alive, team, ref } hit records; `shooterTeam`
 * is the team firing. Returns { point, char, part, t } or null.
 * The nearest thing wins; a teammate stops the bullet but takes no damage.
 */
export function resolveShot(origin, dir, maxDist, targets, shooterTeam) {
  const wall = worldHit(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist);
  let bestT = wall ? wall.t : maxDist;
  let best = wall ? { point: null, char: null, part: 'wall', t: wall.t } : null;
  for (const target of targets) {
    if (!target.alive) continue;
    const hit = rayCharacter(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, target.pos, target.crouch);
    if (hit && hit.t < bestT) {
      bestT = hit.t;
      best = { point: null, char: target, part: hit.part, t: hit.t };
    }
  }
  if (!best) return null;
  best.point = {
    x: origin.x + dir.x * best.t,
    y: origin.y + dir.y * best.t,
    z: origin.z + dir.z * best.t,
  };
  return best;
}

/**
 * Fire the arsenal's current weapon. `opts`:
 *   now, rng, origin {x,y,z}, dir (unit), speed01 (movement 0..1),
 *   airborne, scoped, targets, onHit(target, damage, part, point).
 * Returns { fired, dry, hits } — hits are the resolveShot results.
 */
export function fireWeapon(arsenal, opts) {
  const def = currentDef(arsenal);
  const slot = currentSlot(arsenal);
  const now = opts.now;
  if (arsenal.reloading || now < arsenal.nextShotAt) return { fired: false, dry: false, hits: [] };
  if (slot.mag <= 0) return { fired: false, dry: true, hits: [] };

  slot.mag -= 1;
  arsenal.nextShotAt = now + def.interval;
  arsenal.bloom = Math.min(1.6, arsenal.bloom + (def.kind === 'rifle' ? 0.22 : 0.3));

  let baseSpread = def.spread;
  if (def.scope) baseSpread = opts.scoped ? def.scopedSpread : def.unscopedSpread;
  const spreadDeg = baseSpread + opts.speed01 * def.moveSpread + (opts.airborne ? 2.5 : 0) + arsenal.bloom;
  const spreadRad = (spreadDeg * Math.PI) / 180;

  const hits = [];
  for (let p = 0; p < def.pellets; p++) {
    const dir = spreadDir(opts.dir, spreadRad, opts.rng);
    const hit = resolveShot(opts.origin, dir, def.range, opts.targets, opts.team);
    if (hit) {
      hits.push(hit);
      if (hit.char && hit.char.team !== opts.team) {
        const dmg = def.damage * (hit.part === 'head' ? def.headMult : 1) * (opts.dmgScale ?? 1);
        opts.onHit(hit.char, dmg, hit.part, hit.point);
      }
    }
  }
  return { fired: true, dry: false, hits };
}

// ---------------------------------------------------------------- view model

/** Build the first-person gun out of boxes, parented to the camera. */
export function createViewmodel(THREE, camera) {
  const group = new THREE.Group();
  const dark = new THREE.MeshStandardMaterial({ color: 0x1e1e22, roughness: 0.55, metalness: 0.5 });
  const mid = new THREE.MeshStandardMaterial({ color: 0x3a3a40, roughness: 0.6, metalness: 0.4 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x5a4128, roughness: 0.85, metalness: 0.05 });
  const add = (w, h, d, x, y, z, material = dark) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    group.add(mesh);
    return mesh;
  };
  // Receiver, barrel, stock, grip, magazine, sight — a rifle silhouette.
  add(0.09, 0.11, 0.52, 0, 0, -0.1);
  add(0.05, 0.05, 0.42, 0, 0.02, -0.5, mid);
  add(0.08, 0.1, 0.24, 0, -0.01, 0.24, wood);
  add(0.07, 0.16, 0.09, 0, -0.12, 0.06);
  add(0.06, 0.14, 0.1, 0, -0.12, -0.12, mid);
  add(0.02, 0.05, 0.02, 0, 0.08, -0.28, mid);
  const tip = new THREE.Group();
  tip.position.set(0, 0.02, -0.72);
  group.add(tip);
  group.position.set(0.26, -0.24, -0.42);
  group.visible = true;
  camera.add(group);
  return { group, tip, kick: 0, bobPhase: 0 };
}

/** Per-frame view-model sway, bob and recoil recovery. */
export function updateViewmodel(vm, dt, moving, scoped, firing) {
  if (firing) vm.kick = Math.min(0.09, vm.kick + 0.05);
  vm.kick = Math.max(0, vm.kick - dt * 0.45);
  vm.bobPhase += dt * (moving ? 9 : 3);
  const bob = moving ? Math.sin(vm.bobPhase) * 0.006 : 0;
  const targetX = scoped ? 0 : 0.26;
  const targetY = scoped ? -0.19 : -0.24 + bob;
  vm.group.position.x += (targetX - vm.group.position.x) * Math.min(1, dt * 14);
  vm.group.position.y += (targetY - vm.group.position.y) * Math.min(1, dt * 14);
  vm.group.position.z = -0.42 + vm.kick;
  vm.group.visible = !scoped || vm.group.visible;
}

// ---------------------------------------------------------------- tracers

/** A small pool of fading tracer bolts. */
export function createTracers(THREE, scene) {
  const pool = [];
  const geo = new THREE.BoxGeometry(0.02, 0.02, 1);
  for (let i = 0; i < 14; i++) {
    const material = new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0 });
    const mesh = new THREE.Mesh(geo, material);
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, life: 0 });
  }
  let cursor = 0;
  return {
    spawn(from, to) {
      const slot = pool[cursor];
      cursor = (cursor + 1) % pool.length;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const dz = to.z - from.z;
      const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (len < 0.5) return;
      slot.mesh.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2);
      slot.mesh.lookAt(to.x, to.y, to.z);
      slot.mesh.scale.set(1, 1, len);
      slot.mesh.material.opacity = 0.9;
      slot.mesh.visible = true;
      slot.life = 0.09;
    },
    update(dt) {
      for (const slot of pool) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        slot.mesh.material.opacity = Math.max(0, slot.life / 0.09) * 0.9;
        if (slot.life <= 0) slot.mesh.visible = false;
      }
    },
  };
}

// ---------------------------------------------------------------- grenades

/** Thrown grenades: HE (blast) and smoke (vision-blocking cloud). */
export function createGrenades(THREE, scene) {
  const live = [];
  const smokes = [];
  const geo = new THREE.SphereGeometry(0.09, 10, 8);
  const matHE = new THREE.MeshStandardMaterial({ color: 0x3d5a34, roughness: 0.6, metalness: 0.3 });
  const matSmoke = new THREE.MeshStandardMaterial({ color: 0x8a8f94, roughness: 0.7, metalness: 0.2 });
  return {
    smokes,
    /** Remove every live grenade and smoke cloud (round reset). */
    clear() {
      for (const g of live) scene.remove(g.mesh);
      live.length = 0;
      smokes.length = 0;
    },
    throw(kind, from, dir, speed) {
      const mesh = new THREE.Mesh(geo, kind === 'he' ? matHE : matSmoke);
      mesh.position.set(from.x, from.y, from.z);
      scene.add(mesh);
      live.push({
        kind,
        mesh,
        pos: { x: from.x, y: from.y, z: from.z },
        vel: { x: dir.x * speed, y: dir.y * speed + 1.2, z: dir.z * speed },
        fuse: kind === 'he' ? 2.0 : 1.1,
        bounced: false,
      });
    },
    update(dt, ctx) {
      for (let i = live.length - 1; i >= 0; i--) {
        const g = live[i];
        g.vel.y -= 18 * dt;
        const nx = g.pos.x + g.vel.x * dt;
        const nz = g.pos.z + g.vel.z * dt;
        if (!pointBlocked(nx, g.pos.z)) g.pos.x = nx;
        else g.vel.x *= -0.4;
        if (!pointBlocked(g.pos.x, nz)) g.pos.z = nz;
        else g.vel.z *= -0.4;
        g.pos.y += g.vel.y * dt;
        if (g.pos.y <= 0.09) {
          g.pos.y = 0.09;
          if (Math.abs(g.vel.y) > 1.5) g.bounced = true;
          g.vel.y = Math.abs(g.vel.y) * 0.42;
          g.vel.x *= 0.7;
          g.vel.z *= 0.7;
        }
        g.mesh.position.set(g.pos.x, g.pos.y, g.pos.z);
        g.fuse -= dt;
        if (g.bounced && g.kind === 'he') g.fuse -= dt * 0.8;
        if (g.fuse <= 0) {
          live.splice(i, 1);
          scene.remove(g.mesh);
          if (g.kind === 'he') ctx.onExplode({ x: g.pos.x, y: Math.max(0.4, g.pos.y), z: g.pos.z });
          else {
            const cloud = { x: g.pos.x, y: 1.2, z: g.pos.z, r: 3.4, until: ctx.now + 18 };
            smokes.push(cloud);
            ctx.onSmoke(cloud);
          }
        }
      }
      // Expire old smoke.
      for (let i = smokes.length - 1; i >= 0; i--) {
        if (smokes[i].until <= ctx.now) {
          const gone = smokes.splice(i, 1)[0];
          ctx.onSmokeGone(gone);
        }
      }
    },
  };
}

/** The visible smoke puffs for a cloud (translucent spheres). */
export function createSmokeVisual(THREE, scene) {
  const visuals = new Map();
  const geo = new THREE.IcosahedronGeometry(1, 1);
  return {
    add(cloud, rng) {
      const group = new THREE.Group();
      const material = new THREE.MeshBasicMaterial({ color: 0x9aa0a3, transparent: true, opacity: 0.32, depthWrite: false });
      for (let i = 0; i < 6; i++) {
        const puff = new THREE.Mesh(geo, material);
        const a = rng.range(0, Math.PI * 2);
        const rr = rng.range(0, cloud.r * 0.55);
        puff.position.set(Math.cos(a) * rr, rng.range(-0.4, 1.4), Math.sin(a) * rr);
        puff.scale.setScalar(rng.range(0.9, 1.7));
        group.add(puff);
      }
      group.position.set(cloud.x, cloud.y, cloud.z);
      scene.add(group);
      visuals.set(cloud, group);
    },
    remove(cloud) {
      const group = visuals.get(cloud);
      if (group) {
        scene.remove(group);
        visuals.delete(cloud);
      }
    },
    clear() {
      for (const group of visuals.values()) scene.remove(group);
      visuals.clear();
    },
  };
}

/** Does the segment (ax,ay,az)-(bx,by,bz) pass through a smoke cloud? */
export function segmentThroughSmoke(ax, ay, az, bx, by, bz, smokes) {
  for (const s of smokes) {
    // Distance from the sphere centre to the segment.
    const abx = bx - ax;
    const aby = by - ay;
    const abz = bz - az;
    const len2 = abx * abx + aby * aby + abz * abz;
    const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((s.x - ax) * abx + (s.y - ay) * aby + (s.z - az) * abz) / len2));
    const dx = ax + abx * t - s.x;
    const dy = ay + aby * t - s.y;
    const dz = az + abz * t - s.z;
    if (dx * dx + dy * dy + dz * dz < s.r * s.r) return true;
  }
  return false;
}
