// Selara Nights FM — synthwave, 100-118 BPM. Four songs with saw leads, supersaw pads, pulsing
// octave bass and gated hats.

const DRUMS = {
  soft: { k: 'x.......x.......', h: '..x...x...x...x.' },
  main: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.x.', o: '..............x.' },
  fill: { k: 'x...x...x...x.x.', s: '....x...x.x.xxXX', t: '........x.x.....', T: '............x.x.' },
};
const STYLE = { bass: 'pulse', pad: 'supersaw', arp: 'eighths', lead: 'sub' };
const SECTIONS = {
  intro: { bars: 4, chords: 'A', drums: 'soft', layers: ['pad', 'arp', 'drums'] },
  verse: { bars: 8, chords: 'A', drums: 'main', lead: 'verse' },
  chorus: { bars: 8, chords: 'B', drums: 'main', lead: 'hook' },
  bridge: { bars: 4, chords: 'C', drums: 'soft', layers: ['pad', 'bass', 'lead'], lead: 'verse' },
  outro: { bars: 4, chords: 'A', drums: 'soft', layers: ['pad', 'arp'], fill: false },
};
const ARR = ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'];

export const NEON_TIDE = {
  title: 'Neon Tide', bpm: 110, key: 52, scale: 'minor', mood: 'night drive along the boardwalk',
  style: STYLE, drums: DRUMS, sections: SECTIONS, arrangement: ARR,
  chords: { A: [0, 3, 5, 4], B: [5, 3, 0, 4], C: [3, 4, 5, 5] },
  melody: {
    verse: { bars: 2, notes: [[0, 0, 2], [2, 2, 2], [4, 4, 6], [12, 3, 2], [14, 2, 2], [16, 0, 4], [22, 2, 2], [24, 1, 6]] },
    hook: { bars: 2, notes: [[0, 7, 3], [3, 6, 1], [4, 4, 4], [8, 6, 2], [10, 7, 2], [12, 9, 4], [16, 7, 3], [19, 6, 1], [20, 4, 4], [24, 2, 2], [26, 3, 2], [28, 4, 4]] },
  },
};

export const COASTLINE_RUN = {
  title: 'Coastline Run', bpm: 118, key: 55, scale: 'minor', mood: 'pedal down, sun on the windscreen',
  style: STYLE, drums: DRUMS, sections: SECTIONS, arrangement: ARR,
  chords: { A: [0, 6, 5, 6], B: [2, 6, 0, 4], C: [5, 6, 4, 4] },
  melody: {
    verse: { bars: 2, notes: [[0, 4, 2], [2, 4, 2], [4, 6, 2], [6, 4, 2], [8, 3, 4], [16, 2, 2], [18, 3, 2], [20, 4, 4], [24, 0, 8]] },
    hook: { bars: 2, notes: [[0, 7, 2], [2, 7, 2], [4, 8, 2], [6, 9, 6], [12, 8, 2], [14, 7, 2], [16, 6, 4], [20, 4, 4], [24, 6, 2], [26, 7, 6]] },
  },
};

export const ORCHID_AFTER_DARK = {
  title: 'Orchid After Dark', bpm: 100, key: 50, scale: 'dorian', mood: 'velvet, dangerous, slow-burning',
  style: STYLE, drums: DRUMS, sections: SECTIONS, arrangement: ARR,
  chords: { A: [0, 3, 0, 4], B: [3, 4, 2, 5], C: [6, 5, 3, 4] },
  melody: {
    verse: { bars: 2, notes: [[0, 4, 6], [6, 3, 2], [8, 2, 4], [12, 0, 4], [16, 1, 6], [22, 2, 2], [24, 4, 8]] },
    hook: { bars: 2, notes: [[0, 9, 4], [4, 8, 2], [6, 7, 2], [8, 6, 4], [12, 4, 4], [16, 5, 3], [19, 6, 1], [20, 7, 6], [26, 6, 2], [28, 4, 4]] },
  },
};

export const MIDNIGHT_MERPATI = {
  title: 'Midnight Merpati', bpm: 114, key: 54, scale: 'minor', mood: 'empty streets, warm engine hum',
  style: STYLE, drums: DRUMS, sections: SECTIONS, arrangement: ARR,
  chords: { A: [0, 5, 3, 6], B: [5, 6, 0, 0], C: [3, 6, 2, 4] },
  melody: {
    verse: { bars: 2, notes: [[0, 2, 3], [3, 3, 1], [4, 4, 4], [8, 7, 4], [12, 6, 4], [16, 4, 3], [19, 3, 1], [20, 2, 4], [24, 0, 8]] },
    hook: { bars: 2, notes: [[0, 9, 2], [2, 8, 2], [4, 7, 4], [8, 4, 2], [10, 6, 2], [12, 7, 4], [16, 9, 2], [18, 8, 2], [20, 7, 2], [22, 6, 2], [24, 7, 8]] },
  },
};
