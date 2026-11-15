// Minimap: a 2D top-down canvas. Walls and sites always show; the player is an
// arrow, teammates are green dots, and enemies appear only while a teammate can see
// them — the same information Counter-Strike gives you, and no more.
//
// Rewritten in session for the threejs-fps-02 entry (transcript coverage).
// Revised once after the first write: the rewrite note now names the right entry.
import { MAP } from './mapdata.js';
import { PALETTE } from './palette.js';

export function createMinimap(canvas) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const scale = size / 40;
  function toX(x) {
    return (x + 20) * scale;
  }
  function toY(z) {
    return (z + 16) * scale;
  }

  function draw(state) {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = 'rgba(20, 22, 26, 0.85)';
    ctx.fillRect(0, 0, size, size);
    // Walls.
    ctx.fillStyle = PALETTE.surface;
    for (const [w, h, d, x, y, z] of MAP.boxes) {
      if (y < 0 || h > 4) continue;
      ctx.fillRect(toX(x - w / 2), toY(z - d / 2), w * scale, d * scale);
    }
    // Sites.
    for (const [key, site] of Object.entries(MAP.sites)) {
      ctx.strokeStyle = PALETTE.accent;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(toX(site.center[0]), toY(site.center[1]), site.radius * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = PALETTE.accent;
      ctx.font = `bold ${Math.round(11 * scale / 4)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(key, toX(site.center[0]), toY(site.center[1]) + 4);
    }
    // Bomb.
    if (state.bomb && state.bomb.planted) {
      ctx.fillStyle = PALETTE.danger;
      ctx.beginPath();
      ctx.arc(toX(state.bomb.position.x), toY(state.bomb.position.z), 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Enemies, only while spotted.
    for (const enemy of state.spotted) {
      ctx.fillStyle = PALETTE.danger;
      ctx.beginPath();
      ctx.arc(toX(enemy.x), toY(enemy.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Teammates.
    for (const mate of state.mates) {
      ctx.fillStyle = PALETTE.ally;
      ctx.beginPath();
      ctx.arc(toX(mate.x), toY(mate.z), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // Player arrow.
    const px = toX(state.player.x);
    const py = toY(state.player.z);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-state.player.yaw);
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  return { draw };
}
