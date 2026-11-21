// Ombak Lo-Fi — 72-88 BPM, jazzy 7th/9th chords on a soft Rhodes, walking bass, swung drums,
// plucked melodies and vinyl crackle.

const DRUMS = {
  soft: { k: 'x.........x.....', h: '..x...x...x...x.', x: 'x.x.x.x.x.x.x.x.' },
  main: { k: 'x.........x..x..', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.' },
  fill: { k: 'x.........x.....', s: '....x.......x.xx', h: 'x.x.x.x.x.x.....' },
};
const STYLE = { bass: 'walk', pad: 'rhodes', arp: 'pluck', lead: 'pluck' };
const SECTIONS = {
  intro: { bars: 4, chords: 'A', drums: 'soft', layers: ['pad', 'drums'] },
  verse: { bars: 8, chords: 'A', drums: 'main', layers: ['drums', 'bass', 'pad', 'arp'] },
  chorus: { bars: 8, chords: 'B', drums: 'main', lead: 'hook' },
  bridge: { bars: 4, chords: 'C', drums: 'soft', layers: ['pad', 'bass', 'lead'], lead: 'hook' },
  outro: { bars: 4, chords: 'A', drums: 'soft', layers: ['pad'], fill: false },
};
const ARR = ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'outro'];

export const RAIN_ON_KEMUNING = {
  title: 'Rain on Kemuning', bpm: 78, key: 50, scale: 'dorian', swing: 0.28, vinyl: true, mood: 'rain on awnings, late coffee',
  style: STYLE, drums: DRUMS, sections: SECTIONS, arrangement: ARR,
  chords: { A: [1, 4, 0, 0], B: [3, 2, 1, 4], C: [5, 4, 3, 4] },
  melody: { hook: { bars: 2, notes: [[0, 6, 4], [6, 4, 2], [8, 3, 4], [14, 2, 2], [16, 4, 6], [24, 1, 4], [28, 2, 4]] } },
};

export const WARUNG_AT_2AM = {
  title: 'Warung at 2AM', bpm: 84, key: 53, scale: 'major', swing: 0.3, vinyl: true, mood: 'noodles, neon flicker, quiet talk',
  style: STYLE, drums: DRUMS, sections: SECTIONS, arrangement: ARR,
  chords: { A: [0, 5, 1, 4], B: [3, 2, 5, 4], C: [1, 4, 0, 5] },
  melody: { hook: { bars: 2, notes: [[0, 4, 2], [2, 6, 2], [4, 7, 4], [10, 6, 2], [12, 4, 4], [16, 5, 2], [18, 4, 2], [20, 2, 4], [26, 1, 2], [28, 2, 4]] } },
};

export const SLOW_WAVES = {
  title: 'Slow Waves', bpm: 72, key: 48, scale: 'major', swing: 0.25, vinyl: true, mood: 'low tide, sunrise, nowhere to be',
  style: STYLE, drums: DRUMS, sections: SECTIONS, arrangement: ARR,
  chords: { A: [3, 0, 3, 4], B: [5, 3, 0, 4], C: [3, 4, 5, 4] },
  melody: { hook: { bars: 2, notes: [[0, 2, 6], [6, 4, 2], [8, 6, 8], [16, 5, 4], [20, 4, 4], [24, 2, 8]] } },
};
