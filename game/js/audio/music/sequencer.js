// Lookahead sequencer. A song is data (songs/*.js): tempo, key, scale, chord progressions per
// section, sections with bars/drums/melody/layers, an arrangement and written melodies. Every 25 ms
// the scheduler places the next ~150 ms of 16th steps on the audio clock. Bass, pad and arpeggio
// parts are derived from the chords in the song's chosen styles; the lead plays the written melody.
// Fills land on the last bar of a section, a noise riser leads into every chorus, and the chorus
// drops in with a crash. Layers can be muted (dynamic chase music) and songs can start mid-way
// (radio stations that keep playing while you are away).

import { Synth, midiHz } from './synth.js';

export const SCALES = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  dorian: [0, 2, 3, 5, 7, 9, 10],
  pelog: [0, 1, 3, 7, 8, 10, 12],
  slendro: [0, 2, 5, 7, 9, 12, 14],
};

export function songLength(song) {
  return songBars(song).length * 4 * (60 / song.bpm);
}

/** Flatten the arrangement into a list of bars: { section, chord root degree, index in section }. */
export function songBars(song) {
  const bars = [];
  for (const name of song.arrangement) {
    const sec = song.sections[name];
    const prog = song.chords[sec.chords ?? 'A'];
    for (let b = 0; b < sec.bars; b++) bars.push({ name, sec, root: prog[b % prog.length], i: b, last: b === sec.bars - 1 });
  }
  return bars;
}

export class Sequencer {
  constructor(ctx, noise, out) {
    this.ctx = ctx;
    this.synth = new Synth(ctx, noise);
    this.out = out;
    this.song = null;
    this.timer = null;
    this.layers = { drums: 1, bass: 1, pad: 1, arp: 1, lead: 1 };
  }

  note(deg, oct = 0) {
    const s = this.song;
    const sc = SCALES[s.scale];
    const o = Math.floor(deg / 7);
    return s.key + sc[((deg % 7) + 7) % 7] + 12 * (o + oct);
  }

  chord(root, size = 3) {
    const out = [];
    for (let k = 0; k < size; k++) out.push(root + k * 2);
    return out;
  }

  /** Play a song from `offset` seconds; loop when it ends (title theme) or call onEnd. */
  play(song, { offset = 0, loop = false, onEnd = null } = {}) {
    this.stop();
    this.song = song;
    this.bars = songBars(song);
    this.loop = loop;
    this.onEnd = onEnd;
    this.stepDur = 60 / song.bpm / 4;
    const total = this.bars.length * 16;
    this.step = Math.floor(offset / this.stepDur) % total;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.timer = setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.song = null;
  }

  get playing() {
    return !!this.song;
  }

  /** Current position in seconds (for UI and radio continuity). */
  position() {
    return this.step * this.stepDur;
  }

  schedule() {
    const s = this.song;
    if (!s) return;
    while (this.nextTime < this.ctx.currentTime + 0.15) {
      const total = this.bars.length * 16;
      if (this.step >= total) {
        if (this.loop) this.step = 0;
        else {
          const cb = this.onEnd;
          this.stop();
          cb?.();
          return;
        }
      }
      const swing = s.swing && this.step % 2 === 1 ? this.stepDur * s.swing : 0;
      this.playStep(this.step, this.nextTime + swing);
      this.step++;
      this.nextTime += this.stepDur;
    }
  }

