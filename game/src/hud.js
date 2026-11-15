// RAILHEAD — hud.js: everything drawn over the game.
//
// The HUD is plain DOM over the canvas: health and ammo bottom corners,
// timer and score on top, a killfeed, a minimap, a buy menu, banners and
// the deploy/pause overlays. The minimap is a 2D canvas redrawn at 10 Hz:
// walls from the yard's colliders, sites in amber, teammates always,
// enemies only while recently spotted, the planted bomb as a blinking dot.

import { COLLIDERS, SITES, MAP_W, MAP_H } from './yard.js';
import { WEAPONS, GRENADE_PRICE } from './guns.js';

function el(id) {
  return document.getElementById(id);
}

export function createHud() {
  const minimap = el('minimap');
  return {
    timer: el('hud-timer'),
    score: el('hud-score'),
    alive: el('hud-alive'),
    hpFill: el('hp-fill'),
    hpNum: el('hp-num'),
    money: el('hud-money'),
    wpnName: el('wpn-name'),
    wpnAmmo: el('wpn-ammo'),
    killfeed: el('killfeed'),
    banner: el('banner'),
    bannerTitle: el('banner-title'),
    bannerSub: el('banner-sub'),
    buyMenu: el('buy-menu'),
    buyList: el('buy-list'),
    buyMoney: el('buy-money'),
    deploy: el('deploy'),
    pause: el('pause'),
    channel: el('channel'),
    channelLabel: el('channel-label'),
    channelFill: el('channel-fill'),
    bombStatus: el('bomb-status'),
    hitmarker: el('hitmarker'),
    dmgArc: el('dmg-arc'),
    crosshair: el('crosshair'),
    endScreen: el('end-screen'),
    endTitle: el('end-title'),
    endScore: el('end-score'),
    minimap,
    minimapCtx: minimap.getContext('2d'),
    minimapAt: 0,
    bannerUntil: 0,
    spotted: new Map(),
  };
}

export function showBanner(hud, title, sub, seconds, now) {
  hud.bannerTitle.textContent = title;
  hud.bannerSub.textContent = sub;
  hud.banner.classList.remove('hidden');
  hud.bannerUntil = now + seconds;
}

export function addKillfeed(hud, text, team) {
  const row = document.createElement('div');
  row.className = 'kill';
  row.textContent = text;
  if (team) row.dataset.team = team;
  hud.killfeed.prepend(row);
  while (hud.killfeed.children.length > 5) hud.killfeed.lastChild.remove();
  setTimeout(() => row.remove(), 9000);
}

export function showHitmarker(hud, kill) {
  hud.hitmarker.classList.remove('kill');
  if (kill) hud.hitmarker.classList.add('kill');
  hud.hitmarker.classList.remove('show');
  void hud.hitmarker.offsetWidth;
  hud.hitmarker.classList.add('show');
}

/** Flash the damage-direction arc; `angle` is radians relative to facing. */
export function showDamageArc(hud, angle) {
  hud.dmgArc.style.transform = `translate(-50%, -50%) rotate(${angle}rad)`;
  hud.dmgArc.classList.remove('show');
  void hud.dmgArc.offsetWidth;
  hud.dmgArc.classList.add('show');
}

/** Build the buy menu rows from the armoury. */
export function buildBuyMenu(hud, onBuy) {
  hud.buyList.innerHTML = '';
  const rows = [];
  for (const id of ['vk47', 'hornet', 'breacher', 'longbow']) {
    const def = WEAPONS[id];
    rows.push({ id, label: `${def.name} — $${def.price}`, price: def.price });
  }
  rows.push({ id: 'he', label: `HE grenade — $${GRENADE_PRICE.he}`, price: GRENADE_PRICE.he });
  rows.push({ id: 'smoke', label: `Smoke grenade — $${GRENADE_PRICE.smoke}`, price: GRENADE_PRICE.smoke });
  rows.forEach((row, i) => {
    const button = document.createElement('button');
    button.className = 'buy-row';
    button.dataset.id = row.id;
    button.innerHTML = `<span class="buy-key">${i + 1}</span> ${row.label}`;
    button.addEventListener('click', () => onBuy(row.id));
    hud.buyList.appendChild(button);
  });
}

export function setBuyOpen(hud, open) {
  hud.buyMenu.classList.toggle('hidden', !open);
}

export function setChannel(hud, label, progress) {
  if (label === null) {
    hud.channel.classList.add('hidden');
    return;
  }
  hud.channel.classList.remove('hidden');
  hud.channelLabel.textContent = label;
  hud.channelFill.style.width = `${Math.round(progress * 100)}%`;
}

