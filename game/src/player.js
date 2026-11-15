// The player: acceleration, friction, gravity, crouch and jump on the shared mover,
// plus look and recoil. Movement punishes firing on the move through the weapon's
// spread, which reads the ground speed this module reports.
//
// Rewritten in session for the threejs-fps-02 entry (transcript coverage).
// Revised once after the first write: the rewrite note now names the right entry.
import * as THREE from 'three';
import { CROUCH_HEIGHT, GRAVITY, STAND_HEIGHT, createMover } from './physics.js';

const STAND_EYE = 1.6;
const CROUCH_EYE = 1.02;
const WALK_SPEED = 5.2;
const CROUCH_SPEED = 2.4;
const GROUND_ACCEL = 42;
const AIR_ACCEL = 9;
const FRICTION = 9;
const JUMP_SPEED = 6.2;

export function createPlayer(colliders) {
  const mover = createMover(colliders, 0, 12);
  const player = {
    yaw: 0,
    pitch: 0,
    eye: STAND_EYE,
    crouching: false,
    health: 100,
    alive: true,
  };
  const wish = new THREE.Vector3();

  function look(dx, dy, sensitivity = 0.0022) {
    player.yaw -= dx * sensitivity;
    player.pitch = Math.max(-1.45, Math.min(1.45, player.pitch - dy * sensitivity));
  }

  function recoil(pitchKick, yawKick) {
    player.pitch = Math.min(1.45, player.pitch + pitchKick);
    player.yaw += yawKick;
  }

  function step(dt, keys) {
    if (!player.alive) return;
    const crouching = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
    if (crouching && !player.crouching) {
      player.crouching = true;
      mover.height = CROUCH_HEIGHT;
    } else if (!crouching && player.crouching && !mover.overlaps(mover.position.x, mover.position.y, mover.position.z, 0.02)) {
      player.crouching = false;
      mover.height = STAND_HEIGHT;
    }
    const eyeTarget = player.crouching ? CROUCH_EYE : STAND_EYE;
    player.eye += (eyeTarget - player.eye) * Math.min(1, dt * 12);

    const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    wish.set(0, 0, 0);
    if (forward || strafe) {
      const sin = Math.sin(player.yaw);
      const cos = Math.cos(player.yaw);
      wish.set(-sin * forward + cos * strafe, 0, -cos * forward - sin * strafe).normalize();
    }

    const speed = player.crouching ? CROUCH_SPEED : WALK_SPEED;
    const blend = Math.min(1, (mover.onGround ? GROUND_ACCEL : AIR_ACCEL) * dt / speed);
    mover.velocity.x += (wish.x * speed - mover.velocity.x) * blend;
    mover.velocity.z += (wish.z * speed - mover.velocity.z) * blend;
    if (mover.onGround && !wish.lengthSq()) {
      const damp = Math.max(0, 1 - FRICTION * dt);
      mover.velocity.x *= damp;
      mover.velocity.z *= damp;
    }

    if (keys.has('Space') && mover.onGround) {
      mover.velocity.y = JUMP_SPEED;
    }
    mover.velocity.y -= GRAVITY * dt;
    mover.velocity.y = Math.max(-30, mover.velocity.y);
    mover.move(mover.velocity.x * dt, mover.velocity.z * dt, mover.velocity.y * dt);
  }

  return {
    state: player,
    position: mover.position,
    velocity: mover.velocity,
    step,
    look,
    recoil,
    groundSpeed() {
      return Math.hypot(mover.velocity.x, mover.velocity.z);
    },
    reset(x, z) {
      mover.reset(x, z);
      player.yaw = 0;
      player.pitch = 0;
      player.eye = STAND_EYE;
      player.crouching = false;
      player.health = 100;
      player.alive = true;
    },
  };
}
