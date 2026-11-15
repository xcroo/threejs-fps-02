// The arsenal: every weapon's numbers, its view model, and the magazine, reload and
// spread that punish firing on the move. The module owns the numbers and the model;
// main.js owns the ray and the damage. Grenades are thrown here and simulated by
// combat.js, which gets their launch position and velocity.
//
// Rewritten in session for the threejs-fps-02 entry (transcript coverage).
// Revised once after the first write: the rewrite note now names the right entry.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// damage is [body, head]; fireGap is seconds between shots; spreadStill/Moving are
// radians of cone at rest and at full sprint; price is the buy-menu cost.
export const WEAPONS = {
  pistol: {
    name: 'P9 Sidearm', price: 0, mag: 12, reserve: 96, fireGap: 0.16, auto: false,
    reloadTime: 1.4, damage: [26, 78], spreadStill: 0.003, spreadMoving: 0.02, kick: 0.006,
  },
  rifle: {
    name: 'AR-77 Kestrel', price: 2700, mag: 25, reserve: 75, fireGap: 0.096, auto: true,
    reloadTime: 1.9, damage: [30, 120], spreadStill: 0.0022, spreadMoving: 0.028, kick: 0.009,
  },
  smg: {
    name: 'SMG-9 Wasp', price: 1500, mag: 30, reserve: 90, fireGap: 0.065, auto: true,
    reloadTime: 1.6, damage: [22, 66], spreadStill: 0.004, spreadMoving: 0.032, kick: 0.005,
  },
  sniper: {
    name: 'SR-50 Longbow', price: 4750, mag: 5, reserve: 15, fireGap: 1.15, auto: false,
    reloadTime: 2.6, damage: [80, 200], spreadStill: 0.0006, spreadMoving: 0.05, kick: 0.03,
  },
  shotgun: {
    name: 'SG-12 Breacher', price: 1700, mag: 6, reserve: 12, fireGap: 0.85, auto: false,
    reloadTime: 2.2, damage: [8, 24], pellets: 8, spreadStill: 0.02, spreadMoving: 0.04, kick: 0.02,
  },
};

export const GRENADES = {
  he: { name: 'HE-1 Frag', price: 300 },
  smoke: { name: 'SMK-2 Smoke', price: 400 },
};

const MUZZLE_TIME = 0.06;

function buildViewModel(kind) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const group = new THREE.Group();
  const dims = {
    pistol: { receiver: [0.07, 0.09, 0.24], barrel: [0.04, 0.04, 0.14], stock: null },
    rifle: { receiver: [0.09, 0.1, 0.42], barrel: [0.045, 0.045, 0.4], stock: [0.075, 0.08, 0.22] },
    smg: { receiver: [0.08, 0.09, 0.3], barrel: [0.04, 0.04, 0.22], stock: [0.07, 0.07, 0.16] },
    sniper: { receiver: [0.09, 0.11, 0.5], barrel: [0.04, 0.04, 0.55], stock: [0.08, 0.09, 0.26], scope: true },
    shotgun: { receiver: [0.09, 0.1, 0.44], barrel: [0.06, 0.06, 0.42], stock: [0.075, 0.08, 0.2] },
  }[kind];
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(...dims.receiver), body);
  group.add(receiver);
  const barrel = new THREE.Mesh(new THREE.BoxGeometry(...dims.barrel), grip);
  barrel.position.set(0, 0.025, -dims.receiver[2] / 2 - dims.barrel[2] / 2 + 0.06);
  group.add(barrel);
  if (dims.stock) {
    const stock = new THREE.Mesh(new THREE.BoxGeometry(...dims.stock), grip);
    stock.position.set(0, -0.02, dims.receiver[2] / 2 + dims.stock[2] / 2 - 0.06);
    group.add(stock);
  }
  if (dims.scope) {
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.16, 12), grip);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.08, -0.05);
    group.add(scope);
  }
  group.position.set(0.24, -0.2, -0.42);
  return group;
}

export function createArsenal(camera) {
  const models = {};
  for (const kind of Object.keys(WEAPONS)) {
    models[kind] = buildViewModel(kind);
    models[kind].visible = false;
    camera.add(models[kind]);
  }
  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const state = {
    current: 'pistol',
    owned: { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } },
    cooldown: 0,
    reloadLeft: 0,
    flash: 0,
    kick: 0,
    grenades: { he: 0, smoke: 0 },
  };
  models.pistol.visible = true;

  function def() {
    return WEAPONS[state.current];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    const model = models[state.current];
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reloadTime - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const ammo = state.owned[state.current];
        const need = def().mag - ammo.mag;
        const take = Math.min(need, ammo.reserve);
        ammo.mag += take;
        ammo.reserve -= take;
      }
    }
  }

  return {
    state,
    def,
    step,
    current() {
      return state.owned[state.current];
    },
    ready() {
      return state.owned[state.current].mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    takeRound() {
      const ammo = state.owned[state.current];
      if (ammo.mag <= 0) return false;
      ammo.mag -= 1;
      return true;
    },
    pullTrigger() {
      state.cooldown = def().fireGap;
      state.flash = MUZZLE_TIME;
      state.kick = 0.055;
    },
    reload() {
      const ammo = state.owned[state.current];
      if (state.reloadLeft > 0 || ammo.mag === def().mag || ammo.reserve === 0) return;
      state.reloadLeft = def().reloadTime;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.2) * d.spreadMoving;
    },
    kick() {
      return def().kick;
    },
    equip(kind) {
      if (!state.owned[kind] || state.reloadLeft > 0) return false;
      models[state.current].visible = false;
      state.current = kind;
      models[kind].visible = true;
      state.cooldown = Math.max(state.cooldown, 0.25);
      return true;
    },
    // Shot mode frames the game from a cinematic camera, so the first-person
    // view models would sit in the frame like a floating gun: hide them there.
    setViewVisible(visible) {
      for (const kind of Object.keys(models)) models[kind].visible = visible && kind === state.current;
      flash.visible = false;
    },
    buy(kind, money) {
      if (state.owned[kind]) return { ok: false, reason: 'owned' };
      const price = WEAPONS[kind].price;
      if (money < price) return { ok: false, reason: 'funds' };
      state.owned[kind] = { mag: WEAPONS[kind].mag, reserve: WEAPONS[kind].reserve };
      return { ok: true, price };
    },
    buyGrenade(kind, money) {
      const price = GRENADES[kind].price;
      if (money < price) return { ok: false, reason: 'funds' };
      state.grenades[kind] += 1;
      return { ok: true, price };
    },
    // Launch position and velocity for a thrown grenade; combat.js owns the flight.
    throwGrenade(kind, origin, direction) {
      if (state.grenades[kind] <= 0) return null;
      state.grenades[kind] -= 1;
      return {
        kind,
        position: origin.clone().addScaledVector(direction, 0.5),
        velocity: direction.clone().multiplyScalar(13).add(new THREE.Vector3(0, 4.5, 0)),
        fuse: kind === 'he' ? 1.4 : 1.1,
        age: 0,
      };
    },
    refillReserve() {
      for (const kind of Object.keys(state.owned)) {
        state.owned[kind].reserve = WEAPONS[kind].reserve;
      }
    },
    reset() {
      state.current = 'pistol';
      state.owned = { pistol: { mag: WEAPONS.pistol.mag, reserve: WEAPONS.pistol.reserve } };
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.grenades = { he: 0, smoke: 0 };
      for (const kind of Object.keys(models)) models[kind].visible = kind === 'pistol';
    },
  };
}
