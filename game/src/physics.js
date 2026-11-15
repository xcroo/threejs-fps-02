// Shared AABB movement: one mover for the player and every bot, so a wall never
// swallows anyone and nobody duplicates the collision code. The body is a box
// (radius around x/z, height on y); each axis is tested and resolved on its own, so
// sliding along a wall works and standing on the floor is not read as walking into it.
//
// Rewritten in session for the threejs-fps-02 entry (transcript coverage).
// Revised once after the first write: the rewrite note now names the right entry.
import * as THREE from 'three';

export const RADIUS = 0.34;
export const STAND_HEIGHT = 1.72;
export const CROUCH_HEIGHT = 1.12;
export const GRAVITY = 20;

export function createMover(colliders, startX, startZ) {
  const position = new THREE.Vector3(startX, 0, startZ);
  const velocity = new THREE.Vector3();
  const probe = new THREE.Box3();
  let height = STAND_HEIGHT;
  let onGround = true;

  // lift keeps the feet and the crown out of the horizontal tests.
  function overlaps(x, y, z, lift) {
    probe.min.set(x - RADIUS, y + lift, z - RADIUS);
    probe.max.set(x + RADIUS, y + height - lift, z + RADIUS);
    for (let i = 0; i < colliders.length; i += 1) {
      if (probe.intersectsBox(colliders[i])) return colliders[i];
    }
    return null;
  }

  // Move by (dx, dz) horizontally, then settle vertically. Returns the collider hit
  // on the ground, if any, so callers can tell what they stand on.
  function move(dx, dz, dy) {
    const nextX = position.x + dx;
    if (!overlaps(nextX, position.y, position.z, 0.04)) position.x = nextX;
    else velocity.x = 0;
    const nextZ = position.z + dz;
    if (!overlaps(position.x, position.y, nextZ, 0.04)) position.z = nextZ;
    else velocity.z = 0;

    position.y += dy;
    onGround = false;
    let ground = null;
    const hit = overlaps(position.x, position.y, position.z, 0);
    if (hit && velocity.y <= 0) {
      position.y = hit.max.y;
      velocity.y = 0;
      onGround = true;
      ground = hit;
    } else if (hit) {
      position.y = hit.min.y - height;
      velocity.y = 0;
    }
    if (position.y < 0) {
      position.y = 0;
      velocity.y = 0;
      onGround = true;
    }
    return ground;
  }

  return {
    position,
    velocity,
    get height() {
      return height;
    },
    set height(value) {
      height = value;
    },
    get onGround() {
      return onGround;
    },
    overlaps,
    move,
    reset(x, z) {
      position.set(x, 0, z);
      velocity.set(0, 0, 0);
      height = STAND_HEIGHT;
      onGround = true;
    },
  };
}
