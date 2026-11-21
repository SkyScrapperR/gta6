// Gamelan Wave — an original fusion of pelog/slendro-inspired FM bells and gongs with electronic
// beats, 110-124 BPM, interlocking kotekan arpeggios. "Kecak Circuit" adds rhythmic vocal-like chops
// made from formant-filtered noise.

const DRUMS = {
  soft: { k: 'x.......x.......', x: '..x...x...x...x.' },
  main: { k: 'x..x..x...x..x..', c: '....x.......x...', h: 'x.xxx.xxx.xxx.xx' },
  fill: { k: 'x..x..x...x.x.x.', c: '....x...x.x.xxxx', t: '..........x.x...', T: '...........x.x.x' },
};
const STYLE = { bass: 'gong', pad: 'bells', arp: 'gamelan', lead: 'bell' };
const SECTIONS = {
  intro: { bars: 4, chords: 'A', drums: 'soft', layers: ['bass', 'arp'] },
  verse: { bars: 8, chords: 'A', drums: 'main', layers: ['drums', 'bass', 'arp', 'pad'] },
  chorus: { bars: 8, chords: 'B', drums: 'main', lead: 'hook' },
  bridge: { bars: 4, chords: 'A', drums: 'soft', layers: ['bass', 'lead', 'pad'], lead: 'hook' },
  outro: { bars: 4, chords: 'A', drums: 'soft', layers: ['bass', 'arp'], fill: false },
};
const ARR = ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'];

export const BUKIT_ASRI_SUNRISE = {
  title: 'Bukit Asri Sunrise', bpm: 112, key: 62, scale: 'pelog', mood: 'mist over the hills, a city waking',
  style: STYLE, drums: DRUMS, sections: SECTIONS, arrangement: ARR,
  chords: { A: [0, 2, 0, 4], B: [4, 3, 2, 0] },
  melody: { hook: { bars: 2, notes: [[0, 4, 2], [2, 3, 2], [4, 2, 2], [6, 0, 4], [12, 2, 2], [14, 3, 2], [16, 4, 4], [20, 6, 2], [22, 4, 2], [24, 3, 4], [28, 2, 4]] } },
};

export const PIER_9 = {
  title: 'Pier 9', bpm: 120, key: 60, scale: 'slendro', mood: 'cranes, containers, distant horns',
  style: STYLE, drums: DRUMS, sections: SECTIONS, arrangement: ARR,
  chords: { A: [0, 3, 1, 4], B: [3, 4, 0, 1] },
  melody: { hook: { bars: 2, notes: [[0, 0, 2], [2, 1, 2], [4, 2, 2], [6, 4, 2], [8, 5, 4], [12, 4, 4], [16, 2, 2], [18, 1, 2], [20, 0, 2], [22, 1, 2], [24, 2, 8]] } },
};

export const KECAK_CIRCUIT = {
  title: 'Kecak Circuit', bpm: 124, key: 59, scale: 'pelog', mood: 'firelight chant meets drum machine',
  style: STYLE, drums: DRUMS, sections: SECTIONS, arrangement: ARR,
  chops: 'x.x..x.x.x..x.x.',
  chords: { A: [0, 0, 3, 2], B: [4, 3, 2, 0] },
  melody: { hook: { bars: 2, notes: [[0, 6, 2], [4, 4, 2], [6, 3, 2], [8, 4, 4], [16, 2, 2], [18, 3, 2], [20, 4, 2], [24, 0, 8]] } },
};
