// RAILHEAD — audio.js: every sound is synthesized with WebAudio.
//
// No sound files: shots are filtered noise bursts, hits are short ticks,
// the plant beeps are sine blips and the explosion is a noise swell under a
// falling sine. The context is created lazily on the first user gesture, so
// loading the page never needs audio permission up front.

export function createAudio() {
  let ctx = null;
  let noiseBuf = null;
  let master = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    const AC = window.AudioContext ?? window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.4;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return true;
  }

  function noise(dur, filterFreq, gainVal, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(gain).connect(master);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  function tone(freq, dur, gainVal, type = 'sine', slideTo = null, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainVal, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  /** Distance falloff for a far-away shot: 0 at the muzzle, 1 at 60 m. */
  const far = (dist) => Math.max(0, Math.min(1, (dist - 4) / 56));

  return {
    unlock() {
      ensure();
    },
    /** Silence the master gain (0) or restore it (1). */
    setMuted(muted) {
      if (ensure()) master.gain.value = muted ? 0 : 0.4;
    },
    shot(kind, dist = 0) {
      const d = far(dist);
      const gain = 0.5 * (1 - d * 0.75);
      if (kind === 'sniper') {
        noise(0.32, 900, gain);
        tone(140, 0.25, gain * 0.8, 'sine', 45);
      } else if (kind === 'shotgun') {
        noise(0.28, 1400, gain);
        tone(110, 0.2, gain * 0.7, 'sine', 50);
      } else if (kind === 'smg') {
        noise(0.09, 2200, gain * 0.8);
      } else if (kind === 'pistol') {
        noise(0.12, 1800, gain);
      } else {
        noise(0.14, 1500, gain);
        tone(180, 0.1, gain * 0.4, 'sine', 70);
      }
    },
    hit() {
      tone(1400, 0.05, 0.25, 'square');
    },
    kill() {
      tone(880, 0.07, 0.25, 'square');
      tone(1320, 0.1, 0.25, 'square', null, 0.07);
    },
    hurt() {
      tone(220, 0.12, 0.3, 'sawtooth', 140);
    },
    reload() {
      tone(500, 0.04, 0.15, 'square');
      tone(700, 0.04, 0.15, 'square', null, 0.12);
    },
    dry() {
      tone(300, 0.05, 0.2, 'square');
    },
    step() {
      noise(0.05, 500, 0.08);
    },
    plantBeep() {
      tone(1100, 0.08, 0.3, 'sine');
    },
    plantDone() {
      tone(1100, 0.1, 0.3, 'sine');
      tone(1100, 0.1, 0.3, 'sine', null, 0.15);
    },
    defuseBeep() {
      tone(900, 0.06, 0.25, 'sine');
    },
    explosion() {
      noise(1.4, 500, 0.9);
      tone(90, 1.2, 0.8, 'sine', 28);
    },
    roundWin() {
      tone(523, 0.12, 0.25, 'triangle');
      tone(659, 0.12, 0.25, 'triangle', null, 0.12);
      tone(784, 0.22, 0.3, 'triangle', null, 0.24);
    },
    roundLose() {
      tone(392, 0.15, 0.25, 'triangle');
      tone(311, 0.25, 0.25, 'triangle', null, 0.15);
    },
    buy() {
      tone(980, 0.05, 0.2, 'square');
    },
    denied() {
      tone(220, 0.12, 0.25, 'square');
    },
  };
}
