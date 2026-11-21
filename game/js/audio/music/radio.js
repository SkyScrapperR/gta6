// Music director and car radio. Three stations (Selara Nights FM, Ombak Lo-Fi, Gamelan Wave) plus
// Off. Stations keep playing in the background: each runs on a shared clock, so tuning back in lands
// where the station would be "live". A synthesized jingle plays between songs. R switches station in
// a car and the HUD shows the station and song. Leaving the car the radio keeps playing muffled for a
// moment, then fades. Outside the radio the score plays: the title theme, chase layers that fade in
// by star level, warm and dark cutscene themes, and the credits reprise of the title theme.

import { Sequencer, songLength } from './sequencer.js';
import { MusicBus } from './fx.js';
import TITLE from './songs/heat-on-the-coast.js';
import { NEON_TIDE, COASTLINE_RUN, ORCHID_AFTER_DARK, MIDNIGHT_MERPATI } from './songs/selara-nights.js';
import { RAIN_ON_KEMUNING, WARUNG_AT_2AM, SLOW_WAVES } from './songs/ombak-lofi.js';
import { BUKIT_ASRI_SUNRISE, PIER_9, KECAK_CIRCUIT } from './songs/gamelan-wave.js';

export const STATIONS = [
  { name: 'Selara Nights FM', color: '#ff3fa4', songs: [NEON_TIDE, COASTLINE_RUN, ORCHID_AFTER_DARK, MIDNIGHT_MERPATI], jingle: [64, 67, 71, 76] },
  { name: 'Ombak Lo-Fi', color: '#9ad0ff', songs: [RAIN_ON_KEMUNING, WARUNG_AT_2AM, SLOW_WAVES], jingle: [60, 64, 67, 71, 74] },
  { name: 'Gamelan Wave', color: '#ffd23a', songs: [BUKIT_ASRI_SUNRISE, PIER_9, KECAK_CIRCUIT], jingle: [62, 63, 66, 70, 73] },
];
export const ALL_SONGS = [TITLE, ...STATIONS.flatMap((s) => s.songs)];
const JINGLE = 4;

export class MusicDirector {
  constructor(audio) {
    this.audio = audio;
    this.station = -1; // -1 = off
    this.mode = 'none';
    this.clockStart = 0;
    this.lastStarLayer = -1;
  }

  /** Built lazily once the AudioContext exists (first user gesture). */
  ensure() {
    const a = this.audio;
    if (this.seq || !a.ctx) return !!this.seq;
    this.bus = new MusicBus(a.ctx, a.musicBus);
    this.radioBus = new MusicBus(a.ctx, a.radioBus);
    this.seq = new Sequencer(a.ctx, a.noise, this.bus.input);
    this.radioSeq = new Sequencer(a.ctx, a.noise, this.radioBus.input);
    this.clockStart = a.ctx.currentTime - 37; // stations have been on air for a while
    if (this.pending) { const p = this.pending; this.pending = null; p(); }
    return true;
  }

  /** Where station k is "live" right now: song index and offset seconds (or a jingle). */
  livePosition(k) {
    const st = STATIONS[k];
    const lens = st.songs.map((s) => songLength(s) + JINGLE);
    const total = lens.reduce((a, b) => a + b, 0);
    let t = ((this.audio.ctx.currentTime - this.clockStart + k * 61) % total + total) % total;
    for (let i = 0; i < lens.length; i++) {
      if (t < lens[i]) return { i, offset: t - JINGLE, jingle: t < JINGLE };
      t -= lens[i];
    }
    return { i: 0, offset: 0, jingle: true };
  }

  jingle(k) {
    const sy = this.radioSeq.synth;
    const t = this.audio.ctx.currentTime + 0.05;
    STATIONS[k].jingle.forEach((n, i) => sy.bell(this.radioBus.input, t + i * 0.16, n + 12, 0.4, { vol: 0.12, decay: 0.8 }));
    sy.noiseHit(this.radioBus.input, t, { type: 'bandpass', freq: 600, sweep: 5000, vol: 0.08, a: 0.6, decay: 0.1 });
  }

  /** Tune the radio to station k (or -1 for off) and start it at its live position. */
  tune(k, world) {
    if (!this.ensure()) { this.pending = () => this.tune(k, world); return; }
    this.station = k;
    this.radioSeq.stop();
    clearTimeout(this.nextT);
    if (k < 0) {
      world?.notes.push({ slot: 'radio', text: 'Radio Off', color: '#c8cce0', duration: 2, key: 'radio' });
      return;
    }
    const st = STATIONS[k];
    const pos = this.livePosition(k);
    const song = st.songs[pos.i];
    const startSong = (i, offset) => {
      const s = st.songs[i];
      this.radioBus.setTempo(s.bpm);
      this.radioSeq.play(s, {
        offset,
        onEnd: () => {
          this.jingle(k);
          this.nextT = setTimeout(() => { if (this.station === k) startSong((i + 1) % st.songs.length, 0); }, JINGLE * 1000);
        },
      });
      world?.notes.push({ slot: 'radio', text: st.name, sub: `♪ ${s.title}`, color: st.color, duration: 4, key: 'radio' });
    };
    if (pos.jingle) {
      this.jingle(k);
      this.nextT = setTimeout(() => { if (this.station === k) startSong(pos.i, 0); }, (JINGLE - (pos.offset + JINGLE)) * 1000);
      world?.notes.push({ slot: 'radio', text: st.name, sub: `♪ ${song.title} — next`, color: st.color, duration: 4, key: 'radio' });
    } else startSong(pos.i, Math.max(0, pos.offset));
  }

