// RAILHEAD — mover.js: the shared character mover.
//
// Every walking thing in the game (the player and the bots) is a mover: a
// capsule approximated as a circle on the ground plane with a height, moved
// by acceleration and friction, pulled down by gravity, and pushed out of
// the yard's colliders one axis at a time. The map is flat, so there is no
// slope or stair handling: the ground is y = 0 everywhere.
//
// Yaw convention: yaw 0 faces north (-z), -PI/2 faces east (+x), PI faces
// south (+z). Forward is (-sin(yaw), 0, -cos(yaw)).

import { blocksWalk, COLLIDERS } from './yard.js';
import { clamp } from './math3.js';

export const WALK_SPEED = 4.3;
export const CROUCH_SPEED = 2.2;
export const ACCEL_GROUND = 55;
export const ACCEL_AIR = 14;
export const FRICTION = 11;
export const GRAVITY = 22;
export const JUMP_SPEED = 7.6;
export const BODY_RADIUS = 0.35;
export const STAND_HEIGHT = 1.7;
export const CROUCH_HEIGHT = 1.1;

/** A fresh mover at (x, z), facing `yaw`. */
export function createMover(x, z, yaw = 0) {
  return {
    pos: { x, y: 0, z },
    vel: { x: 0, y: 0, z: 0 },
    yaw,
    onGround: true,
    crouch: false,
    radius: BODY_RADIUS,
  };
}

/** Is the circle (x, z, radius) inside any walk-blocking collider? */
function circleHitsWall(x, z, radius) {
  for (const box of COLLIDERS) {
    if (!blocksWalk(box)) continue;
    const cx = clamp(x, box.x0, box.x1);
    const cz = clamp(z, box.z0, box.z1);
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < radius * radius) return box;
  }
  return null;
}

/**
 * Step a mover by dt. `input` is { fwd, strafe, jump, crouch } where fwd and
 * strafe are in [-1, 1] in the mover's own frame (fwd = forward).
 * Returns nothing; the mover is updated in place.
 */
export function stepMover(m, input, dt) {
  if (dt <= 0) return;
  m.crouch = !!input.crouch;
  const maxSpeed = m.crouch ? CROUCH_SPEED : WALK_SPEED;
  const sin = Math.sin(m.yaw);
  const cos = Math.cos(m.yaw);
  // Wish direction in world space: forward is (-sin, -cos), right is (cos, -sin).
  let wx = -sin * input.fwd + cos * input.strafe;
  let wz = -cos * input.fwd - sin * input.strafe;
  const wl = Math.sqrt(wx * wx + wz * wz);
  if (wl > 1) {
    wx /= wl;
    wz /= wl;
  }
  const accel = m.onGround ? ACCEL_GROUND : ACCEL_AIR;
  m.vel.x += wx * accel * dt;
  m.vel.z += wz * accel * dt;
  if (m.onGround && wl < 0.05) {
    // Friction bleeds speed when no input is given.
    const drop = Math.max(0, 1 - FRICTION * dt);
    m.vel.x *= drop;
    m.vel.z *= drop;
  }
  const hSpeed = Math.sqrt(m.vel.x * m.vel.x + m.vel.z * m.vel.z);
  if (hSpeed > maxSpeed) {
    const scale = maxSpeed / hSpeed;
    m.vel.x *= scale;
    m.vel.z *= scale;
  }
  if (input.jump && m.onGround) {
    m.vel.y = JUMP_SPEED;
    m.onGround = false;
  }
  m.vel.y -= GRAVITY * dt;

  // Move one axis at a time so a wall stops one component, not both.
  const nextX = m.pos.x + m.vel.x * dt;
  if (!circleHitsWall(nextX, m.pos.z, m.radius)) {
    m.pos.x = nextX;
  } else {
    m.vel.x = 0;
  }
  const nextZ = m.pos.z + m.vel.z * dt;
  if (!circleHitsWall(m.pos.x, nextZ, m.radius)) {
    m.pos.z = nextZ;
  } else {
    m.vel.z = 0;
  }
  m.pos.y += m.vel.y * dt;
  if (m.pos.y <= 0) {
    m.pos.y = 0;
    m.vel.y = 0;
    m.onGround = true;
  } else if (m.vel.y > 0.01) {
    m.onGround = false;
  }

  // Stay inside the yard even if a collider is missed.
  m.pos.x = clamp(m.pos.x, -19.4 + m.radius, 19.4 - m.radius);
  m.pos.z = clamp(m.pos.z, -14.4 + m.radius, 14.4 - m.radius);
}

/** Eye height of a mover (standing or crouched). */
export function eyeHeight(m) {
  return m.crouch ? 1.05 : 1.62;
}
