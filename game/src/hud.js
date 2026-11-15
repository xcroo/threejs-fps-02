// HUD: every DOM element the game writes to, in one place. Health, ammo, money,
// round timer and score; a killfeed; a hitmarker that turns red on a kill; a damage
// direction arc; a buy menu; and the round banner. The module only touches the DOM
// when a value actually changed.
//
// Rewritten in session for the threejs-fps-02 entry (transcript coverage).
// Revised once after the first write: the rewrite note now names the right entry.
import { WEAPONS, GRENADES } from './weapons.js';
import { PLANT_SECONDS, DEFUSE_SECONDS } from './rounds.js';

export function createHud(document) {
  const elements = {
    health: document.getElementById('health'),
    healthBar: document.getElementById('health-bar-fill'),
    ammo: document.getElementById('ammo'),
    weapon: document.getElementById('weapon'),
    money: document.getElementById('money'),
    timer: document.getElementById('timer'),
    score: document.getElementById('score'),
    round: document.getElementById('round'),
    banner: document.getElementById('banner'),
    killfeed: document.getElementById('killfeed'),
    hitmarker: document.getElementById('hitmarker'),
    damage: document.getElementById('damage'),
    buy: document.getElementById('buy'),
    buyList: document.getElementById('buy-list'),
    objective: document.getElementById('objective'),
    progress: document.getElementById('progress'),
    progressBar: document.getElementById('progress-bar'),
    crosshair: document.getElementById('crosshair'),
    hint: document.getElementById('hint'),
  };
  const cache = {};
  let hitTimer = 0;
  let damageTimer = 0;

  function set(id, value) {
    if (cache[id] !== value) {
      cache[id] = value;
      if (elements[id]) elements[id].textContent = value;
    }
  }

  function buildBuyList() {
    elements.buyList.innerHTML = '';
    const rows = [];
    for (const [key, def] of Object.entries(WEAPONS)) {
      rows.push({ key, label: `${def.name} — $${def.price}`, kind: 'weapon' });
    }
    for (const [key, def] of Object.entries(GRENADES)) {
      rows.push({ key, label: `${def.name} — $${def.price}`, kind: 'grenade' });
    }
    rows.forEach((row, index) => {
      const div = document.createElement('div');
      div.className = 'buy-row';
      div.innerHTML = `<span class="buy-key">${index + 1}</span><span>${row.label}</span>`;
      elements.buyList.appendChild(div);
    });
  }
  buildBuyList();

  return {
    elements,
    update(state, dt) {
      set('health', `${Math.max(0, Math.ceil(state.health))}`);
      elements.healthBar.style.width = `${Math.max(0, state.health)}%`;
      elements.healthBar.style.background = state.health > 50 ? '#3fae7a' : state.health > 25 ? '#ff9a2e' : '#e0492f';
      set('ammo', state.reloadLeft > 0 ? 'RELOADING' : `${state.mag} / ${state.reserve}`);
      set('weapon', state.weaponName);
      set('money', `$${state.money}`);
      const seconds = Math.max(0, Math.ceil(state.timer));
      set('timer', `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`);
      set('score', `${state.scoreAtk} : ${state.scoreDef}`);
      set('round', `ROUND ${state.round}`);
      set('objective', state.objective);
      if (state.banner !== cache.banner) {
        cache.banner = state.banner;
        elements.banner.textContent = state.banner;
        elements.banner.style.opacity = state.banner ? '1' : '0';
      }
      if (state.showBuy !== cache.showBuy) {
        cache.showBuy = state.showBuy;
        elements.buy.style.display = state.showBuy ? 'block' : 'none';
      }
      if (state.progress > 0) {
        elements.progress.style.display = 'block';
        elements.progressBar.style.width = `${Math.round(state.progress * 100)}%`;
        elements.progressBar.style.background = state.progressKind === 'defuse' ? '#e0492f' : '#ff9a2e';
      } else {
        elements.progress.style.display = 'none';
      }
      elements.crosshair.style.display = state.scoped ? 'none' : 'block';
      elements.crosshair.style.opacity = state.alive ? '1' : '0';
      set('hint', state.hint);
      if (hitTimer > 0) {
        hitTimer -= dt;
        elements.hitmarker.style.opacity = hitTimer > 0 ? '1' : '0';
      }
      if (damageTimer > 0) {
        damageTimer -= dt;
        elements.damage.style.opacity = damageTimer > 0 ? '0.9' : '0';
      }
    },
    hitmarker(kill) {
      hitTimer = kill ? 0.5 : 0.18;
      elements.hitmarker.style.color = kill ? '#e0492f' : '#ece5d3';
      elements.hitmarker.style.opacity = '1';
    },
    damageFrom(angleDegrees) {
      damageTimer = 0.9;
      elements.damage.style.transform = `translate(-50%, -50%) rotate(${angleDegrees}deg)`;
      elements.damage.style.opacity = '0.9';
    },
    killfeed(text) {
      const div = document.createElement('div');
      div.className = 'kill';
      div.textContent = text;
      elements.killfeed.prepend(div);
      while (elements.killfeed.children.length > 5) elements.killfeed.lastChild.remove();
      setTimeout(() => div.remove(), 6000);
    },
  };
}

export { PLANT_SECONDS, DEFUSE_SECONDS };
