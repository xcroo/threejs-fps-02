// Combat: hitscan shots, tracers, impacts, grenades and smoke. One raycaster is
// reused for every shot, tracers and impacts come from fixed pools, and grenades
// bounce off the world's boxes with a single shared AABB test. Damage is reported
// back through a callback so this module never owns health.
//
// Rewritten in session for the threejs-fps-02 entry (transcript coverage).
// Revised once after the first write: the rewrite note now names the right entry.
import * as THREE from 'three';

const TRACER_POOL = 14;
const IMPACT_POOL = 20;
const TRACER_LIFE = 0.09;
const IMPACT_LIFE = 0.35;

export function createCombat(scene, shootables) {
  const raycaster = new THREE.Raycaster();
  raycaster.far = 120;
  const direction = new THREE.Vector3();
  const point = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const centre = new THREE.Vector3();

  // Tracer pool: thin cylinders stretched muzzle to hit, faded over 90 ms.
  const tracerGeometry = new THREE.CylinderGeometry(0.012, 0.012, 1, 5);
  const tracerMaterial = new THREE.MeshBasicMaterial({ color: 0xffc46b, transparent: true, opacity: 0.9 });
  const tracers = [];
  for (let i = 0; i < TRACER_POOL; i += 1) {
    const mesh = new THREE.Mesh(tracerGeometry, tracerMaterial.clone());
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, life: 0 });
  }
  let tracerIndex = 0;
  function spawnTracer(from, to) {
    const slot = tracers[tracerIndex];
    tracerIndex = (tracerIndex + 1) % TRACER_POOL;
    const length = from.distanceTo(to);
    if (length < 0.5) return;
    slot.mesh.visible = true;
    slot.mesh.position.copy(from).add(to).multiplyScalar(0.5);
    slot.mesh.scale.set(1, length, 1);
    tmp.copy(to).sub(from).normalize();
    slot.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tmp);
    slot.life = TRACER_LIFE;
  }

  // Impact pool: small sparks that grow and fade where a bullet lands.
  const impactGeometry = new THREE.SphereGeometry(0.05, 8, 6);
  const impactMaterial = new THREE.MeshBasicMaterial({ color: 0xffd98a, transparent: true, opacity: 0.95 });
  const impacts = [];
  for (let i = 0; i < IMPACT_POOL; i += 1) {
    const mesh = new THREE.Mesh(impactGeometry, impactMaterial.clone());
    mesh.visible = false;
    scene.add(mesh);
    impacts.push({ mesh, life: 0 });
  }
  let impactIndex = 0;
  function spawnImpact(at, kill) {
    const slot = impacts[impactIndex];
    impactIndex = (impactIndex + 1) % IMPACT_POOL;
    slot.mesh.visible = true;
    slot.mesh.position.copy(at);
    slot.mesh.scale.setScalar(kill ? 2.2 : 1);
    slot.life = IMPACT_LIFE;
  }

  // Explosion flash: one reusable sphere and light.
  const blast = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xffb14d, transparent: true, opacity: 0, depthWrite: false }),
  );
  blast.visible = false;
  scene.add(blast);
  const blastLight = new THREE.PointLight(0xff9a2e, 0, 18, 1.6);
  scene.add(blastLight);
  let blastLife = 0;

  const grenades = [];
  const smokes = [];
  const smokeMaterial = new THREE.MeshBasicMaterial({ color: 0x9aa2ad, transparent: true, opacity: 0.32, depthWrite: false });
  const smokeGeometry = new THREE.SphereGeometry(1, 12, 10);

  // One hitscan ray. Returns the first thing it meets: a fighter part (with its
  // owner and part) or a wall (fighter null). The caller decides the damage.
  function fire(origin, dir, targets) {
    direction.copy(dir);
    raycaster.set(origin, direction);
    const hits = raycaster.intersectObjects(targets, false);
    const hit = hits[0];
    if (!hit) {
      point.copy(origin).addScaledVector(direction, 100);
      spawnTracer(origin, point);
      return null;
    }
    spawnTracer(origin, hit.point);
    const fighter = hit.object.userData.fighter;
    if (fighter) return { fighter, part: hit.object.userData.part, point: hit.point.clone(), distance: hit.distance };
    spawnImpact(hit.point, false);
    return { fighter: null, part: 'wall', point: hit.point.clone(), distance: hit.distance };
  }

  function firePellets(origin, baseDir, spread, count, random, targets) {
    const results = [];
    for (let i = 0; i < count; i += 1) {
      tmp.copy(baseDir);
      tmp.x += (random() * 2 - 1) * spread;
      tmp.y += (random() * 2 - 1) * spread;
      tmp.z += (random() * 2 - 1) * spread;
      tmp.normalize();
      const result = fire(origin, tmp, targets);
      if (result && result.fighter) results.push(result);
    }
    return results;
  }

  function addGrenade(grenade) {
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), new THREE.MeshStandardMaterial({ color: 0x2c323a, roughness: 0.5, metalness: 0.5 }));
    mesh.position.copy(grenade.position);
    scene.add(mesh);
    grenade.mesh = mesh;
    grenades.push(grenade);
  }

  function detonate(at, damageFn) {
    blast.visible = true;
    blast.position.copy(at);
    blast.scale.setScalar(0.5);
    blastLife = 0.3;
    blastLight.position.copy(at);
    blastLight.intensity = 60;
    damageFn(at, 6.5, 100, 15);
  }

  function explode(grenade, damageFn) {
    const at = grenade.position;
    scene.remove(grenade.mesh);
    if (grenade.kind === 'smoke') {
      for (let i = 0; i < 5; i += 1) {
        const puff = new THREE.Mesh(smokeGeometry, smokeMaterial.clone());
        puff.position.set(at.x + (Math.sin(i * 2.4) * 1.6), 1.1 + (i % 2) * 0.7, at.z + (Math.cos(i * 2.4) * 1.6));
        puff.scale.setScalar(2.2);
        scene.add(puff);
        smokes.push({ mesh: puff, expiresAt: grenade.age + 14 });
      }
      return;
    }
    detonate(at, damageFn);
  }

  function step(dt, time, damageFn, colliders) {
    for (const slot of tracers) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      slot.mesh.material.opacity = Math.max(0, slot.life / TRACER_LIFE) * 0.9;
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    for (const slot of impacts) {
      if (slot.life <= 0) continue;
      slot.life -= dt;
      const k = Math.max(0, slot.life / IMPACT_LIFE);
      slot.mesh.material.opacity = k * 0.95;
      slot.mesh.scale.setScalar(1 + (1 - k) * 2);
      if (slot.life <= 0) slot.mesh.visible = false;
    }
    if (blastLife > 0) {
      blastLife -= dt;
      const k = Math.max(0, blastLife / 0.3);
      blast.scale.setScalar(0.5 + (1 - k) * 6);
      blast.material.opacity = k * 0.55;
      blastLight.intensity = k * 60;
      if (blastLife <= 0) {
        blast.visible = false;
        blastLight.intensity = 0;
      }
    }
    for (let i = smokes.length - 1; i >= 0; i -= 1) {
      if (time < smokes[i].expiresAt) continue;
      scene.remove(smokes[i].mesh);
      smokes.splice(i, 1);
    }
    for (let i = grenades.length - 1; i >= 0; i -= 1) {
      const g = grenades[i];
      g.age += dt;
      g.velocity.y -= 20 * dt;
      g.position.addScaledVector(g.velocity, dt);
      // Floor bounce.
      if (g.position.y < 0.09) {
        g.position.y = 0.09;
        g.velocity.y = Math.abs(g.velocity.y) * 0.42;
        g.velocity.x *= 0.7;
        g.velocity.z *= 0.7;
      }
      // Box bounce: push out along the smallest penetration and reflect.
      for (const box of colliders) {
        tmp.copy(g.position);
        box.getCenter(centre);
        const hx = (box.max.x - box.min.x) / 2 + 0.09;
        const hy = (box.max.y - box.min.y) / 2 + 0.09;
        const hz = (box.max.z - box.min.z) / 2 + 0.09;
        const dx = tmp.x - centre.x;
        const dy = tmp.y - centre.y;
        const dz = tmp.z - centre.z;
        if (Math.abs(dx) < hx && Math.abs(dy) < hy && Math.abs(dz) < hz) {
          const px = hx - Math.abs(dx);
          const py = hy - Math.abs(dy);
          const pz = hz - Math.abs(dz);
          if (px <= py && px <= pz) {
            g.position.x = centre.x + Math.sign(dx) * hx;
            g.velocity.x = -g.velocity.x * 0.45;
          } else if (py <= pz) {
            g.position.y = centre.y + Math.sign(dy) * hy;
            g.velocity.y = -g.velocity.y * 0.45;
          } else {
            g.position.z = centre.z + Math.sign(dz) * hz;
            g.velocity.z = -g.velocity.z * 0.45;
          }
        }
      }
      g.mesh.position.copy(g.position);
      if (g.age >= g.fuse) {
        grenades.splice(i, 1);
        explode(g, damageFn);
      }
    }
  }

  // True when the segment a->b passes through a smoke cloud: bots cannot see
  // through smoke, and neither can the player's crosshair check.
  function smokeBlocks(a, b) {
    for (const smoke of smokes) {
      const centre = smoke.mesh.position;
      tmp.copy(b).sub(a);
      const lengthSq = tmp.lengthSq();
      if (lengthSq === 0) continue;
      const t = Math.max(0, Math.min(1, tmp2.copy(centre).sub(a).dot(tmp) / lengthSq));
      tmp2.copy(a).addScaledVector(tmp, t);
      if (tmp2.distanceTo(centre) < 2.2) return true;
    }
    return false;
  }

  return { fire, firePellets, addGrenade, detonate, step, smokeBlocks, spawnImpact };
}
