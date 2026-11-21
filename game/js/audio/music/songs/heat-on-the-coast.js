// "Heat on the Coast" — the title theme. A minor synthwave, 104 BPM. The 8-bar hook (two 4-bar
// phrases, the second answering the first an octave of tension higher) loops seamlessly; the credits
// play the full arrangement as a reprise.
export default {
  title: 'Heat on the Coast', bpm: 104, key: 57, scale: 'minor', mood: 'neon dusk, hopeful, driving',
  style: { bass: 'pulse', pad: 'supersaw', arp: 'eighths', lead: 'sub' },
  chords: { A: [0, 5, 2, 6], B: [3, 4, 0, 0], C: [5, 3, 0, 4] },
  sections: {
    intro: { bars: 4, chords: 'A', drums: 'soft', layers: ['pad', 'arp', 'drums'] },
    hook: { bars: 8, chords: 'A', drums: 'main', lead: 'hook' },
    verse: { bars: 8, chords: 'C', drums: 'main', lead: 'verse' },
    chorus: { bars: 8, chords: 'A', drums: 'main', lead: 'hook' },
    bridge: { bars: 4, chords: 'B', drums: 'soft', layers: ['pad', 'bass', 'lead'], lead: 'bridge' },
    outro: { bars: 4, chords: 'A', drums: 'soft', layers: ['pad', 'arp'], fill: false },
  },
  arrangement: ['intro', 'hook', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
  drums: {
    soft: { k: 'x.......x.......', h: '..x...x...x...x.' },
    main: { k: 'x...x...x...x...', s: '....x.......x...', h: 'x.x.x.x.x.x.x.xx', c: '............x...' },
    fill: { k: 'x...x...x.x.x.x.', s: '....x...x.xxXxXX', t: '..........x.x...', T: '...........x.x..' },
  },
  melody: {
    // Hook: E-D-C-D-E . G-E | D-C-A . C-D (scale degrees of A minor, +7 = octave)
    hook: { bars: 4, notes: [[0, 4, 3], [3, 3, 1], [4, 2, 2], [6, 3, 2], [8, 4, 4], [12, 6, 2], [14, 4, 2], [16, 3, 3], [19, 2, 1], [20, 0, 4], [26, 2, 2], [28, 3, 4], [32, 4, 3], [35, 3, 1], [36, 2, 2], [38, 3, 2], [40, 4, 4], [44, 7, 2], [46, 6, 2], [48, 4, 6], [56, 3, 2], [58, 2, 2], [60, 0, 4]] },
    verse: { bars: 2, notes: [[0, 2, 2], [2, 2, 2], [4, 4, 4], [10, 2, 2], [12, 1, 4], [16, 0, 2], [18, 0, 2], [20, 2, 4], [26, 4, 2], [28, 3, 4]] },
    bridge: { bars: 4, notes: [[0, 5, 8], [8, 4, 8], [16, 3, 8], [24, 4, 8], [32, 5, 8], [40, 6, 8], [48, 7, 12]] },
  },
};