  playStep(step, t) {
    const s = this.song;
    const sy = this.synth;
    const out = this.out;
    const barIdx = Math.floor(step / 16);
    const st = step % 16;
    const bar = this.bars[barIdx];
    const sec = bar.sec;
    const L = this.layers;
    const has = (layer) => (sec.layers ?? ['drums', 'bass', 'pad', 'arp', 'lead']).includes(layer) && L[layer] > 0;
    const style = s.style;
    const root = bar.root;
    const spb = this.stepDur;
    // ---------------- drums
    if (has('drums')) {
      const pat = s.drums[bar.last && s.drums.fill && sec.fill !== false ? 'fill' : sec.drums ?? 'main'];
      if (pat) for (const [kind, str] of Object.entries(pat)) if (str[st] === 'x' || str[st] === 'X') sy.drum(out, t, kind, (str[st] === 'X' ? 1 : 0.75) * L.drums);
    }
    // Chorus drop: crash on the downbeat; riser through the bar before.
    if (st === 0 && bar.i === 0 && bar.name.startsWith('chorus')) sy.noiseHit(out, t, { vol: 0.12, decay: 1.4, freq: 5000 });
    const nextBar = this.bars[barIdx + 1];
    if (st === 0 && bar.last && nextBar?.name.startsWith('chorus')) sy.noiseHit(out, t, { type: 'bandpass', freq: 400, sweep: 6000, q: 3, vol: 0.1, a: spb * 15, decay: 0.05 });
    if (s.vinyl && st % 4 === 0) sy.noiseHit(out, t + Math.random() * spb * 3, { vol: 0.02, decay: 0.01, freq: 3000 });
    // ---------------- bass
    if (has('bass')) {
      const bn = this.note(root, -2);
      if (style.bass === 'pulse' && st % 2 === 0) sy.sub(out, t, bn + (st % 8 === 6 ? 12 : 0), spb * 1.6, { vol: 0.17 * L.bass, cutoff: 500, envAmt: 900, q: 6, d: 0.12, s: 0.3, detune: 4 });
      else if (style.bass === 'walk' && st % 4 === 0) {
        const walk = [0, 2, 4, 5][st / 4];
        sy.sub(out, t, this.note(root + walk, -2), spb * 3.5, { wave: 'triangle', vol: 0.3 * L.bass, cutoff: 700, envAmt: 300, q: 1, detune: 0, s: 0.7 });
      } else if (style.bass === 'gong' && (st === 0 || st === 8)) {
        sy.sub(out, t, bn, spb * 7, { wave: 'triangle', vol: 0.32 * L.bass, cutoff: 400, envAmt: 200, detune: 0, s: 0.5 });
        if (st === 0 && bar.i % 2 === 0) sy.drum(out, t, 'g', 0.7 * L.bass);
      }
    }
    // ---------------- pad
    if (has('pad') && st === 0) {
      const notes = this.chord(root, style.pad === 'rhodes' ? 4 : 3).map((d) => this.note(d, -1));
      if (style.pad === 'supersaw') sy.pad(out, t, notes, spb * 16, { vol: 0.028 * L.pad });
      else if (style.pad === 'rhodes') for (const n of notes) sy.sub(out, t, n + 12, spb * 14, { wave: 'triangle', vol: 0.06 * L.pad, cutoff: 1600, envAmt: 600, q: 1, detune: 5, a: 0.02, d: 0.8, s: 0.4, r: 0.5, lfo: 6 });
      else if (style.pad === 'bells') for (const n of notes) sy.bell(out, t, n + 12, spb * 16, { vol: 0.05 * L.pad, ratio: 2, index: 90, decay: 3 });
    }
    // ---------------- arpeggio
    if (has('arp')) {
      const tones = this.chord(root, 4);
      if (style.arp === 'eighths' && st % 2 === 0) {
        const d = tones[(st / 2) % tones.length];
        sy.sub(out, t, this.note(d, 1), spb * 1.2, { wave: 'square', vol: 0.05 * L.arp, cutoff: 2200, envAmt: 1800, q: 3, d: 0.08, s: 0.2, detune: 0 });
      } else if (style.arp === 'pluck' && [0, 3, 6, 10, 12].includes(st)) {
        sy.pluck(out, t, this.note(tones[st % 3], 1), spb * 3, { vol: 0.22 * L.arp });
      } else if (style.arp === 'gamelan') {
        // Kotekan: two interlocking parts, one on the beat, one off it.
        const a = this.note(tones[(st >> 1) % 3], 1), b = this.note(tones[((st >> 1) + 1) % 3], 1);
        sy.bell(out, t, st % 2 ? b : a, spb, { vol: 0.07 * L.arp, ratio: 3.5, index: 200, decay: 0.45 });
      }
    }
    // ---------------- lead melody
    if (has('lead') && sec.lead) {
      const mel = s.melody[sec.lead];
      const len = mel.bars ?? 2;
      const pos = (bar.i % len) * 16 + st;
      for (const [at, deg, dur] of mel.notes) {
        if (at !== pos) continue;
        const n = this.note(deg, 1);
        if (style.lead === 'bell') sy.bell(out, t, n, spb * dur, { vol: 0.16 * L.lead, decay: 0.9 + dur * 0.08 });
        else if (style.lead === 'pluck') sy.pluck(out, t, n, spb * dur, { vol: 0.3 * L.lead, damp: 2600 });
        else sy.sub(out, t, n, spb * dur, { wave: 'sawtooth', vol: 0.085 * L.lead, cutoff: 1500, envAmt: 2000, q: 2, lfo: 12, a: 0.02, d: 0.25, s: 0.7, r: 0.2 });
      }
    }
    if (s.chops && has('lead') && s.chops[st] === 'x') sy.chop(out, t, { vol: 0.22, vowel: barIdx + st });
    void midiHz;
  }
}
