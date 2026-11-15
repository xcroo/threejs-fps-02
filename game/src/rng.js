// RAILHEAD — rng.js: a small seeded random source.
//
// The whole simulation draws from one seeded generator so a ?seed=N run is
// reproducible: the same seed deals the same bot routes, the same spread and
// the same screenshot warm-up. mulberry32 is tiny, fast and good enough for
// a game; nothing here needs cryptographic randomness.

/** mulberry32: a 32-bit seeded PRNG returning floats in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seeded RNG with the helpers the game uses. */
export function createRng(seed) {
  const next = mulberry32(seed);
  return {
    /** A float in [0, 1). */
    next,
    /** A float in [lo, hi). */
    range(lo, hi) {
      return lo + next() * (hi - lo);
    },
    /** An integer in [lo, hi] (both ends included). */
    int(lo, hi) {
      return lo + Math.floor(next() * (hi - lo + 1));
    },
    /** One element of an array, uniformly. */
    pick(list) {
      return list[Math.floor(next() * list.length)];
    },
    /** True with probability p. */
    chance(p) {
      return next() < p;
    },
    /** A fresh child RNG, seeded from this one, for an independent stream. */
    fork() {
      return createRng(Math.floor(next() * 0x7fffffff));
    },
  };
}

/** A hash of a string into a 32-bit seed (for naming seeds like "railhead"). */
export function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