/** Per-frame HUD refresh from the live game state. */
export function updateHud(hud, s, now, dt) {
  // Top bar.
  const timer = Math.max(0, Math.ceil(s.match.timer));
  const mm = Math.floor(timer / 60);
  const ss = String(timer % 60).padStart(2, '0');
  hud.timer.textContent = `${mm}:${ss}`;
  hud.score.textContent = `${s.match.score.atk} : ${s.match.score.def}`;
  hud.alive.textContent = `ATK ${s.aliveAtk} · DEF ${s.aliveDef}`;
  // Bottom left: health + money.
  hud.hpFill.style.width = `${Math.max(0, s.playerHealth)}%`;
  hud.hpFill.style.background = s.playerHealth > 50 ? '#7fb069' : s.playerHealth > 25 ? '#c9a13b' : '#c94f3d';
  hud.hpNum.textContent = `${Math.max(0, Math.round(s.playerHealth))}`;
  hud.money.textContent = `$${s.match.money}`;
  // Bottom right: weapon + ammo.
  const def = s.weapon;
  const slot = s.slot;
  hud.wpnName.textContent = def.name;
  hud.wpnAmmo.textContent = s.reloading ? 'RELOADING' : `${slot.mag} / ${slot.reserve}`;
  // Crosshair gap follows spread (movement + bloom).
  const gap = 6 + s.spreadPx;
  hud.crosshair.style.setProperty('--gap', `${gap}px`);
  hud.crosshair.classList.toggle('scoped', s.scoped);
  // Banner expiry.
  if (hud.bannerUntil > 0 && now >= hud.bannerUntil) {
    hud.banner.classList.add('hidden');
    hud.bannerUntil = 0;
  }
  // Bomb status line.
  if (s.match.bomb.planted) {
    hud.bombStatus.textContent = `CHARGE AT SITE ${s.match.bomb.site} — ${Math.ceil(s.match.bomb.fuseLeft)}s`;
    hud.bombStatus.classList.remove('hidden');
  } else if (s.bombCarrier === 'player') {
    hud.bombStatus.textContent = 'YOU CARRY THE CHARGE — plant at Site A or B (hold E)';
    hud.bombStatus.classList.remove('hidden');
  } else {
    hud.bombStatus.classList.add('hidden');
  }
  // Minimap at 10 Hz.
  hud.minimapAt += dt;
  if (hud.minimapAt >= 0.1) {
    hud.minimapAt = 0;
    drawMinimap(hud, s);
  }
}

function drawMinimap(hud, s) {
  const ctx = hud.minimapCtx;
  const W = hud.minimap.width;
  const H = hud.minimap.height;
  const sx = (x) => ((x + MAP_W / 2) / MAP_W) * W;
  const sy = (z) => ((z + MAP_H / 2) / MAP_H) * H;
  ctx.fillStyle = '#17150f';
  ctx.fillRect(0, 0, W, H);
  // Walls.
  ctx.fillStyle = '#5a5348';
  for (const box of COLLIDERS) {
    if (box.y1 < 1.4) continue;
    ctx.fillRect(sx(box.x0), sy(box.z0), sx(box.x1) - sx(box.x0), sy(box.z1) - sy(box.z0));
  }
  // Sites.
  ctx.strokeStyle = '#c9a13b';
  ctx.lineWidth = 1.5;
  for (const key of ['A', 'B']) {
    const site = SITES[key];
    ctx.strokeRect(sx(site.x0), sy(site.z0), sx(site.x1) - sx(site.x0), sy(site.z1) - sy(site.z0));
  }
  // Planted bomb, or the carrier while it is still being carried.
  if (s.match.bomb.planted && s.match.bomb.pos) {
    ctx.fillStyle = '#ff5a3c';
    ctx.beginPath();
    ctx.arc(sx(s.match.bomb.pos.x), sy(s.match.bomb.pos.z), 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (s.bombCarrier && s.bombCarrier !== 'player') {
    ctx.fillStyle = '#c9a13b';
    ctx.beginPath();
    ctx.arc(sx(s.bombCarrier.mover.pos.x), sy(s.bombCarrier.mover.pos.z), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // Bots: teammates always, enemies only while recently spotted.
  for (const bot of s.bots) {
    if (!bot.alive) continue;
    const friendly = bot.team === 'atk';
    if (!friendly) {
      const seenAt = hud.spotted.get(bot.name) ?? -Infinity;
      if (s.now - seenAt > 3) continue;
    }
    ctx.fillStyle = friendly ? '#7fb069' : '#e05a4a';
    ctx.beginPath();
    ctx.arc(sx(bot.mover.pos.x), sy(bot.mover.pos.z), 3, 0, Math.PI * 2);
    ctx.fill();
  }
  // The player: a white triangle facing their yaw.
  const px = sx(s.playerX);
  const pz = sy(s.playerZ);
  const yaw = s.playerYaw;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(px - Math.sin(yaw) * 6, pz - Math.cos(yaw) * 6);
  ctx.lineTo(px - Math.sin(yaw + 2.5) * 4.5, pz - Math.cos(yaw + 2.5) * 4.5);
  ctx.lineTo(px - Math.sin(yaw - 2.5) * 4.5, pz - Math.cos(yaw - 2.5) * 4.5);
  ctx.closePath();
  ctx.fill();
}
