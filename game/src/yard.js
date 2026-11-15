// RAILHEAD — yard.js: the rail yard itself.
//
// A 40 x 30 m freight rail yard at dawn: the Engine Shed (Site A) at the
// north-west end of the North Track, the Container Stacks (Site B) at the
// south-east end of the South Track, and the Central Crossing with its signal
// box between them. Three lanes, two sites, one shoot-through window slit.
//
// This file holds the map DATA (colliders, sites, waypoints, spawns) as plain
// exports the simulation uses, plus buildYardMeshes(THREE, scene, rng),
// which turns the data into three.js meshes. Keeping data apart from meshes
// means the nav graph can be validated without a renderer.
//
// A collider is {x0, z0, x1, z1, y0, y1}: a ground-plane rectangle with a
// height band. Movement is blocked by any collider whose band reaches down
// near the ground (y0 < 0.9) and up past the knees (y1 > 0.5); shots and
// sight use the full 3D box. The signal box's window slit is two stacked
// boxes with a gap between them: the lower sill blocks walking, the upper
// lintel blocks high shots, and the gap (y 1.15..2.05) lets bullets through.

import { segmentBlocksSight, rayBox, pointInBox2D } from './math3.js';

export const MAP_W = 40;
export const MAP_H = 30;

/** Every solid thing on the map. */
export const COLLIDERS = [
  // Perimeter walls (h 4, thickness 0.6).
  { x0: -20, z0: -15, x1: 20, z1: -14.4, y0: 0, y1: 4, kind: 'wall' },
  { x0: -20, z0: 14.4, x1: 20, z1: 15, y0: 0, y1: 4, kind: 'wall' },
  { x0: -20, z0: -15, x1: -19.4, z1: 15, y0: 0, y1: 4, kind: 'wall' },
  { x0: 19.4, z0: -15, x1: 20, z1: 15, y0: 0, y1: 4, kind: 'wall' },
  // Engine Shed (Site A): east wall and a south wall stub; the entrance gap
  // is the open stretch x -15..-10 on the shed's south side.
  { x0: -10.6, z0: -14.4, x1: -10, z1: -5, y0: 0, y1: 3.5, kind: 'wall' },
  { x0: -19.4, z0: -5.6, x1: -15, z1: -5, y0: 0, y1: 3.5, kind: 'wall' },
  // Boxcars on the tracks (h 3).
  { x0: -7, z0: -13.2, x1: -1, z1: -10.8, y0: 0, y1: 3, kind: 'boxcar' },
  { x0: 5, z0: -13.2, x1: 11, z1: -10.8, y0: 0, y1: 3, kind: 'boxcar' },
  { x0: -8, z0: 10.8, x1: -2, z1: 13.2, y0: 0, y1: 3, kind: 'boxcar' },
  // Container Stacks (Site B). C2/C3 sit south so the west gap (z 8.6..10.5)
  // and the east gap stay open into the plant pocket.
  { x0: 11, z0: 6, x1: 17, z1: 8.6, y0: 0, y1: 2.6, kind: 'container' },
  { x0: 11, z0: 10.5, x1: 13.6, z1: 13.6, y0: 0, y1: 2.6, kind: 'container' },
  { x0: 15, z0: 10.5, x1: 17.6, z1: 13.6, y0: 0, y1: 2.6, kind: 'container' },
  { x0: 17, z0: 6, x1: 19, z1: 8.6, y0: 0, y1: 2.6, kind: 'container' },
  // Signal box at the Central Crossing: a 4x4 block with a window slit on
  // its west and east faces (gap y 1.15..2.05, 1.4 m wide).
  { x0: -2, z0: -2, x1: 2, z1: -1.4, y0: 0, y1: 3, kind: 'wall' },
  { x0: -2, z0: 1.4, x1: 2, z1: 2, y0: 0, y1: 3, kind: 'wall' },
  { x0: -2, z0: -1.4, x1: -1.4, z1: 1.4, y0: 0, y1: 1.15, kind: 'wall' },
  { x0: -2, z0: -1.4, x1: -1.4, z1: 1.4, y0: 2.05, y1: 3, kind: 'wall' },
  { x0: -2, z0: -1.4, x1: -1.4, z1: -0.7, y0: 1.15, y1: 2.05, kind: 'wall' },
  { x0: -2, z0: 0.7, x1: -1.4, z1: 1.4, y0: 1.15, y1: 2.05, kind: 'wall' },
  { x0: 1.4, z0: -1.4, x1: 2, z1: 1.4, y0: 0, y1: 1.15, kind: 'wall' },
  { x0: 1.4, z0: -1.4, x1: 2, z1: 1.4, y0: 2.05, y1: 3, kind: 'wall' },
  { x0: 1.4, z0: -1.4, x1: 2, z1: -0.7, y0: 1.15, y1: 2.05, kind: 'wall' },
  { x0: 1.4, z0: 0.7, x1: 2, z1: 1.4, y0: 1.15, y1: 2.05, kind: 'wall' },
  // Pillars.
  { x0: -14.4, z0: 1.6, x1: -13.6, z1: 2.4, y0: 0, y1: 3.5, kind: 'pillar' },
  { x0: -6.4, z0: 5.6, x1: -5.6, z1: 6.4, y0: 0, y1: 3.5, kind: 'pillar' },
  { x0: 5.6, z0: -6.4, x1: 6.4, z1: -5.6, y0: 0, y1: 3.5, kind: 'pillar' },
  { x0: 13.6, z0: -2.4, x1: 14.4, z1: -1.6, y0: 0, y1: 3.5, kind: 'pillar' },
  // Crates (h 1: cover you crouch behind, low enough to see over standing).
  { x0: -13.5, z0: -0.5, x1: -12.5, z1: 0.5, y0: 0, y1: 1, kind: 'crate' },
  { x0: -12.5, z0: 0.8, x1: -11.5, z1: 1.8, y0: 0, y1: 1, kind: 'crate' },
  { x0: -5, z0: -6.5, x1: -3, z1: -5.5, y0: 0, y1: 1, kind: 'crate' },
  { x0: -4.5, z0: 7.5, x1: -3.5, z1: 8.5, y0: 0, y1: 1, kind: 'crate' },
  { x0: 3.5, z0: 5.5, x1: 5.5, z1: 6.5, y0: 0, y1: 1, kind: 'crate' },
  { x0: 7.5, z0: -3.5, x1: 8.5, z1: -2.5, y0: 0, y1: 1, kind: 'crate' },
  { x0: 11, z0: 3.5, x1: 12, z1: 4.5, y0: 0, y1: 1, kind: 'crate' },
  { x0: -17, z0: 7.5, x1: -15, z1: 8.5, y0: 0, y1: 1, kind: 'crate' },
  { x0: 15.5, z0: -8.5, x1: 16.5, z1: -7.5, y0: 0, y1: 1, kind: 'crate' },
];

