// RAILHEAD — math3.js: the small 3D math the simulation needs.
//
// Positions in the simulation are plain {x, y, z} objects, never THREE
// vectors: the sim runs at a fixed 60 Hz and must not allocate in its hot
// loops. These helpers are pure functions over numbers and plain boxes.
//
// A "box" is an axis-aligned box {x0, y0, z0, x1, y1, z1}. A "flat" is the
// same box seen from above, for 2D movement and line-of-sight tests.

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** Distance on the ground plane. */
export function dist2D(ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  return Math.sqrt(dx * dx + dz * dz);
}

/** Shortest signed turn from angle a to angle b, in (-PI, PI]. */
export function angleDiff(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d <= -Math.PI) d += Math.PI * 2;
  return d;
}

/** The yaw that faces from (ax, az) toward (bx, bz) under the game's convention. */
export function facingYaw(ax, az, bx, bz) {
  return Math.atan2(-(bx - ax), -(bz - az));
}

/** Turn `from` toward `to` by at most `step` radians. */
export function turnToward(from, to, step) {
  const d = angleDiff(from, to);
  if (Math.abs(d) <= step) return to;
  return from + Math.sign(d) * step;
}

/**
 * Ray vs axis-aligned box (slab method). Returns the smallest non-negative
 * distance along the ray to the box, or Infinity when the ray misses it.
 * The direction need not be normalized; the distance is in the same units.
 */
export function rayBox(ox, oy, oz, dx, dy, dz, box) {
  let tMin = 0;
  let tMax = Infinity;
  const axes = [
    [ox, dx, box.x0, box.x1],
    [oy, dy, box.y0, box.y1],
    [oz, dz, box.z0, box.z1],
  ];
  for (let i = 0; i < 3; i++) {
    const [o, d, lo, hi] = axes[i];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return Infinity;
    } else {
      let t0 = (lo - o) / d;
      let t1 = (hi - o) / d;
      if (t0 > t1) {
        const tmp = t0;
        t0 = t1;
        t1 = tmp;
      }
      if (t0 > tMin) tMin = t0;
      if (t1 < tMax) tMax = t1;
      if (tMin > tMax) return Infinity;
    }
  }
  return tMax < 0 ? Infinity : tMin;
}

/**
 * Does the ground-plane segment (ax,az)-(bx,bz) cross a box's footprint?
 * Used for line of sight: only boxes tall enough to hide a standing person
 * (top above 1.4 m) block sight.
 */
export function segmentBlocksSight(ax, az, bx, bz, box) {
  if (box.y1 < 1.4) return false;
  // 2D slab test on the segment, t in [0, 1].
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const pairs = [
    [ax, dx, box.x0, box.x1],
    [az, dz, box.z0, box.z1],
  ];
  for (const [o, d, lo, hi] of pairs) {
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return false;
    } else {
      let a = (lo - o) / d;
      let b = (hi - o) / d;
      if (a > b) {
        const tmp = a;
        a = b;
        b = tmp;
      }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) return false;
    }
  }
  return true;
}

/**
 * Ray vs a standing character: a body cylinder (radius 0.38, y 0..1.32 above
 * the feet) plus a head sphere (center 1.52 above the feet, radius 0.24).
 * Returns { t, part } with part 'head' or 'body', or null on a miss.
 * `feet` is {x, y, z} at the character's feet; crouch lowers the head.
 */
export function rayCharacter(ox, oy, oz, dx, dy, dz, feet, crouch) {
  const headY = feet.y + (crouch ? 1.02 : 1.52);
  const headR = 0.24;
  // Head sphere: solve |o + t d - c|^2 = r^2.
  const cx = feet.x;
  const cy = headY;
  const cz = feet.z;
  const ex = ox - cx;
  const ey = oy - cy;
  const ez = oz - cz;
  const a = dx * dx + dy * dy + dz * dz;
  const b = 2 * (ex * dx + ey * dy + ez * dz);
  const c = ex * ex + ey * ey + ez * ez - headR * headR;
  const disc = b * b - 4 * a * c;
  let best = Infinity;
  let part = null;
  if (disc >= 0 && a > 1e-9) {
    const root = Math.sqrt(disc);
    const t = (-b - root) / (2 * a);
    if (t >= 0 && t < best) {
      best = t;
      part = 'head';
    }
  }
  // Body cylinder: 2D circle test, then the height range.
  const top = feet.y + (crouch ? 0.95 : 1.32);
  const r = 0.38;
  const fx = ox - feet.x;
  const fz = oz - feet.z;
  const aa = dx * dx + dz * dz;
  if (aa > 1e-9) {
    const bb = 2 * (fx * dx + fz * dz);
    const cc = fx * fx + fz * fz - r * r;
    const dd = bb * bb - 4 * aa * cc;
    if (dd >= 0) {
      const root = Math.sqrt(dd);
      const t = (-bb - root) / (2 * aa);
      if (t >= 0 && t < best) {
        const y = oy + t * dy;
        if (y >= feet.y && y <= top) {
          best = t;
          part = 'body';
        }
      }
    }
  }
  return part === null ? null : { t: best, part };
}

/** A point inside a box's footprint (ground plane), with a small margin. */
export function pointInBox2D(x, z, box, margin = 0) {
  return x >= box.x0 - margin && x <= box.x1 + margin && z >= box.z0 - margin && z <= box.z1 + margin;
}
