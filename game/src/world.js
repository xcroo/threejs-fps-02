// The world: turns MAP's boxes into meshes, lights the yard at dusk, and hands back
// the colliders a bullet stops on and the meshes a bullet can hit. Materials are shared
// per palette name, geometries per box size, so the scene builds once and never
// allocates in the frame loop.
//
// Rewritten in session for the threejs-fps-02 entry (transcript coverage).
// Revised once after the first write: the rewrite note now names the right entry.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { MAP } from './mapdata.js';

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' || name === 'ink' ? 0.55 : 0.92,
      metalness: 0.04,
    });
  }
  // Amber containers read as painted steel; dark crates as matte timber.
  materials.accent.roughness = 0.6;
  materials.accent.metalness = 0.25;

  const geometryCache = new Map();
  function geometryFor(w, h, d) {
    const key = `${w}|${h}|${d}`;
    let geometry = geometryCache.get(key);
    if (!geometry) {
      geometry = new THREE.BoxGeometry(w, h, d);
      geometryCache.set(key, geometry);
    }
    return geometry;
  }

  const colliders = [];
  const shootables = [];
  for (const [w, h, d, x, y, z, material] of MAP.boxes) {
    const mesh = new THREE.Mesh(geometryFor(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    // The floor is ground, not a wall: it still collides, but a bullet through the
    // floor is not a hit the game cares about, so it stays out of shootables.
    if (y > 0) shootables.push(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
  }

  // Site markers: a glowing ring on the floor and a floating letter, so a player
  // reads where the bomb goes without a tutorial.
  const siteMarkers = {};
  for (const [key, site] of Object.entries(MAP.sites)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.radius - 0.18, site.radius, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.75, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.center[0], 0.03, site.center[1]);
    group.add(ring);
    const disc = new THREE.Mesh(
      new THREE.CircleGeometry(site.radius, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.08, side: THREE.DoubleSide }),
    );
    disc.rotation.x = -Math.PI / 2;
    disc.position.set(site.center[0], 0.02, site.center[1]);
    group.add(disc);
    siteMarkers[key] = { ring, disc };
  }

  // Sodium lamps: a pole, a head and a warm point light each.
  const lampMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.6, metalness: 0.4 });
  const headMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) });
  const poleGeometry = new THREE.CylinderGeometry(0.07, 0.09, 3.4, 8);
  const headGeometry = new THREE.BoxGeometry(0.5, 0.12, 0.24);
  for (const [x, y, z] of MAP.lamps) {
    const pole = new THREE.Mesh(poleGeometry, lampMaterial);
    pole.position.set(x, 1.7, z);
    pole.castShadow = true;
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.set(x, y, z);
    const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 14, 16, 1.8);
    light.position.set(x, y - 0.2, z);
    group.add(pole, head, light);
  }

  // Light: a low amber sun from the west, a cool sky fill, and a hemisphere gradient.
  const sky = new THREE.HemisphereLight(new THREE.Color('#3a4a66'), new THREE.Color(PALETTE.canvas), 1.5);
  scene.add(sky);
  const sun = new THREE.DirectionalLight(new THREE.Color('#ffb35c'), 2.8);
  sun.position.set(-22, 12, 10);
  sun.target.position.set(4, 0, -4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -24;
  sun.shadow.camera.right = 24;
  sun.shadow.camera.top = 24;
  sun.shadow.camera.bottom = -24;
  sun.shadow.camera.far = 70;
  sun.shadow.bias = -0.0006;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(new THREE.Color('#7a8cb0'), 0.9);
  fill.position.set(14, 10, 12);
  scene.add(fill);

  return { colliders, shootables, group, siteMarkers };
}
