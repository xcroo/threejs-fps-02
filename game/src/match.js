// RAILHEAD — match.js: the round state machine and the economy.
//
// Phases: buy (12 s, bots frozen, shop open) -> live (100 s) -> planted
// (40 s fuse) -> over (5 s banner) -> next round. First to 5 rounds takes
// the match. Win by elimination, detonation, defusal, or the clock.
//
// The economy is the player's: $800 to start, kill +$300, win +$3250,
// loss +$1400, plant +$300, defuse +$300. Reserve ammo refills each round.
// The bomb starts on the player; if the player dies it passes to the
// nearest living attacker bot, who carries it to their site and plants.

import { SITES } from './yard.js';

export const BUY_TIME = 12;
export const ROUND_TIME = 100;
export const FUSE_TIME = 40;
export const PLANT_TIME = 3;
export const DEFUSE_TIME = 5;
export const WIN_ROUNDS = 5;
export const KILL_REWARD = 300;
export const WIN_REWARD = 3250;
export const LOSS_REWARD = 1400;
export const PLANT_REWARD = 300;
export const DEFUSE_REWARD = 300;

export function createMatch(hooks) {
  return {
    phase: 'buy',
    timer: BUY_TIME,
    round: 1,
    score: { atk: 0, def: 0 },
    money: 800,
    bomb: {
      planted: false,
      site: null,
      pos: null,
      fuseLeft: 0,
      carrier: 'player',
      plantProgress: 0,
      plantAgent: null,
      defuseProgress: 0,
      defuser: null,
    },
    winner: null,
    winReason: '',
    hooks,
  };
}

/** Begin a round: buy phase, fresh bomb on the player, money kept. */
export function startRound(match) {
  match.phase = 'buy';
  match.timer = BUY_TIME;
  match.bomb.planted = false;
  match.bomb.site = null;
  match.bomb.pos = null;
  match.bomb.fuseLeft = 0;
  match.bomb.carrier = 'player';
  match.bomb.plantProgress = 0;
  match.bomb.plantAgent = null;
  match.bomb.defuseProgress = 0;
  match.bomb.defuser = null;
  match.winner = null;
  match.winReason = '';
  match.hooks.onBanner(`Round ${match.round}`, 'Buy phase — press B for the shop', 2.5);
}

/** Which site (if any) is the point (x, z) inside? */
export function siteAt(x, z) {
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    if (x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1) return key;
  }
  return null;
}

/** Channel a plant. Returns 'planted' when the bomb goes down. */
export function plantBy(match, agent, site, pos, dt) {
  const bomb = match.bomb;
  if (match.phase !== 'live' || bomb.planted || !site) {
    bomb.plantProgress = 0;
    bomb.plantAgent = null;
    return 'idle';
  }
  if (bomb.plantAgent !== agent) {
    bomb.plantAgent = agent;
    bomb.plantProgress = 0;
  }
  bomb.plantProgress += dt;
  if (bomb.plantProgress >= PLANT_TIME) {
    bomb.planted = true;
    bomb.site = site;
    bomb.pos = { x: pos.x, z: pos.z };
    bomb.fuseLeft = FUSE_TIME;
    bomb.plantProgress = 0;
    bomb.plantAgent = null;
    match.phase = 'planted';
    match.hooks.onBanner('Bomb planted', `Site ${site} — ${FUSE_TIME} seconds to detonation`, 3);
    match.hooks.onPlant();
    if (agent === 'player') match.money += PLANT_REWARD;
    return 'planted';
  }
  return 'planting';
}

/** Channel a defuse. Returns 'defused' when the bomb is safe. */
export function defuseBy(match, agent, dt) {
  const bomb = match.bomb;
  if (match.phase !== 'planted' || !bomb.planted) {
    bomb.defuseProgress = 0;
    bomb.defuser = null;
    return 'idle';
  }
  if (bomb.defuser !== agent) {
    bomb.defuser = agent;
    bomb.defuseProgress = 0;
  }
  bomb.defuseProgress += dt;
  if (bomb.defuseProgress >= DEFUSE_TIME) {
    bomb.defuseProgress = 0;
    bomb.defuser = null;
    if (agent === 'player') match.money += DEFUSE_REWARD;
    endRound(match, 'def', 'Bomb defused');
    return 'defused';
  }
  return 'defusing';
}

/** A hit or a death breaks the channel of the named agent. */
export function interruptChannel(match, agent) {
  const bomb = match.bomb;
  if (bomb.plantAgent === agent) {
    bomb.plantAgent = null;
    bomb.plantProgress = 0;
  }
  if (bomb.defuser === agent) {
    bomb.defuser = null;
    bomb.defuseProgress = 0;
  }
}

/** End a round: score, money, banner. The 'over' phase rolls to the next. */
export function endRound(match, winner, reason) {
  if (match.phase === 'buy' || match.phase === 'over' || match.phase === 'matchover') return;
  match.score[winner] += 1;
  match.winner = winner;
  match.winReason = reason;
  match.money += winner === 'atk' ? WIN_REWARD : LOSS_REWARD;
  match.phase = 'over';
  match.timer = 5;
  const title = winner === 'atk' ? 'Attackers win the round' : 'Defenders win the round';
  match.hooks.onBanner(title, reason, 4);
  match.hooks.onRoundEnd(winner, reason);
}

/** Step the timers and check elimination. `ctx` carries the living counts. */
export function stepMatch(match, dt, ctx) {
  if (match.phase === 'buy') {
    match.timer -= dt;
    if (match.timer <= 0) {
      match.phase = 'live';
      match.timer = ROUND_TIME;
      match.hooks.onBanner('Round live', 'Plant the charge at Site A or Site B', 2.5);
      match.hooks.onRoundLive();
    }
  } else if (match.phase === 'live') {
    match.timer -= dt;
    if (ctx.aliveAtk <= 0) {
      endRound(match, 'def', 'Attackers eliminated');
    } else if (ctx.aliveDef <= 0) {
      endRound(match, 'atk', 'Defenders eliminated');
    } else if (match.timer <= 0) {
      endRound(match, 'def', 'Time expired — the charge was never planted');
    }
  } else if (match.phase === 'planted') {
    match.bomb.fuseLeft -= dt;
    if (ctx.aliveDef <= 0) {
      endRound(match, 'atk', 'Defenders eliminated — nothing can stop the charge');
    } else if (match.bomb.fuseLeft <= 0) {
      match.hooks.onDetonate(match.bomb.pos);
      endRound(match, 'atk', 'Bomb detonated');
    }
  } else if (match.phase === 'over') {
    match.timer -= dt;
    if (match.timer <= 0) {
      if (match.score.atk >= WIN_ROUNDS || match.score.def >= WIN_ROUNDS) {
        match.phase = 'matchover';
        const winner = match.score.atk >= WIN_ROUNDS ? 'atk' : 'def';
        match.hooks.onBanner(
          winner === 'atk' ? 'Attackers take the match' : 'Defenders take the match',
          `${match.score.atk} — ${match.score.def}`,
          6
        );
        match.hooks.onMatchEnd(winner);
      } else {
        match.round += 1;
        ctx.onNextRound();
      }
    }
  }
}

/** Buy a weapon for the player. Returns 'ok', 'owned', or 'poor'. */
export function buyFor(match, arsenal, id, price) {
  if (arsenal.slots[id]) return 'owned';
  if (match.money < price) return 'poor';
  match.money -= price;
  return 'ok';
}