/** Whether a collider blocks walking (reaches from near the ground up). */
export function blocksWalk(box) {
  return box.y0 < 0.9 && box.y1 > 0.5;
}

/** The two bombsites: plant rectangles and their display names. */
export const SITES = {
  A: { name: 'Engine Shed', x0: -18, z0: -13, x1: -12, z1: -7, cx: -15, cz: -10 },
  B: { name: 'Container Stacks', x0: 14, z0: 8.8, x1: 16.5, z1: 10.3, cx: 15.2, cz: 9.5 },
};

/** Waypoints for the bot nav graph. */
export const WAYPOINTS = [
  { x: -18.5, z: -2 }, // 0 atk spawn 1
  { x: -18.5, z: 0.5 }, // 1 atk spawn 2
  { x: -18.5, z: 3 }, // 2 atk spawn 3
  { x: -16, z: -3.5 }, // 3 shed door
  { x: -14.5, z: -10 }, // 4 site A
  { x: -11.5, z: -6 }, // 5 shed east exit
  { x: -8, z: -9.5 }, // 6 north west
  { x: -2, z: -9.5 }, // 7 north mid 1
  { x: 3, z: -9.5 }, // 8 north mid 2
  { x: 8, z: -9.5 }, // 9 north east
  { x: 13, z: -9.5 }, // 10 north far
  { x: 0, z: -8 }, // 11 mid north
  { x: -4.5, z: 0.5 }, // 12 mid west
  { x: 4.5, z: 0.5 }, // 13 mid east
  { x: 0, z: 8 }, // 14 mid south
  { x: -12, z: 9.5 }, // 15 south west
  { x: -5, z: 9.5 }, // 16 south mid 1
  { x: 2, z: 9.5 }, // 17 south mid 2
  { x: 8, z: 9.5 }, // 18 south east
  { x: 12, z: 5 }, // 19 site B approach (north of the stacks)
  { x: 15.2, z: 9.5 }, // 20 site B
  { x: 18, z: 4.5 }, // 21 site B east
  { x: 13.5, z: -13.8 }, // 22 north gap (behind boxcar 2)
  { x: -10, z: 13.8 }, // 23 south gap (behind boxcar 3)
  { x: 0, z: -4.5 }, // 24 center north
  { x: 0, z: 4.5 }, // 25 center south
  { x: -11, z: 4 }, // 26 west mid
  { x: 12, z: -2 }, // 27 east mid
  { x: -12.5, z: -11.5 }, // 28 defender hold A
  { x: 18.5, z: 9.5 }, // 29 defender hold B (east gap)
  { x: 6, z: 8 }, // 30 defender hold mid-south
  { x: 12, z: 9.5 }, // 31 site B west gap
];

