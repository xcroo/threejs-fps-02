// RAILHEAD — debug.js: the ?debug=1 handle for automated tests.
//
// When the page loads with ?debug=1, window.__railhead exposes the live
// game: the player mover, the match state, the arsenal, the bots and the
// clock. The test scripts drive the game through this handle (deploy,
// move, fire, kill defenders, plant the bomb) and read back state. It is
// off unless the query param is present, so normal play never sees it.

import { WAYPOINTS } from './yard.js';

export function installDebug(game) {
  const params = new URLSearchParams(window.location.search);
  if (params.get('debug') !== '1') return;
  window.__railhead = {
    // The player's mover position (plain {x, y, z}) and facing.
    player: {
      position: game.playerMover.pos,
      get yaw() {
        return game.playerYaw;
      },
      state: {
        get health() {
          return game.playerHealth;
        },
        get alive() {
          return game.playerAlive;
        },
      },
    },
    // The match object itself: phase, timer, round, score, money, bomb.
    match: game.match,
    // The arsenal plus a helper for the current weapon's magazine.
    arsenal: {
      raw: game.arsenal,
      current() {
        return game.currentWeaponDef();
      },
      get mag() {
        return game.currentSlot().mag;
      },
    },
    bots: {
      list: game.bots.bots,
      aliveCount(team) {
        return game.bots.bots.filter((b) => b.alive && b.team === team).length;
      },
      damage(bot, amount) {
        game.damageBot(bot, amount, null);
      },
    },
    get time() {
      return game.time;
    },
    get phase() {
      return game.match.phase;
    },
    // The nav graph's size, so a test can sanity-check the map it loaded.
    waypointCount: WAYPOINTS.length,
  };
}
