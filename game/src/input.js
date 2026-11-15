// Input: keyboard state, mouse look, fire and aim buttons, and pointer lock. The
// module owns no game logic; it reports what the player did this frame, including
// edges (keys pressed once) so a single tap buys one rifle, not ten.
//
// Rewritten in session for the threejs-fps-02 entry (transcript coverage).
// Revised once after the first write: the rewrite note now names the right entry.
export function createInput(document, canvas) {
  const keys = new Set();
  const pressed = new Set();
  const state = {
    mouseDX: 0,
    mouseDY: 0,
    firing: false,
    aiming: false,
    locked: false,
    hasLocked: false,
  };
  let wheelDelta = 0;

  document.addEventListener('keydown', (event) => {
    if (!keys.has(event.code)) pressed.add(event.code);
    keys.add(event.code);
    if (event.code === 'Space') event.preventDefault();
  });
  document.addEventListener('keyup', (event) => keys.delete(event.code));
  document.addEventListener('mousemove', (event) => {
    if (!state.locked) return;
    state.mouseDX += event.movementX;
    state.mouseDY += event.movementY;
  });
  document.addEventListener('mousedown', (event) => {
    if (!state.locked) return;
    if (event.button === 0) {
      state.firing = true;
      pressed.add('Mouse0');
    }
    if (event.button === 2) state.aiming = true;
  });
  document.addEventListener('mouseup', (event) => {
    if (event.button === 0) state.firing = false;
    if (event.button === 2) state.aiming = false;
  });
  document.addEventListener('wheel', (event) => {
    wheelDelta += Math.sign(event.deltaY);
  });
  document.addEventListener('contextmenu', (event) => event.preventDefault());
  document.addEventListener('pointerlockchange', () => {
    state.locked = document.pointerLockElement === canvas;
    if (state.locked) state.hasLocked = true;
    if (!state.locked) {
      state.firing = false;
      state.aiming = false;
    }
  });
  window.addEventListener('blur', () => {
    keys.clear();
    state.firing = false;
    state.aiming = false;
  });

  return {
    keys,
    state,
    lock() {
      canvas.requestPointerLock();
    },
    // Consume this frame's mouse delta; the game reads it once per frame.
    takeMouse() {
      const dx = state.mouseDX;
      const dy = state.mouseDY;
      state.mouseDX = 0;
      state.mouseDY = 0;
      return { dx, dy };
    },
    takeWheel() {
      const delta = wheelDelta;
      wheelDelta = 0;
      return delta;
    },
    wasPressed(code) {
      return pressed.has(code);
    },
    endFrame() {
      pressed.clear();
    },
  };
}
