// RAILHEAD — shots.js: cinematic screenshot modes.
//
// ?shot=start|play|plant|end&seed=N warms the simulation for 2.5 s with the
// seeded RNG, frames a fixed camera, hides the view model and the HUD
// overlays, and sets window.__shotReady when the frame is settled. The
// screenshot tool waits for that flag. Shot mode never plays: the player is
// frozen and the camera is cinematic.

export function setupShots(game) {
  const params = new URLSearchParams(window.location.search);
  const mode = params.get('shot');
  if (!mode) return null;
  const seed = Number(params.get('seed') ?? 7);

  game.cinematic = true;
  game.setViewVisible(false);
  game.hideOverlays();

  const lookAt = (x, y, z, tx, ty, tz) => {
    game.camera.position.set(x, y, z);
    game.camera.lookAt(tx, ty, tz);
  };

  if (mode === 'start') {
    // Wide view from the attacker spawn, down the North Track toward the shed.
    lookAt(-18.5, 2.6, 2.5, 0, 1.2, -8);
  } else if (mode === 'play') {
    // Mid crossing, live round: bots have walked 2.5 s toward the sites.
    game.forceLive();
    game.warmSim(2.5, seed);
    lookAt(1.5, 2.2, 7.5, -6, 1.4, -6);
    game.fireTracerForShot();
  } else if (mode === 'plant') {
    // Site A, charge planted, defenders converging on the shed.
    game.forceLive();
    game.plantForShot('A');
    game.warmSim(2.5, seed);
    lookAt(-7.5, 2.4, -1.5, -15, 1.2, -10);
  } else if (mode === 'end') {
    // High overview of the whole yard, match score 5:3.
    game.match.score.atk = 5;
    game.match.score.def = 3;
    game.match.phase = 'matchover';
    lookAt(0, 19, 17, 0, 0, -2);
  } else {
    // An unknown ?shot= value falls back to the start view rather than
    // leaving the screenshot tool waiting on a flag that never comes.
    lookAt(-18.5, 2.6, 2.5, 0, 1.2, -8);
  }

  game.renderOnce();
  window.__shotReady = true;
  return mode;
}
