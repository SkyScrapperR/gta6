// Synth voices for the soundtrack, all scheduled at exact AudioContext times: a subtractive voice
// (saw/square through a resonant filter with envelope and LFO), FM bells (gamelan-like metallic
// tones), a Karplus-Strong pluck, a supersaw pad, filtered noise (risers, vinyl crackle, formant
// "vocal" chops) and a drum kit (kick, snare, clap, hats, toms, shaker).

export const midiHz = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Synth {
  constructor(ctx, noise) {
    this.ctx = ctx;
    this.noise = noise;
  }

  gainEnv(t, a, peak, d, s, r, dur) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * s, t + a, d / 3 + 1e-3);
    g.gain.setTargetAtTime(0.0001, t + Math.max(dur, a), r / 3 + 1e-3);
    return g;
  }

  /** Subtractive voice: wave(s) -> lowpass with envelope -> amp envelope. */
  sub(out, t, note, dur, { wave = 'sawtooth', vol = 0.2, cutoff = 1800, envAmt = 2400, q = 4, a = 0.01, d = 0.2, s = 0.6, r = 0.15, detune = 7, lfo = 0, glideFrom = null } = {}) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = q;
    f.frequency.setValueAtTime(cutoff + envAmt, t);
    f.frequency.setTargetAtTime(cutoff, t + a, d / 2 + 1e-3);
    const g = this.gainEnv(t, a, vol, d, s, r, dur);
    f.connect(g).connect(out);
    for (const dt of detune ? [-detune, detune] : [0]) {
      const o = ctx.createOscillator();
      o.type = wave;
      if (glideFrom !== null) {
        o.frequency.setValueAtTime(midiHz(glideFrom), t);
        o.frequency.exponentialRampToValueAtTime(midiHz(note), t + 0.06);
      } else o.frequency.setValueAtTime(midiHz(note), t);
      o.detune.value = dt;
      if (lfo) {
        const l = ctx.createOscillator(), lg = ctx.createGain();
        l.frequency.value = 5.5;
        lg.gain.value = lfo;
        l.connect(lg).connect(o.detune);
        l.start(t);
        l.stop(t + dur + r + 0.3);
      }
      o.connect(f);
      o.start(t);
      o.stop(t + dur + r + 0.3);
    }
  }

  /** FM bell: inharmonic modulator ratio gives gamelan-like metal. */
  bell(out, t, note, dur, { vol = 0.18, ratio = 3.5, index = 280, decay = 1.6 } = {}) {
    const ctx = this.ctx;
    const car = ctx.createOscillator(), mod = ctx.createOscillator(), mg = ctx.createGain();
    const f = midiHz(note);
    car.frequency.value = f;
    mod.frequency.value = f * ratio;
    mg.gain.setValueAtTime(index * (f / 440) * 2, t);
    mg.gain.exponentialRampToValueAtTime(1, t + decay);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t + decay + dur * 0.2);
    car.connect(g).connect(out);
    for (const o of [car, mod]) { o.start(t); o.stop(t + decay + dur * 0.2 + 0.1); }
  }

  /** Karplus-Strong pluck: a noise burst in a damped feedback delay tuned to the pitch. */
  pluck(out, t, note, dur, { vol = 0.25, damp = 3200, decay = 0.985 } = {}) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const burst = ctx.createGain();
    burst.gain.setValueAtTime(vol, t);
    burst.gain.setValueAtTime(0, t + 0.012);
    const delay = ctx.createDelay(0.05);
    delay.delayTime.value = 1 / midiHz(note);
    const fb = ctx.createGain();
    fb.gain.value = decay;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = damp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(1, t);
    g.gain.setTargetAtTime(0.0001, t + dur, 0.08);
    n.connect(burst).connect(delay);
    delay.connect(lp).connect(fb).connect(delay);
    lp.connect(g).connect(out);
    n.start(t, Math.random());
    n.stop(t + 0.02);
    setTimeout(() => { try { fb.disconnect(); } catch { /* gone */ } }, (t - ctx.currentTime + dur + 0.6) * 1000);
  }

  /** Supersaw pad: several detuned saws, slow attack, soft lowpass. */
  pad(out, t, notes, dur, { vol = 0.05, cutoff = 1400, a = 0.4, r = 0.6 } = {}) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = cutoff;
    const g = this.gainEnv(t, a, vol, 0.5, 0.85, r, dur);
    f.connect(g).connect(out);
    for (const n of notes) {
      for (const dt of [-14, -6, 0, 6, 14]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = midiHz(n);
        o.detune.value = dt;
        o.connect(f);
        o.start(t);
        o.stop(t + dur + r + 0.5);
      }
    }
  }

  noiseHit(out, t, { type = 'highpass', freq = 7000, q = 1, vol = 0.1, decay = 0.05, a = 0.001, sweep = null } = {}) {
    const ctx = this.ctx;
    const n = ctx.createBufferSource();
    n.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + a + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + decay);
    n.connect(f).connect(g).connect(out);
    n.start(t, Math.random());
    n.stop(t + a + decay + 0.05);
  }

  /** Formant-filtered noise "vocal" chop (kecak-like "chak"). */
  chop(out, t, { vol = 0.25, vowel = 0 } = {}) {
    const formants = [[700, 1100], [400, 2000], [300, 870]][vowel % 3];
    for (const f of formants) this.noiseHit(out, t, { type: 'bandpass', freq: f, q: 9, vol, decay: 0.09 });
  }

  drum(out, t, kind, vol = 1) {
    const ctx = this.ctx;
    if (kind === 'k') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.setValueAtTime(150, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
      g.gain.setValueAtTime(0.9 * vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.4);
    } else if (kind === 's') {
      this.noiseHit(out, t, { type: 'bandpass', freq: 1800, q: 0.7, vol: 0.35 * vol, decay: 0.16 });
      this.sub(out, t, 50, 0.05, { wave: 'triangle', vol: 0.25 * vol, cutoff: 3000, envAmt: 0, detune: 0, d: 0.05, s: 0.1, r: 0.06 });
    } else if (kind === 'c') {
      for (const dt of [0, 0.011, 0.023]) this.noiseHit(out, t + dt, { type: 'bandpass', freq: 1300, q: 1.2, vol: 0.28 * vol, decay: 0.06 });
    } else if (kind === 'h') this.noiseHit(out, t, { vol: 0.08 * vol, decay: 0.035 });
    else if (kind === 'o') this.noiseHit(out, t, { vol: 0.07 * vol, decay: 0.22 });
    else if (kind === 'x') this.noiseHit(out, t, { type: 'bandpass', freq: 6000, q: 2, vol: 0.06 * vol, decay: 0.05, a: 0.02 });
    else if (kind === 't' || kind === 'T') {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const f0 = kind === 't' ? 140 : 95;
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(f0 * 0.6, t + 0.25);
      g.gain.setValueAtTime(0.5 * vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(out);
      o.start(t);
      o.stop(t + 0.32);
    } else if (kind === 'g') {
      // Gong: low FM bell with long decay.
      this.bell(out, t, 38, 2, { vol: 0.25 * vol, ratio: 1.41, index: 120, decay: 3.5 });
    }
  }
}