/** Hand-checked edges: [a, b] pairs that a bot may walk between. */
export const EDGES = [
  [0, 3], [0, 26], [1, 3], [1, 26], [2, 26], [2, 15],
  [3, 4], [3, 5], [4, 5], [4, 28], [5, 28], [5, 6],
  [6, 7], [7, 8], [8, 9], [9, 10], [9, 22], [10, 22], [10, 27], [10, 19],
  [7, 11], [8, 11], [9, 11], [11, 24],
  [24, 12], [24, 13], [12, 26], [12, 25], [13, 25], [13, 27],
  [25, 14], [25, 17], [14, 15], [14, 18], [14, 16], [14, 30],
  [15, 16], [16, 17], [17, 18], [18, 19], [18, 27], [18, 30], [18, 31],
  [19, 21], [19, 30], [21, 27],
  [31, 20], [29, 20],
  [15, 23], [26, 15], [6, 26],
];

/** Spawn points: [x, z, yaw]. Yaw 0 faces north (-z); -PI/2 faces east (+x). */
export const SPAWNS = {
  atk: [
    [-18.5, -2, -Math.PI / 2],
    [-18.5, 0.5, -Math.PI / 2],
    [-18.5, 3, -Math.PI / 2],
    [-17, -0.5, -Math.PI / 2],
  ],
  def: [
    [-13, -9, Math.PI],
    [-11, -7, -Math.PI / 2],
    [13, 5, 0],
    [18.5, 9.5, Math.PI / 2],
    [2, 6, Math.PI / 2],
  ],
};

/** The nav graph: adjacency lists built once from WAYPOINTS + EDGES. */
export function buildGraph() {
  const adj = WAYPOINTS.map(() => []);
  for (const [a, b] of EDGES) {
    if (a < 0 || a >= WAYPOINTS.length || b < 0 || b >= WAYPOINTS.length) {
      throw new Error(`RAILHEAD: nav edge [${a}, ${b}] names a missing waypoint`);
    }
    adj[a].push(b);
    adj[b].push(a);
  }
  return adj;
}

const GRAPH = buildGraph();

