// The music master bus: a convolution reverb with a generated impulse response, a tempo-synced
// feedback delay, a compressor, ducking (dialogue/explosions lower it) and a "car radio" EQ that
// narrows the band when the music plays from a car's speakers (and muffles it outside the car).

export class MusicBus {
  constructor(ctx, dest) {
    this.ctx = ctx;
    this.input = ctx.createGain();
    this.dry = ctx.createGain();
    this.reverbSend = ctx.createGain();
    this.delaySend = ctx.createGain();
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.impulse(2.6, 2.4);
    this.delay = ctx.createDelay(2);
    this.fb = ctx.createGain();
    this.fb.gain.value = 0.32;
    const dlp = ctx.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 3000;
    // Car radio EQ: band-limited with a mid bump; a lowpass for "muffled outside the car".
    this.hp = ctx.createBiquadFilter();
    this.hp.type = 'highpass';
    this.hp.frequency.value = 20;
    this.lp = ctx.createBiquadFilter();
    this.lp.type = 'lowpass';
    this.lp.frequency.value = 20000;
    this.mid = ctx.createBiquadFilter();
    this.mid.type = 'peaking';
    this.mid.frequency.value = 1500;
    this.mid.gain.value = 0;
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -18;
    this.comp.ratio.value = 3;
    this.out = ctx.createGain();
    this.input.connect(this.dry).connect(this.hp);
    this.input.connect(this.reverbSend).connect(this.reverb).connect(this.hp);
    this.input.connect(this.delaySend).connect(this.delay);
    this.delay.connect(dlp).connect(this.fb).connect(this.delay);
    dlp.connect(this.hp);
    this.hp.connect(this.mid).connect(this.lp).connect(this.comp).connect(this.out).connect(dest);
    this.reverbSend.gain.value = 0.25;
    this.delaySend.gain.value = 0.12;
  }

  /** Exponentially decaying stereo noise: a cheap, convincing hall. */
  impulse(seconds, decay) {
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    let seed = 99;
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) {
        seed = (seed * 16807) % 2147483647;
        d[i] = ((seed / 2147483647) * 2 - 1) * Math.pow(1 - i / len, decay);
      }
    }
    return buf;
  }

  setTempo(bpm) {
    this.delay.delayTime.setTargetAtTime((60 / bpm) * 0.75, this.ctx.currentTime, 0.1);
  }

  /** mode: 'clean' | 'radio' (in a car) | 'muffled' (radio heard from outside). */
  setMode(mode) {
    const t = this.ctx.currentTime;
    const [hp, lp, mid] = mode === 'radio' ? [140, 9000, 4] : mode === 'muffled' ? [80, 900, 0] : [20, 20000, 0];
    this.hp.frequency.setTargetAtTime(hp, t, 0.2);
    this.lp.frequency.setTargetAtTime(lp, t, 0.2);
    this.mid.gain.setTargetAtTime(mid, t, 0.2);
  }

  setLevel(v, time = 0.4) {
    this.out.gain.setTargetAtTime(v, this.ctx.currentTime, time);
  }
}
