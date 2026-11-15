// Emberworks: the look plan in one place. A decommissioned power-station yard at dusk:
// cold steel blue-grey under warm sodium-amber light. Every colour in the game and the CSS
// comes from these names, so the scene reads as one palette at a glance.
//
// Rewritten in session for the threejs-fps-02 entry (transcript coverage).
// Revised once after the first write: the rewrite note now names the right entry.
export const PALETTE = {
  canvas: '#191d26', // dusk sky, fog, page background
  surface: '#333945', // walls, floors, container steel
  hairline: '#232833', // crates, dark steel, shadowed faces
  ink: '#ece5d3', // warm off-white: text, light metal, markings
  muted: '#8b94a3', // dim steel, distant geometry
  accent: '#ff9a2e', // sodium amber: lights, site markers, the bomb
  danger: '#e0492f', // enemy red: tracers, damage, defuse warning
  ally: '#3fae7a', // teammate green: friendly markers, buy confirmations
};

export function cssVars() {
  return Object.entries(PALETTE)
    .map(([name, value]) => `  --${name}: ${value};`)
    .join('\n');
}