/** Breadth-first route from waypoint `from` to waypoint `to` (inclusive). */
export function bfsRoute(from, to) {
  if (from === to) return [from];
  const prev = new Array(WAYPOINTS.length).fill(-1);
  const queue = [from];
  prev[from] = from;
  while (queue.length > 0) {
    const cur = queue.shift();
    for (const next of GRAPH[cur]) {
      if (prev[next] !== -1) continue;
      prev[next] = cur;
      if (next === to) {
        const path = [to];
        let node = to;
        while (node !== from) {
          node = prev[node];
          path.push(node);
        }
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return [];
}

/** Index of the waypoint nearest (x, z). */
export function nearestWaypoint(x, z) {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < WAYPOINTS.length; i++) {
    const w = WAYPOINTS[i];
    const d = (w.x - x) * (w.x - x) + (w.z - z) * (w.z - z);
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

/** Is the ground point (x, z) inside a walk-blocking collider? */
export function pointBlocked(x, z) {
  for (const box of COLLIDERS) {
    if (!blocksWalk(box)) continue;
    if (pointInBox2D(x, z, box, 0.36)) return true;
  }
  return false;
}

/**
 * Ray vs the world: the nearest collider the ray hits, or null.
 * Returns { t, box } with t in ray units (direction need not be unit).
 */
export function worldHit(ox, oy, oz, dx, dy, dz, maxDist) {
  let bestT = maxDist;
  let bestBox = null;
  for (const box of COLLIDERS) {
    const t = rayBox(ox, oy, oz, dx, dy, dz, box);
    if (t < bestT) {
      bestT = t;
      bestBox = box;
    }
  }
  return bestBox === null ? null : { t: bestT, box: bestBox };
}

/** Is the ground-plane sight line (ax,az)-(bx,bz) blocked by a tall box? */
export function losBlocked(ax, az, bx, bz) {
  for (const box of COLLIDERS) {
    if (segmentBlocksSight(ax, az, bx, bz, box)) return true;
  }
  return false;
}

// ---------------------------------------------------------------- meshes

const PALETTE = {
  ground: 0x3a3733,
  wall: 0x5a5348,
  wallDark: 0x453f36,
  shed: 0x6b4a35,
  boxcarRust: 0x7a4a2e,
  boxcarTeal: 0x2e5a58,
  boxcarGrey: 0x5c6066,
  containerRed: 0x8a3b2e,
  containerBlue: 0x2e4a6b,
  containerGreen: 0x3d5a34,
  containerYellow: 0x8a6d2e,
  crate: 0x7d6a4a,
  pillar: 0x4a4640,
  signal: 0x3f4a3a,
  rail: 0x2b2b2e,
  lamp: 0xffb45e,
};

/** A canvas texture for the ground: asphalt, rails, yard markings, site letters. */
function groundTexture(THREE) {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 768;
  const g = c.getContext('2d');
  g.fillStyle = '#3a3733';
  g.fillRect(0, 0, 1024, 768);
  // Asphalt speckle.
  for (let i = 0; i < 9000; i++) {
    const v = 40 + Math.floor(Math.random() * 40);
    g.fillStyle = `rgb(${v},${v - 4},${v - 8})`;
    g.fillRect(Math.random() * 1024, Math.random() * 768, 2, 2);
  }
  const px = (x) => ((x + 20) / 40) * 1024;
  const pz = (z) => ((z + 15) / 30) * 768;
  // Rail beds: dark strips with two steel lines.
  const bed = (z0, z1) => {
    g.fillStyle = '#2c2a28';
    g.fillRect(0, pz(z0), 1024, pz(z1) - pz(z0));
    g.fillStyle = '#565660';
    g.fillRect(0, pz(z0) + 6, 1024, 3);
    g.fillRect(0, pz(z1) - 9, 1024, 3);
  };
  bed(-13.4, -10.6);
  bed(10.6, 13.4);
  // Crossing walkway.
  g.fillStyle = '#46423c';
  g.fillRect(px(-1.8), 0, px(1.8) - px(-1.8), 768);
  // Site outlines + letters.
  g.strokeStyle = '#c9a13b';
  g.lineWidth = 5;
  g.strokeRect(px(-18), pz(-13), px(-12) - px(-18), pz(-7) - pz(-13));
  g.strokeRect(px(14), pz(8.8), px(16.5) - px(14), pz(10.3) - pz(8.8));
  g.fillStyle = 'rgba(201,161,59,0.85)';
  g.font = 'bold 120px sans-serif';
  g.textAlign = 'center';
  g.fillText('A', px(-15), pz(-8.5));
  g.fillText('B', px(15.2), pz(9.5));
  // Hazard stripes at the shed entrance.
  g.fillStyle = '#c9a13b';
  for (let i = 0; i < 6; i++) {
    g.save();
    g.translate(px(-15 + i * 0.9), pz(-5.2));
    g.rotate(0.6);
    g.fillRect(-8, -3, 16, 6);
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** A canvas texture with a big letter, for the site sign boards. */
function letterTexture(THREE, letter, bg, fg) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = bg;
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = fg;
  g.lineWidth = 6;
  g.strokeRect(6, 6, 116, 116);
  g.fillStyle = fg;
  g.font = 'bold 84px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(letter, 64, 70);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function boxMesh(THREE, scene, mat, x0, z0, x1, z1, y0, y1, cast = true) {
  const w = x1 - x0;
  const d = z1 - z0;
  const h = y1 - y0;
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  mesh.position.set((x0 + x1) / 2, y0 + h / 2, (z0 + z1) / 2);
  mesh.castShadow = cast;
  mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}

/**
 * Build every mesh of the yard into `scene`. `THREE` is the three.js module
 * (passed in so this file never imports it itself). Returns { lampLights }.
 */
export function buildYardMeshes(THREE, scene, rng) {
  const mats = {};
  const mat = (color, rough = 0.9) => {
    const key = `${color}:${rough}`;
    if (!mats[key]) mats[key] = new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0.08 });
    return mats[key];
  };

  // Dawn sky + haze.
  scene.background = new THREE.Color(0x2e2823);
  scene.fog = new THREE.Fog(0x2e2823, 42, 95);

  // Ground.
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(MAP_W, MAP_H),
    new THREE.MeshStandardMaterial({ map: groundTexture(THREE), roughness: 0.95, metalness: 0 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  // Perimeter walls.
  for (const box of COLLIDERS) {
    if (box.kind !== 'wall') continue;
    if (box.x0 < -19.9 || box.x1 > 19.9 || box.z0 < -14.9 || box.z1 > 14.9) {
      boxMesh(THREE, scene, mat(PALETTE.wall), box.x0, box.z0, box.x1, box.z1, box.y0, box.y1);
    }
  }

  // Engine Shed: east wall + south stub + roof slab + big A sign.
  boxMesh(THREE, scene, mat(PALETTE.shed), -10.6, -14.4, -10, -5, 0, 3.5);
  boxMesh(THREE, scene, mat(PALETTE.shed), -19.4, -5.6, -15, -5, 0, 3.5);
  boxMesh(THREE, scene, mat(PALETTE.wallDark), -19.4, -14.4, -10, -5, 3.5, 3.75, false);
  const signA = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2),
    new THREE.MeshBasicMaterial({ map: letterTexture(THREE, 'A', '#241f1a', '#c9a13b') })
  );
  signA.position.set(-12.5, 4.6, -4.9);
  scene.add(signA);

  // Boxcars: body, roof, wheels.
  const boxcarColors = [PALETTE.boxcarRust, PALETTE.boxcarTeal, PALETTE.boxcarGrey];
  let bi = 0;
  for (const box of COLLIDERS) {
    if (box.kind !== 'boxcar') continue;
    const color = boxcarColors[bi++ % boxcarColors.length];
    boxMesh(THREE, scene, mat(color, 0.75), box.x0, box.z0, box.x1, box.z1, box.y0, box.y1);
    boxMesh(THREE, scene, mat(PALETTE.wallDark, 0.6), box.x0 + 0.15, box.z0 + 0.15, box.x1 - 0.15, box.z1 - 0.15, box.y1, box.y1 + 0.25, false);
    const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.2, 12);
    const wheelMat = mat(0x1c1c1e, 0.5);
    for (const wx of [box.x0 + 1, box.x1 - 1]) {
      for (const wz of [box.z0 + 0.1, box.z1 - 0.1]) {
        const wheel = new THREE.Mesh(wheelGeo, wheelMat);
        wheel.rotation.x = Math.PI / 2;
        wheel.position.set(wx, 0.42, wz);
        scene.add(wheel);
      }
    }
  }

  // Containers, with a second container stacked on one of them.
  const containerColors = [PALETTE.containerRed, PALETTE.containerBlue, PALETTE.containerGreen, PALETTE.containerYellow];
  let ci = 0;
  for (const box of COLLIDERS) {
    if (box.kind !== 'container') continue;
    const color = containerColors[ci++ % containerColors.length];
    boxMesh(THREE, scene, mat(color, 0.8), box.x0, box.z0, box.x1, box.z1, box.y0, box.y1);
    boxMesh(THREE, scene, mat(PALETTE.wallDark, 0.6), box.x0, box.z0, box.x1, box.z1, box.y1, box.y1 + 0.12, false);
  }
  boxMesh(THREE, scene, mat(PALETTE.containerBlue, 0.8), 11, 10.5, 13.6, 13.6, 2.6, 5.2);
  const signB = new THREE.Mesh(
    new THREE.PlaneGeometry(2.2, 2.2),
    new THREE.MeshBasicMaterial({ map: letterTexture(THREE, 'B', '#241f1a', '#c9a13b') })
  );
  signB.position.set(14.5, 3.4, 5.8);
  scene.add(signB);

  // Signal box: walls from the collider list, plus a roof slab.
  for (const box of COLLIDERS) {
    if (box.kind !== 'wall') continue;
    const inside =
      box.x0 >= -2 && box.x1 <= 2 && box.z0 >= -2 && box.z1 <= 2;
    if (inside) boxMesh(THREE, scene, mat(PALETTE.signal), box.x0, box.z0, box.x1, box.z1, box.y0, box.y1);
  }
  boxMesh(THREE, scene, mat(PALETTE.wallDark), -2.2, -2.2, 2.2, 2.2, 3, 3.25, false);

  // Pillars and crates.
  for (const box of COLLIDERS) {
    if (box.kind === 'pillar') {
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, box.y1, 10), mat(PALETTE.pillar));
      pillar.position.set((box.x0 + box.x1) / 2, box.y1 / 2, (box.z0 + box.z1) / 2);
      pillar.castShadow = true;
      pillar.receiveShadow = true;
      scene.add(pillar);
    } else if (box.kind === 'crate') {
      boxMesh(THREE, scene, mat(PALETTE.crate, 0.95), box.x0, box.z0, box.x1, box.z1, box.y0, box.y1);
    }
  }

  // Lamp posts with warm sodium heads; two carry real point lights.
  const lampPositions = [
    [-16, -2], [6, -12], [-6, 12], [16, 0],
  ];
  const lampLights = [];
  lampPositions.forEach(([lx, lz], i) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.12, 5.2, 8), mat(0x222226, 0.5));
    pole.position.set(lx, 2.6, lz);
    pole.castShadow = true;
    scene.add(pole);
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.22, 10, 8),
      new THREE.MeshBasicMaterial({ color: PALETTE.lamp })
    );
    head.position.set(lx, 5.25, lz);
    scene.add(head);
    if (i < 2) {
      const light = new THREE.PointLight(0xffa54d, 18, 22, 1.6);
      light.position.set(lx, 5, lz);
      scene.add(light);
      lampLights.push(light);
    }
  });

  // Dawn sun (low, warm) + sky fill.
  const sun = new THREE.DirectionalLight(0xffd9a0, 2.4);
  sun.position.set(-28, 18, -12);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -26;
  sun.shadow.camera.right = 26;
  sun.shadow.camera.top = 22;
  sun.shadow.camera.bottom = -22;
  sun.shadow.camera.far = 80;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x8a7a66, 0x2a241e, 0.85));

  return { lampLights };
}