  /** Score: the title theme loop. */
  playTitle() {
    if (!this.ensure()) { this.pending = () => this.playTitle(); return; }
    this.mode = 'title';
    this.seq.layers = { drums: 1, bass: 1, pad: 1, arp: 1, lead: 1 };
    this.bus.setTempo(TITLE.bpm);
    this.bus.setMode('clean');
    this.bus.setLevel(1);
    this.seq.play(TITLE, { loop: true });
  }

  playCredits() {
    if (!this.ensure()) return;
    this.mode = 'credits';
    this.seq.layers = { drums: 1, bass: 1, pad: 1, arp: 1, lead: 1 };
    this.bus.setLevel(1);
    this.seq.play(TITLE, { onEnd: () => { this.mode = 'none'; } });
  }

  /** Cutscene themes: warm (Lin) is the title theme's bridge feel, dark (Viktor) strips it to bass and pad. */
  playTheme(kind) {
    if (!this.ensure()) return;
    this.mode = `theme-${kind}`;
    this.seq.layers = kind === 'dark' ? { drums: 0, bass: 1, pad: 1, arp: 0, lead: 0 } : { drums: 0, bass: 0.6, pad: 1, arp: 1, lead: 0.7 };
    this.bus.setLevel(0.8);
    this.seq.play(kind === 'dark' ? ORCHID_AFTER_DARK : TITLE, { loop: true, offset: kind === 'dark' ? 0 : 20 });
  }

  stopScore() {
    if (!this.seq) return;
    this.bus.setLevel(0, 0.6);
    setTimeout(() => { if (this.mode === 'none') this.seq.stop(); }, 1500);
    this.mode = 'none';
  }

  /** Per frame: radio in cars, chase layers by star level, the right score for the situation. */
  update(dt, w) {
    if (!this.ensure()) return;
    const app = w.app;
    const inCar = !!w.player.vehicle;
    if (w.input.pressed('KeyR') && inCar && w.controlsOn) {
      const next = this.station + 1 >= STATIONS.length ? -1 : this.station + 1;
      this.tune(next, w);
    }
    // Radio: clean-ish car EQ inside, muffled and fading after leaving the car.
    if (this.station >= 0) {
      if (inCar) { this.radioBus.setMode('radio'); this.radioBus.setLevel(1, 0.3); this.outT = 0; }
      else {
        this.outT = (this.outT ?? 0) + dt;
        this.radioBus.setMode('muffled');
        this.radioBus.setLevel(this.outT < 2.5 ? 0.6 : 0, 1.2);
      }
    }
    if (inCar && !this.wasInCar && this.station < 0 && this.autoTuned !== true) { this.autoTuned = true; this.tune(0, w); }
    this.wasInCar = inCar;
    if (app?.state === 'title') return;
    if (this.mode === 'credits') return;
    // Cutscene themes.
    if (w.cinematic) {
      const dark = Object.keys(w.dialogue?.actors ?? {}).includes('viktor');
      const want = dark ? 'theme-dark' : 'theme-warm';
      if (this.mode !== want) this.playTheme(dark ? 'dark' : 'warm');
      return;
    }
    // Chase music: layers by star level when the radio is silent or a mission is running.
    const stars = w.wanted.stars;
    const radioAudible = this.station >= 0 && inCar;
    const missionFight = w.missions?.active && !radioAudible;
    if ((stars > 0 && !radioAudible) || missionFight) {
      if (this.mode !== 'chase') {
        this.mode = 'chase';
        this.bus.setMode('clean');
        this.seq.play(COASTLINE_RUN, { loop: true, offset: 16 });
        this.lastStarLayer = -1;
      }
      const lvl = Math.max(stars, missionFight ? 1 : 0);
      if (lvl !== this.lastStarLayer) {
        this.lastStarLayer = lvl;
        this.seq.layers = { pad: 1, bass: lvl >= 1 ? 1 : 0, drums: lvl >= 2 ? 1 : lvl >= 1 ? 0.5 : 0, arp: lvl >= 3 ? 1 : 0, lead: lvl >= 4 ? 1 : 0 };
        this.bus.setLevel(0.45 + lvl * 0.1);
      }
    } else if (this.mode !== 'none') this.stopScore();
  }

  setVolumes() {}
  radioOn(k) { this.tune(k, this.world); }
  sting() {}
}
