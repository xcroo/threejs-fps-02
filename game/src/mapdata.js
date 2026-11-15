// Emberworks map data: one source of truth for geometry, spawns, bombsites and the bot
// navigation graph. All boxes are axis-aligned; [w, h, d, x, y, z, material] with y the
// centre height. The yard is 36 x 28 m: attackers spawn south, defenders north, Site A
// (Turbine Hall) west, Site B (Tank Farm) east, three lanes (A-long, mid, B-long) joined
// by a mid window wall the defenders must watch. Crates sit between the lanes, never on
// a waypoint edge, so bots can walk every edge of the graph.
//
// Rewritten in session for the threejs-fps-02 entry (transcript coverage).
// Revised once after the first write: the rewrite note now names the right entry.
export const MAP = {
  bounds: { minX: -18, maxX: 18, minZ: -14, maxZ: 14 },
  sites: {
    A: { name: 'Turbine Hall', center: [-13.5, -9.5], radius: 2.6 },
    B: { name: 'Tank Farm', center: [13.5, -9.5], radius: 2.6 },
  },
  spawns: {
    atk: [[-2, 12], [0, 12.5], [2, 12], [-4, 11]],
    def: [[-12, -11.5], [0, -11.5], [7, -12.5], [-5, -12], [5, -12]],
  },
  // [w, h, d, x, y, z, material]
  boxes: [
    // Floor and perimeter (5 m walls).
    [36.4, 0.4, 28.4, 0, -0.2, 0, 'surface'],
    [36.4, 5, 0.4, 0, 2.5, -14.2, 'surface'],
    [36.4, 5, 0.4, 0, 2.5, 14.2, 'surface'],
    [0.4, 5, 28.4, -18.2, 2.5, 0, 'surface'],
    [0.4, 5, 28.4, 18.2, 2.5, 0, 'surface'],
    // Site A hall: south wall (gap x -13..-10) and east wall (gap z -9.5..-7).
    [5, 3.2, 0.4, -15.5, 1.6, -4, 'surface'],
    [2, 3.2, 0.4, -9, 1.6, -4, 'surface'],
    [0.4, 3.2, 4.5, -8, 1.6, -11.75, 'surface'],
    [0.4, 3.2, 3, -8, 1.6, -5.5, 'surface'],
    // Turbine block and hall pillar.
    [3.2, 2.0, 2.2, -14.5, 1.0, -12, 'hairline'],
    [1.0, 3.2, 1.0, -10.5, 1.6, -12, 'hairline'],
    [1.2, 1.1, 1.2, -15, 0.55, -7, 'hairline'],
    // Site B containers (Tank Farm).
    [4, 2.6, 2.4, 14, 1.3, -12, 'accent'],
    [4, 2.6, 2.4, 14, 3.9, -12, 'surface'],
    [2.6, 2.6, 5, 15.5, 1.3, -6.5, 'surface'],
    [2.4, 2.6, 2.4, 9.5, 1.3, -11.5, 'hairline'],
    [1.2, 1.1, 1.2, 9.5, 0.55, -6, 'hairline'],
    // Mid window wall at z = 0: pillars, lintel and sill leave a 2 x 1 m window
    // at eye height. You can shoot through it; you cannot walk through it.
    [2, 3.2, 0.4, -2, 1.6, 0, 'surface'],
    [2, 3.2, 0.4, 2, 1.6, 0, 'surface'],
    [2, 1.3, 0.4, 0, 2.55, 0, 'surface'],
    [2, 0.9, 0.4, 0, 0.45, 0, 'surface'],
    // Mid crates.
    [1.2, 1.1, 1.2, -4.5, 0.55, 2.5, 'hairline'],
    [1.2, 1.1, 1.2, 4.5, 0.55, 2.5, 'hairline'],
    [0.8, 0.7, 0.8, -3.5, 0.35, -5, 'hairline'],
    [0.8, 0.7, 0.8, 3.5, 0.35, -6.5, 'hairline'],
    // A-long cover (west lane, inset from the wall so the lane stays walkable).
    [1.2, 1.1, 1.2, -14.5, 0.55, 5, 'hairline'],
    [1.2, 1.1, 1.2, -14.5, 0.55, -0.5, 'hairline'],
    [0.8, 0.7, 0.8, -12, 0.35, 10.5, 'hairline'],
    // B-long cover (east lane).
    [1.2, 1.1, 1.2, 14.5, 0.55, 5, 'hairline'],
    [1.2, 1.1, 1.2, 14.5, 0.55, -0.5, 'hairline'],
    [0.8, 0.7, 0.8, 12, 0.35, 10.5, 'hairline'],
    // South approach crates.
    [1.2, 1.1, 1.2, -8, 0.55, 8, 'hairline'],
    [1.2, 1.1, 1.2, 8, 0.55, 8, 'hairline'],
    // North approach crates.
    [1.2, 1.1, 1.2, -7, 0.55, -6, 'hairline'],
    [1.2, 1.1, 1.2, 7, 0.55, -6, 'hairline'],
  ],
  // Sodium lamps (point lights) and their poles.
  lamps: [
    [-13.5, 3.4, -9.5],
    [13.5, 3.4, -9.5],
    [0, 3.4, 0],
    [-16, 3.4, 6],
    [16, 3.4, 6],
    [0, 3.4, 11],
  ],
  // Bot navigation graph. Nodes are [x, z]; edges are index pairs whose straight line
  // is clear of walls. Bots pathfind with breadth-first search over this graph.
  waypoints: [
    [0, 12], // 0 atk spawn
    [0, 8], // 1 atk exit
    [0, 4], // 2 mid south
    [-5, 0], // 3 mid west
    [5, 0], // 4 mid east
    [0, -4], // 5 mid north
    [-11.5, -2], // 6 A gap approach
    [-11.5, -6.5], // 7 A entry
    [-13.5, -9.5], // 8 A site
    [-16, 7], // 9 A-long south
    [-16, -2], // 10 A-long north
    [8, -4], // 11 B approach
    [12, -4], // 12 B entry west
    [12, -7], // 13 B entry south
    [13.5, -9.5], // 14 B site
    [16, 7], // 15 B-long south
    [16, -2], // 16 B-long north
    [0, -11], // 17 def spawn
    [-11, -11], // 18 A hold
    [7, -9.5], // 19 B hold
    [-2, -7], // 20 mid hold
    [-5, -6.75], // 21 A corner
    [6, -10], // 22 B corner
    [-8, 10], // 23 atk west
    [8, 10], // 24 atk east
    [-8, -8.25], // 25 A gap (doorway through the east wall)
  ],
  edges: [
    [0, 1], [0, 23], [0, 24], [1, 2], [1, 23], [1, 24],
    [2, 3], [2, 4], [2, 9], [2, 15], [3, 5], [3, 6], [4, 5], [4, 11],
    [5, 6], [5, 11], [5, 17], [5, 20], [6, 7], [7, 8], [7, 18],
    [8, 18], [8, 25], [9, 10], [9, 23], [10, 6], [11, 12], [11, 20],
    [12, 13], [13, 14], [13, 22], [14, 19], [14, 22],
    [15, 16], [15, 24], [16, 11], [17, 19], [17, 20],
    [18, 25], [19, 22], [20, 21], [20, 22], [21, 25], [22, 14], [7, 25],
  ],
};
