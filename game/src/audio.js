// Audio: a tiny WebAudio synth, no sound files. Shots are a filtered noise burst
// with a low thump, hits a short tick, reloads a pair of clicks, the plant a rising
// beep, and the round end a two-note horn. Distance attenuates a shot by moving it
// through a gain node, so a far firefight still reads.
//
// Rewritten in session for the threejs-fps-02 entry (transcript coverage).
// Revised once after the first write: the rewrite note now names the right entry.
export function createAudio() {
  let context = null;
  let master = null;
  let noiseBuffer = null;

  function ensure() {
    if (context) return true;
    try {
      context = new (window.AudioContext || window.webkitAudioContext)();
      master = context.createGain();
      master.gain.value = 0.35;
      master.connect(context.destination);
      noiseBuffer = context.createBuffer(1, context.sampleRate * 0.3, context.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
      return true;
    } catch (error) {
      return false;
    }
  }

  function noise(duration, frequency, gainValue, distance = 0) {
    if (!ensure() || context.state === 'suspended') return;
    const source = context.createBufferSource();
    source.buffer = noiseBuffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = frequency;
    const gain = context.createGain();
    const level = gainValue / (1 + distance * 0.12);
    gain.gain.setValueAtTime(level, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start();
    source.stop(context.currentTime + duration);
  }

  function tone(frequency, duration, gainValue, type = 'sine') {
    if (!ensure() || context.state === 'suspended') return;
    const oscillator = context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    const gain = context.createGain();
    gain.gain.setValueAtTime(gainValue, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + duration);
    oscillator.connect(gain);
    gain.connect(master);
    oscillator.start();
    oscillator.stop(context.currentTime + duration);
  }

  return {
    unlock() {
      ensure();
      if (context && context.state === 'suspended') context.resume();
    },
    shot(kind, distance = 0) {
      const settings = {
        pistol: [0.1, 1400, 0.5],
        rifle: [0.12, 1100, 0.55],
        smg: [0.08, 1600, 0.4],
        sniper: [0.25, 700, 0.8],
        shotgun: [0.2, 900, 0.7],
      }[kind] || [0.1, 1200, 0.5];
      noise(settings[0], settings[1], settings[2], distance);
      tone(90, 0.08, 0.3, 'sine');
    },
    hit() {
      tone(1800, 0.05, 0.25, 'square');
    },
    kill() {
      tone(1200, 0.07, 0.3, 'square');
      setTimeout(() => tone(1800, 0.09, 0.3, 'square'), 70);
    },
    hurt() {
      noise(0.12, 500, 0.5);
    },
    reload() {
      tone(600, 0.04, 0.2, 'square');
      setTimeout(() => tone(900, 0.04, 0.2, 'square'), 300);
    },
    plantBeep() {
      tone(1000, 0.08, 0.25, 'sine');
    },
    roundEnd(win) {
      tone(win ? 520 : 330, 0.18, 0.3, 'triangle');
      setTimeout(() => tone(win ? 780 : 260, 0.3, 0.3, 'triangle'), 180);
    },
    click() {
      tone(800, 0.03, 0.2, 'square');
    },
  };
}
