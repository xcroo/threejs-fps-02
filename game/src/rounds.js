// Rounds: the match state machine. Freeze time to buy, a live round with a timer,
// a win by elimination, by the bomb, or by the clock, and money that carries between
// rounds. First to 5 rounds takes the match. The bomb is planted by holding E inside
// a site; it blows 40 seconds later unless a defender holds E beside it for 5.
//
// Rewritten in session for the threejs-fps-02 entry (transcript coverage).
// Revised once after the first write: the rewrite note now names the right entry.
import { MAP } from './mapdata.js';

export const BUY_SECONDS = 12;
export const ROUND_SECONDS = 100;
export const BOMB_FUSE = 40;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 5;
export const WIN_ROUNDS = 5;
export const REWARD = { kill: 300, win: 3250, loss: 1400, plant: 300, defuse: 300 };

export function createRounds(events) {
  const state = {
    phase: 'buy', // buy | live | over | match
    round: 1,
    score: { atk: 0, def: 0 },
    money: 800,
    timer: BUY_SECONDS,
    bomb: { planted: false, site: null, position: null, fuseLeft: 0 },
    plantLeft: PLANT_SECONDS,
    winner: null,
    matchWinner: null,
    message: '',
  };

  function startRound() {
    state.phase = 'buy';
    state.timer = BUY_SECONDS;
    state.bomb = { planted: false, site: null, position: null, fuseLeft: 0 };
    state.plantLeft = PLANT_SECONDS;
    state.winner = null;
    state.message = `Round ${state.round} — buy your gear`;
    events.onRoundStart(state.round);
  }

  function endRound(winner, message) {
    if (state.phase === 'over' || state.phase === 'match') return;
    state.phase = 'over';
    state.winner = winner;
    state.score[winner] += 1;
    state.money += winner === 'atk' ? REWARD.win : REWARD.loss;
    state.timer = 4;
    state.message = message;
    events.onRoundEnd(winner, message, state.score);
    if (state.score[winner] >= WIN_ROUNDS) {
      state.phase = 'match';
      state.matchWinner = winner;
      events.onMatchEnd(winner, state.score);
    }
  }

  function nextRound() {
    state.round += 1;
    startRound();
  }

  // The player holding E inside a site. Returns true the moment the plant lands.
  function plantTick(dt, playerPosition) {
    if (state.phase !== 'live' || state.bomb.planted) return false;
    let site = null;
    for (const [key, s] of Object.entries(MAP.sites)) {
      const dx = playerPosition.x - s.center[0];
      const dz = playerPosition.z - s.center[1];
      if (Math.hypot(dx, dz) < s.radius) {
        site = key;
        break;
      }
    }
    if (!site) {
      state.plantLeft = PLANT_SECONDS;
      return false;
    }
    state.plantLeft -= dt;
    if (state.plantLeft > 0) return false;
    state.bomb = {
      planted: true,
      site,
      position: { x: MAP.sites[site].center[0], z: MAP.sites[site].center[1] },
      fuseLeft: BOMB_FUSE,
    };
    state.money += REWARD.plant;
    events.onBombPlanted(site);
    return true;
  }

  function step(dt, context) {
    if (state.phase === 'buy') {
      state.timer -= dt;
      if (state.timer <= 0) {
        state.phase = 'live';
        state.timer = ROUND_SECONDS;
        state.message = 'Go — plant the charge at A or B';
        events.onLive();
      }
      return;
    }
    if (state.phase === 'live') {
      state.timer -= dt;
      if (state.bomb.planted) {
        state.bomb.fuseLeft -= dt;
        if (state.bomb.fuseLeft <= 0) {
          endRound('atk', 'Charge detonated — attackers take the round');
          return;
        }
      }
      if (context.aliveAtk === 0) {
        endRound('def', 'Attackers eliminated — defenders hold');
        return;
      }
      if (context.aliveDef === 0) {
        endRound('atk', 'Defenders eliminated — attackers take the round');
        return;
      }
      if (state.timer <= 0) {
        endRound(state.bomb.planted ? 'atk' : 'def', state.bomb.planted ? 'Time — the charge still blew' : 'Time — defenders hold the sites');
      }
      return;
    }
    if (state.phase === 'over') {
      state.timer -= dt;
      if (state.timer <= 0) nextRound();
    }
  }

  return {
    state,
    startRound,
    startMatch() {
      state.round = 1;
      state.score = { atk: 0, def: 0 };
      state.money = 800;
      state.matchWinner = null;
      startRound();
    },
    step,
    plantTick,
    onKill() {
      state.money += REWARD.kill;
    },
    onDefused() {
      state.money += REWARD.defuse;
      endRound('def', 'Charge defused — defenders hold');
    },
    addMoney(amount) {
      state.money += amount;
    },
    spend(amount) {
      if (state.money < amount) return false;
      state.money -= amount;
      return true;
    },
  };
}
