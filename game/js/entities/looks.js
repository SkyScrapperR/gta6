// Who wears what: named looks for the story cast and factions (Kai's teal jacket, Mama Lin's orange
// work shirt and apron, navy police uniforms, purple Black Orchid gear, Viktor's white suit, Dex's
// hoodie and headphones) and a seeded generator for varied civilians (skin, hair, outfit, height, build).

export const SKIN_TONES = ['#f1c9a5', '#e0ac83', '#c68a5e', '#a86d45', '#8a5535', '#6a3f26', '#f5d6bc'];
export const HAIR_COLORS = ['#1a1410', '#2a1d14', '#4a2f1d', '#6a4a2a', '#b08a52', '#d9d0c4', '#8a8a8a', '#3a1a2a'];
const TOPS = ['#d8343b', '#2c6fd1', '#f2b63a', '#3aa655', '#e96fa8', '#ffffff', '#f07c2c', '#5a5f9a', '#2a9a8a', '#a0522d', '#ececec', '#6aa0d8'];
const BOTTOMS = ['#2a3140', '#1e1e24', '#5a4a3a', '#3a4a5a', '#c8b48a', '#4a5a3a', '#6a6a72'];

/** Named looks for story characters and factions. */
export const LOOKS = {
  kai: { skin: '#d9a27a', hair: 'quiff', hairColor: '#17110d', top: '#16b3a6', inner: '#1b1d24', bottoms: '#2b3a58', shoes: '#f2f2f2', jacket: true, height: 1.0, build: 1.02 },
  cop: { skin: '#c68a5e', hair: 'peaked', hairColor: '#1a1410', top: '#1c2a4a', inner: '#1c2a4a', bottoms: '#17213a', shoes: '#111111', uniform: true, height: 1.0, build: 1.05 },
  gang: { skin: '#a86d45', hair: 'short', hairColor: '#1a1410', top: '#6a2a8a', inner: '#2a1030', bottoms: '#1a1a20', shoes: '#222', jacket: true, height: 1.0, build: 1.08 },
  lin: { skin: '#e0ac83', hair: 'bun', hairColor: '#a8a8a8', top: '#e8792a', inner: '#e8792a', bottoms: '#3a3a40', shoes: '#4a3a2a', glasses: true, rolled: true, apron: '#5a4434', height: 0.93, build: 1.0, female: true },
  dex: { skin: '#8a5535', hair: 'curly', hairColor: '#1a1410', top: '#3a4a5a', inner: '#22c0d0', bottoms: '#2a2a30', shoes: '#e8e8e8', hoodie: true, headphones: true, height: 0.97, build: 0.95 },
  viktor: { skin: '#f1c9a5', hair: 'slick', hairColor: '#2a2420', top: '#f2f0ea', inner: '#7a2aa0', bottoms: '#f2f0ea', shoes: '#1a1a1a', suit: true, height: 1.04, build: 1.08 },
  rendy: { skin: '#e0ac83', hair: 'cap', hairColor: '#2a1d14', top: '#f2c41a', inner: '#111', bottoms: '#2a2a30', shoes: '#fff', height: 0.98, build: 0.95 },
};

/** A random pedestrian look from a seeded rng. */
export function randomLook(rng) {
  const female = rng.chance(0.5);
  return {
    skin: rng.pick(SKIN_TONES),
    hair: female ? rng.pick(['bun', 'ponytail', 'long', 'curly', 'short']) : rng.pick(['short', 'short', 'cap', 'curly', 'bald', 'slick', 'quiff']),
    hairColor: rng.pick(HAIR_COLORS),
    top: rng.pick(TOPS),
    inner: rng.pick(TOPS),
    bottoms: rng.pick(BOTTOMS),
    shoes: rng.pick(['#f2f2f2', '#222', '#6a4a2a', '#c03a2a']),
    jacket: rng.chance(0.25),
    glasses: rng.chance(0.15),
    headphones: rng.chance(0.08),
    skirt: female && rng.chance(0.35),
    height: rng.range(0.9, 1.06),
    build: rng.range(0.88, 1.15),
    female,
  };
}
