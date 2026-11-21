// Every sound effect is synthesized with Web Audio — no samples. Positional sources go through
// PannerNodes around a listener that follows the camera. Includes the engine (pitch follows RPM with
// gear shifts), tyre screech, crashes scaled by impact, the horn, each gunshot type, reloads, punches,
// explosions, a two-tone siren with doppler-like pitch, the helicopter rotor, footsteps, pickup chime,
// stings, and ambience (distant traffic, birds by day, crickets at night, rain, waves).

export class AudioSystem {
  constructor() {
    this.ctx = null;
    this.vol = { music: 0.7, sfx: 0.8, radio: 0.7 };
    this.duck = 1;
  }

  /** Create the audio graph on the first user gesture. */
  start() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14;
    this.comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    this.comp.connect(this.master).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.comp);
    this.amb = ctx.createGain();
    this.amb.connect(this.sfx);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.comp);
    this.radioBus = ctx.createGain();
    this.radioBus.connect(this.comp);
    // White noise source buffer shared by everything.
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 12345;
    for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; d[i] = (seed / 2147483647) * 2 - 1; }
    this.applyVolumes();
    this.buildLoops();
  }

  setVolumes(v) {
    Object.assign(this.vol, v);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    this.sfx.gain.value = this.vol.sfx;
    this.musicBus.gain.value = this.vol.music * this.duck;
    this.radioBus.gain.value = this.vol.radio * this.duck;
  }

  /** Briefly lower music and radio (dialogue, explosions). */
  duckFor(amount, seconds) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [bus, v] of [[this.musicBus, this.vol.music], [this.radioBus, this.vol.radio]]) {
      bus.gain.cancelScheduledValues(t);
      bus.gain.setTargetAtTime(v * amount, t, 0.08);
      bus.gain.setTargetAtTime(v, t + seconds, 0.6);
    }
  }

  // ------------------------------------------------------------ building blocks
  noiseSrc(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = loop;
    s.loopStart = Math.random();
    return s;
  }

  panner(x, y, z, ref = 6) {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = 600;
    p.rolloffFactor = 1.2;
    p.positionX.value = x;
    p.positionY.value = y;
    p.positionZ.value = z;
    p.connect(this.sfx);
    return p;
  }

  /** Output node at a world position (or straight to the SFX bus when pos is null). */
  out(pos, ref) {
    return pos ? this.panner(pos[0], pos[1], pos[2], ref) : this.sfx;
  }

  env(node, t, a, peak, decay, sustain = 0) {
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    node.gain.exponentialRampToValueAtTime(Math.max(sustain, 0.0001), t + a + decay);
  }

  burst(pos, { type = 'bandpass', freq = 1200, q = 1, peak = 0.5, decay = 0.2, attack = 0.002, sweepTo = null, ref = 6 }) {
    const ctx = this.ctx, t = ctx.currentTime;
    const n = this.noiseSrc();
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + decay);
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, attack, peak, decay);
    n.connect(f).connect(g).connect(this.out(pos, ref));
    n.start(t);
    n.stop(t + attack + decay + 0.05);
  }

  tone(pos, { wave = 'sine', freq = 440, to = null, peak = 0.3, decay = 0.3, attack = 0.005, delay = 0, ref = 6 }) {
    const ctx = this.ctx, t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    o.type = wave;
    o.frequency.setValueAtTime(freq, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + decay);
    const g = ctx.createGain();
    this.env(g, t, attack, peak, decay);
    o.connect(g).connect(this.out(pos, ref));
    o.start(t);
    o.stop(t + attack + decay + 0.05);
  }

  // ------------------------------------------------------------ one-shots
  ui() {
    if (!this.ctx) return;
    this.tone(null, { wave: 'triangle', freq: 880, to: 1320, peak: 0.12, decay: 0.07 });
  }

  gunshot(kind, pos) {
    if (!this.ctx) return;
    if (kind === 'shotgun') {
      this.burst(pos, { type: 'lowpass', freq: 2600, sweepTo: 300, peak: 1.0, decay: 0.38, ref: 10 });
      this.tone(pos, { wave: 'sine', freq: 90, to: 40, peak: 0.8, decay: 0.3, ref: 10 });
    } else if (kind === 'smg') {
      this.burst(pos, { type: 'bandpass', freq: 1800, q: 0.7, peak: 0.55, decay: 0.07, ref: 8 });
      this.tone(pos, { wave: 'square', freq: 150, to: 60, peak: 0.18, decay: 0.06, ref: 8 });
    } else {
      this.burst(pos, { type: 'bandpass', freq: 1300, q: 0.6, peak: 0.8, decay: 0.14, ref: 9 });
      this.tone(pos, { wave: 'sine', freq: 140, to: 50, peak: 0.45, decay: 0.12, ref: 9 });
    }
  }

  reload() {
    if (!this.ctx) return;
    this.burst(null, { type: 'highpass', freq: 3000, peak: 0.25, decay: 0.03 });
    setTimeout(() => this.ctx && this.burst(null, { type: 'bandpass', freq: 2200, q: 3, peak: 0.3, decay: 0.05 }), 380);
  }

  punch(pos) {
    if (!this.ctx) return;
    this.tone(pos, { wave: 'sine', freq: 120, to: 55, peak: 0.6, decay: 0.12 });
    this.burst(pos, { type: 'lowpass', freq: 900, peak: 0.35, decay: 0.08 });
  }

  explosion(pos) {
    if (!this.ctx) return;
    this.burst(pos, { type: 'lowpass', freq: 1800, sweepTo: 80, peak: 1.4, decay: 2.2, attack: 0.01, ref: 25 });
    this.tone(pos, { wave: 'sine', freq: 70, to: 25, peak: 1.0, decay: 1.6, ref: 25 });
    this.burst(pos, { type: 'bandpass', freq: 400, q: 0.5, peak: 0.6, decay: 0.9, ref: 25 });
    this.duckFor(0.35, 1.5);
  }

  crash(intensity, pos) {
    if (!this.ctx) return;
    const k = Math.min(1, intensity / 25);
    this.burst(pos, { type: 'bandpass', freq: 600 + Math.random() * 400, q: 1.5, peak: 0.3 + k * 0.9, decay: 0.15 + k * 0.4, ref: 8 });
    this.tone(pos, { wave: 'sine', freq: 80, to: 40, peak: 0.3 + k * 0.6, decay: 0.2 + k * 0.2, ref: 8 });
    if (k > 0.4) this.burst(pos, { type: 'highpass', freq: 4000, peak: 0.2 * k, decay: 0.6, ref: 8 });
  }

  chime() {
    if (!this.ctx) return;
    [880, 1109, 1319, 1760].forEach((f, i) => this.tone(null, { wave: 'triangle', freq: f, peak: 0.12, decay: 0.25, delay: i * 0.05 }));
  }

  cash() {
    if (!this.ctx) return;
    [1568, 2093].forEach((f, i) => this.tone(null, { wave: 'square', freq: f, peak: 0.05, decay: 0.12, delay: i * 0.06 }));
  }

  footstep(pos, run) {
    if (!this.ctx) return;
    this.burst(pos, { type: 'bandpass', freq: run ? 900 : 700, q: 1.2, peak: run ? 0.16 : 0.09, decay: 0.05, ref: 3 });
  }

  /** Short musical stings for mission results and fail screens. */
  sting(kind) {
    if (!this.ctx) return;
    const seqs = {
      passed: [[523, 0], [659, 0.12], [784, 0.24], [1047, 0.36], [1319, 0.5]],
      failed: [[440, 0], [415, 0.25], [392, 0.5], [311, 0.8]],
      flatlined: [[220, 0], [208, 0.4], [196, 0.8], [147, 1.3]],
      cuffed: [[659, 0], [523, 0.18], [659, 0.36], [523, 0.54]],
      tag: [[1047, 0], [1568, 0.08]],
    }[kind];
    for (const [f, d] of seqs ?? []) {
      this.tone(null, { wave: 'sawtooth', freq: f, peak: 0.08, decay: 0.5, delay: d });
      this.tone(null, { wave: 'triangle', freq: f / 2, peak: 0.12, decay: 0.6, delay: d });
    }
    this.duckFor(0.3, 2);
  }

  // ------------------------------------------------------------ continuous loops
  buildLoops() {
    const ctx = this.ctx;
    // Player engine: two detuned oscillators through a lowpass; gain/pitch set per frame.
    this.eng = { o1: ctx.createOscillator(), o2: ctx.createOscillator(), f: ctx.createBiquadFilter(), g: ctx.createGain() };
    this.eng.o1.type = 'sawtooth';
    this.eng.o2.type = 'square';
    this.eng.f.type = 'lowpass';
    this.eng.f.frequency.value = 900;
    this.eng.g.gain.value = 0;
    this.eng.o1.connect(this.eng.f);
    this.eng.o2.connect(this.eng.f);
    this.eng.f.connect(this.eng.g).connect(this.sfx);
    this.eng.o1.start();
    this.eng.o2.start();
    this.gear = 1;
    // Tyre screech.
    this.scr = { n: this.noiseSrc(true), f: ctx.createBiquadFilter(), g: ctx.createGain() };
    this.scr.f.type = 'bandpass';
    this.scr.f.frequency.value = 2200;
    this.scr.f.Q.value = 6;
    this.scr.g.gain.value = 0;
    this.scr.n.connect(this.scr.f).connect(this.scr.g).connect(this.sfx);
    this.scr.n.start();
    // Horn.
    this.horn = { o1: ctx.createOscillator(), o2: ctx.createOscillator(), g: ctx.createGain(), p: this.panner(0, 0, 0, 8) };
    this.horn.o1.type = this.horn.o2.type = 'square';
    this.horn.o1.frequency.value = 415;
    this.horn.o2.frequency.value = 523;
    const hf = ctx.createBiquadFilter();
    hf.type = 'lowpass';
    hf.frequency.value = 1800;
    this.horn.g.gain.value = 0;
    this.horn.o1.connect(hf);
    this.horn.o2.connect(hf);
    hf.connect(this.horn.g).connect(this.horn.p);
    this.horn.o1.start();
    this.horn.o2.start();
    // Siren (nearest pursuing police car).
    this.siren = { o: ctx.createOscillator(), g: ctx.createGain(), p: this.panner(0, 0, 0, 14) };
    this.siren.o.type = 'triangle';
    this.siren.g.gain.value = 0;
    this.siren.o.connect(this.siren.g).connect(this.siren.p);
    this.siren.o.start();
    this.lastSirenDist = null;
    // Helicopter rotor: noise amplitude-modulated at the blade rate.
    this.rotor = { n: this.noiseSrc(true), f: ctx.createBiquadFilter(), g: ctx.createGain(), lfo: ctx.createOscillator(), lg: ctx.createGain(), p: this.panner(0, 0, 0, 20) };
    this.rotor.f.type = 'lowpass';
    this.rotor.f.frequency.value = 500;
    this.rotor.g.gain.value = 0;
    this.rotor.lfo.frequency.value = 17;
    this.rotor.lg.gain.value = 0;
    this.rotor.lfo.connect(this.rotor.lg).connect(this.rotor.g.gain);
    this.rotor.n.connect(this.rotor.f).connect(this.rotor.g).connect(this.rotor.p);
    this.rotor.n.start();
    this.rotor.lfo.start();
    // Ambience beds: distant traffic, rain, waves, crickets.
    const bed = (type, freq, q = 0.7) => {
      const n = this.noiseSrc(true), f = ctx.createBiquadFilter(), g = ctx.createGain();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      g.gain.value = 0;
      n.connect(f).connect(g).connect(this.amb);
      n.start();
      return g;
    };
    this.ambTraffic = bed('lowpass', 320);
    this.ambRain = bed('highpass', 2500);
    this.ambWaves = bed('lowpass', 600);
    this.cricket = { o: ctx.createOscillator(), g: ctx.createGain(), lfo: ctx.createOscillator(), lg: ctx.createGain() };
    this.cricket.o.frequency.value = 4300;
    this.cricket.lfo.frequency.value = 22;
    this.cricket.lg.gain.value = 0;
    this.cricket.g.gain.value = 0;
    this.cricket.lfo.connect(this.cricket.lg).connect(this.cricket.g.gain);
    this.cricket.o.connect(this.cricket.g).connect(this.amb);
    this.cricket.o.start();
    this.cricket.lfo.start();
    this.birdT = 0;
  }

  /** Per-frame update from the world state. */
  update(dt, w) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const cam = w.camera;
    const L = ctx.listener;
    const f = cam.forward;
    if (L.positionX) {
      L.positionX.value = cam.pos[0]; L.positionY.value = cam.pos[1]; L.positionZ.value = cam.pos[2];
      L.forwardX.value = f[0]; L.forwardY.value = f[1]; L.forwardZ.value = f[2];
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    }
    const playing = w.audioActive !== false;
    const p = w.player;
    const v = p.vehicle;
    // Engine with simulated gears.
    if (v && playing && !v.wrecked) {
      const sp = Math.abs(v.speed);
      const shifts = [0, 9, 17, 25, 34, 44];
      let g = 1;
      while (g < shifts.length - 1 && sp > shifts[g]) g++;
      if (g !== this.gear) { this.gear = g; this.eng.g.gain.setTargetAtTime(0.05, t, 0.02); }
      const lo = shifts[g - 1], hi = shifts[g];
      const rpm = 0.25 + 0.75 * Math.min(1, (sp - lo) / (hi - lo + 1e-3));
      const base = (v.def.truck ? 32 : v.def.sport ? 58 : 44) * (0.6 + rpm * 1.4);
      this.eng.o1.frequency.setTargetAtTime(base, t, 0.05);
      this.eng.o2.frequency.setTargetAtTime(base * 0.502, t, 0.05);
      this.eng.f.frequency.setTargetAtTime(500 + rpm * 1400 + Math.abs(v.throttle) * 600, t, 0.05);
      this.eng.g.gain.setTargetAtTime(0.06 + Math.abs(v.throttle) * 0.08, t, 0.08);
    } else this.eng.g.gain.setTargetAtTime(0, t, 0.1);
    // Screech (any car drifting near the camera, the player's car loudest).
    const screech = v && v.screech ? 0.22 : w.vehicles.list.some((o) => o.screech && Math.hypot(o.x - cam.pos[0], o.z - cam.pos[2]) < 40) ? 0.08 : 0;
    this.scr.g.gain.setTargetAtTime(playing ? screech : 0, t, 0.05);
    // Horn: the player's, or the nearest honking NPC.
    let hornCar = v && v.horn ? v : null;
    if (!hornCar) for (const o of w.vehicles.list) if (o.horn && Math.hypot(o.x - cam.pos[0], o.z - cam.pos[2]) < 60) { hornCar = o; break; }
    if (hornCar) { this.horn.p.positionX.value = hornCar.x; this.horn.p.positionY.value = hornCar.y + 1; this.horn.p.positionZ.value = hornCar.z; }
    this.horn.g.gain.setTargetAtTime(hornCar && playing ? 0.22 : 0, t, 0.02);
    // Siren: nearest pursuing police car, two-tone with doppler from the radial speed.
    let sc = null, sd = Infinity;
    for (const o of w.vehicles.list) {
      if (!o.siren || o.wrecked) continue;
      const d = Math.hypot(o.x - cam.pos[0], o.z - cam.pos[2]);
      if (d < sd) { sd = d; sc = o; }
    }
    if (sc && playing) {
      const radial = this.lastSirenDist !== null ? (sd - this.lastSirenDist) / Math.max(dt, 1e-3) : 0;
      this.lastSirenDist = sd;
      const dop = 1 - Math.max(-0.12, Math.min(0.12, radial / 340));
      const two = Math.floor(t * 2) % 2 ? 960 : 720;
      this.siren.o.frequency.setTargetAtTime(two * dop, t, 0.03);
      this.siren.p.positionX.value = sc.x; this.siren.p.positionY.value = sc.y + 1.5; this.siren.p.positionZ.value = sc.z;
      this.siren.g.gain.setTargetAtTime(0.14, t, 0.1);
    } else {
      this.lastSirenDist = null;
      this.siren.g.gain.setTargetAtTime(0, t, 0.2);
    }
    // Helicopter rotor.
    const h = w.heli;
    if (h && h.active && playing) {
      this.rotor.p.positionX.value = h.x; this.rotor.p.positionY.value = h.y; this.rotor.p.positionZ.value = h.z;
      this.rotor.g.gain.setTargetAtTime(0.25, t, 0.2);
      this.rotor.lg.gain.setTargetAtTime(0.25, t, 0.2);
    } else {
      this.rotor.g.gain.setTargetAtTime(0, t, 0.3);
      this.rotor.lg.gain.setTargetAtTime(0, t, 0.3);
    }
    // Footsteps from the walk phase.
    if (!v && p.alive && p.speed > 0.6 && !p.air && playing) {
      const step = Math.floor(p.phase / Math.PI);
      if (step !== this.lastStep) {
        this.lastStep = step;
        this.footstep([p.x, p.y, p.z], p.speed > 4);
      }
    }
    // Ambience.
    const night = w.env.night;
    const coast = Math.min(Math.abs(p.x + 30), Math.abs(p.z + 30), Math.abs(p.x - 1030), Math.abs(p.z - 1050));
    this.ambTraffic.gain.setTargetAtTime(playing ? 0.05 + 0.03 * (1 - night) : 0, t, 0.5);
    this.ambRain.gain.setTargetAtTime(playing ? w.env.rain * 0.18 : 0, t, 0.5);
    this.ambWaves.gain.setTargetAtTime(playing ? Math.max(0, 1 - coast / 90) * (0.08 + 0.05 * Math.sin(t * 0.4)) : 0, t, 0.5);
    this.cricket.lg.gain.setTargetAtTime(playing ? night * 0.012 * (1 - w.env.rain) : 0, t, 0.5);
    this.birdT -= dt;
    if (this.birdT <= 0 && playing) {
      this.birdT = 1.5 + Math.random() * 4;
      if (night < 0.3 && w.env.rain < 0.3) {
        const f0 = 2400 + Math.random() * 1600;
        for (let k = 0; k < 3; k++) this.tone(null, { wave: 'sine', freq: f0, to: f0 * (1.2 + Math.random() * 0.3), peak: 0.025, decay: 0.08, delay: k * 0.11 });
      }
    }
  }

  /** React to gameplay events. */
  onEvents(events, w) {
    if (!this.ctx) return;
    for (const e of events) {
      switch (e.type) {
        case 'shot': this.gunshot(e.weapon, [e.x, 1.4, e.z]); break;
        case 'explosion': this.explosion([e.x, e.y, e.z]); break;
        case 'crash': if (Math.hypot(e.x - w.camera.pos[0], e.z - w.camera.pos[2]) < 80) this.crash(e.speed, [e.x, 1, e.z]); break;
        case 'punch': this.punch([e.x, 1.4, e.z]); break;
        case 'reload': this.reload(); break;
        case 'pickup': if (e.kind === 'cash') this.cash(); else this.chime(); break;
        case 'weaponSwitch': this.ui(); break;
        case 'busted': this.sting('cuffed'); break;
        case 'wasted': this.sting('flatlined'); break;
        case 'tag': this.sting('tag'); break;
        default: break;
      }
    }
  }
}
