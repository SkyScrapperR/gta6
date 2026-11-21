// Smooth low-poly humanoids: tapered 8-12 sided limbs, rounded torso, a head with large stylized
// eyes, brows, nose and mouth, shaped hair (short, spiky, bun, cap, ponytail, curly, slick, peaked
// police cap), clothing details (collars, belts, two-tone tops, hoodies, suits) and accessories
// (glasses, headphones). Each body part follows one bone; poses come from a procedural animator.

import { MeshBuilder, MAT } from '../engine/mesh-builder.js';
import { createMesh } from '../engine/gl.js';
import { m4compose, m4mul, hex, lerp, clamp } from '../core/math.js';

export const BONE = { HIPS: 0, CHEST: 1, HEAD: 2, UARM_L: 3, FARM_L: 4, UARM_R: 5, FARM_R: 6, THIGH_L: 7, SHIN_L: 8, THIGH_R: 9, SHIN_R: 10 };
const PARENT = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9];

/** Joint offsets from the parent joint (metres, before scaling by height). */
const OFFSET = [
  [0, 0.95, 0], // hips from feet origin
  [0, 0.1, 0], // chest base from hips
  [0, 0.6, 0], // head base (neck top) from chest base
  [0.19, 0.44, 0], // left shoulder
  [0, -0.29, 0], // left elbow
  [-0.19, 0.44, 0], // right shoulder
  [0, -0.29, 0], // right elbow
  [0.1, -0.04, 0], // left hip joint
  [0, -0.43, 0], // left knee
  [-0.1, -0.04, 0], // right hip joint
  [0, -0.43, 0], // right knee
];

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

const HEAD_SCALE = 1.15;

/**
 * Hair shell around the head with a hairline: vertices over the face and below the nape are pulled
 * inside the skull, everything else sits just outside it, so the hair reads as a shaped cut.
 */
function hairCap(b, hy, nape, lift = 1.06) {
  const segW = 18, segH = 12;
  const base = b.vertexCount;
  for (let y = 0; y <= segH; y++) {
    const phi = (y / segH) * Math.PI;
    for (let x = 0; x <= segW; x++) {
      const th = (x / segW) * Math.PI * 2;
      const nx = Math.cos(th) * Math.sin(phi), ny = Math.cos(phi), nz = Math.sin(th) * Math.sin(phi);
      const face = nz > 0.25 && ny < 0.48 - (Math.abs(nx) < 0.4 ? 0.0 : 0.18);
      const low = ny < nape || (nz > -0.25 && ny < -0.02);
      const r = face || low ? 0.8 : lift;
      b.vertex(nx * 0.104 * r, hy + ny * 0.122 * r, 0.003 + nz * 0.113 * r, nx, ny, nz);
    }
  }
  for (let y = 0; y < segH; y++) {
    for (let x = 0; x < segW; x++) {
      const a = base + y * (segW + 1) + x, c = a + segW + 1;
      b.i.push(a, a + 1, c + 1, a, c + 1, c);
    }
  }
}

/** Head (bone-local, origin at the top of the neck): skull, jaw, face, ears, hair and accessories. */
function buildHead(b, look, skin, hairC) {
  const hy = 0.12;
  // Skull and jaw, smooth normals; cheeks a touch warmer for subtle skin shading.
  b.paint(skin, MAT.SKIN).sphere(0, hy, 0.003, 0.104, 0.122, 0.113, 16, 12);
  b.sphere(0, hy - 0.062, 0.028, 0.076, 0.058, 0.08, 12, 8);
  b.paint(skin.map((c, i) => Math.min(1, c * (i === 0 ? 1.02 : 0.99))), MAT.SKIN);
  for (const sx of [-1, 1]) b.sphere(sx * 0.055, hy - 0.024, 0.07, 0.03, 0.02, 0.02, 8, 5);
  b.paint(skin.map((c) => c * 0.92), MAT.SKIN);
  for (const sx of [-1, 1]) b.sphere(sx * 0.104, hy - 0.002, -0.004, 0.017, 0.03, 0.02, 8, 5); // ears
  b.paint(skin, MAT.SKIN).sphere(0, hy - 0.002, 0.113, 0.016, 0.024, 0.02, 8, 5); // nose
  // Eyes: large whites, coloured iris, pupil and a catch-light.
  for (const sx of [-1, 1]) {
    const ex = sx * 0.042, ey = hy + 0.028;
    b.paint([0.96, 0.96, 0.95], MAT.SKIN).sphere(ex, ey, 0.094, 0.03, 0.024, 0.014, 10, 7);
    b.paint(hex(look.eyes ?? '#4a2e1c'), MAT.SKIN).sphere(ex, ey - 0.002, 0.104, 0.017, 0.018, 0.008, 10, 6);
    b.paint([0.02, 0.02, 0.02], MAT.SKIN).sphere(ex, ey - 0.002, 0.109, 0.009, 0.01, 0.005, 8, 5);
    b.paint([1, 1, 1], MAT.NEON, 0.25).sphere(ex + 0.006, ey + 0.006, 0.112, 0.004, 0.004, 0.003, 4, 3);
    b.paint(hairC.map((c) => c * 0.85 + 0.02), MAT.SKIN);
    b.push().transform(ex, ey + 0.036, 0.099, 0, -0.2, sx * (look === LOOKS.viktor ? 0.28 : 0.1)).bevelBox(0, 0, 0, 0.048, 0.011, 0.016, 0.005).pop();
  }
  b.paint(hex(look.female ? '#b04a5c' : '#80423a'), MAT.SKIN).bevelBox(0, hy - 0.058, 0.103, 0.04, 0.01, 0.012, 0.004); // mouth
  b.paint(skin.map((c) => c * 0.88), MAT.SKIN).bevelBox(0, hy - 0.047, 0.108, 0.022, 0.004, 0.006, 0.002); // upper lip shade
  if (look.glasses) {
    b.paint(hex('#151515'), MAT.METAL);
    for (const sx of [-1, 1]) {
      const ex = sx * 0.042, ey = hy + 0.026;
      b.box(ex, ey + 0.022, 0.118, 0.052, 0.006, 0.006).box(ex, ey - 0.02, 0.118, 0.052, 0.006, 0.006);
      b.box(ex + 0.026, ey, 0.118, 0.006, 0.046, 0.006).box(ex - 0.026, ey, 0.118, 0.006, 0.046, 0.006);
      b.box(sx * 0.1, ey + 0.02, 0.055, 0.006, 0.006, 0.12);
    }
    b.box(0, hy + 0.034, 0.12, 0.02, 0.005, 0.005);
  }
  // Hair: shaped meshes that sit on the skull.
  const style = look.hair;
  b.paint(hairC, MAT.CLOTH);
  const long = look.female && style !== 'bun';
  if (style !== 'bald' && style !== 'peaked' && style !== 'cap') hairCap(b, hy, long ? -0.6 : -0.38);
  if (style === 'quiff') {
    // Swept-back quiff: soft lobes lying on the crown, rising slightly at the front.
    for (let k = 0; k < 5; k++) {
      const x = (k - 2) * 0.032;
      b.push().transform(x, hy + 0.105 - Math.abs(k - 2) * 0.008, 0.035, 0, -0.55, (k - 2) * 0.12);
      b.sphere(0, 0, 0, 0.034, 0.03, 0.07, 8, 5);
      b.pop();
    }
    b.sphere(0, hy + 0.1, -0.03, 0.09, 0.045, 0.09, 10, 6);
  } else if (style === 'bun') {
    b.sphere(0, hy + 0.1, -0.085, 0.055, 0.052, 0.055, 10, 7);
    b.sphere(0, hy + 0.075, -0.06, 0.045, 0.02, 0.03, 8, 4);
  } else if (style === 'ponytail') {
    b.limb(0, hy + 0.06, -0.11, 0, hy - 0.18, -0.15, 0.036, 0.018, 7);
  } else if (style === 'long') {
    b.bevelBox(0, hy - 0.1, -0.055, 0.22, 0.28, 0.1, 0.05);
  } else if (style === 'curly') {
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      b.sphere(Math.cos(a) * 0.092, hy + 0.07 + (k % 3) * 0.015, Math.sin(a) * 0.092 - 0.01, 0.04, 0.04, 0.04, 7, 5);
    }
    b.sphere(0, hy + 0.11, -0.01, 0.085, 0.05, 0.085, 10, 6);
  } else if (style === 'slick') {
    b.paint(hairC.map((c) => c + 0.06), MAT.PAINT).sphere(0, hy + 0.065, -0.004, 0.105, 0.075, 0.115, 12, 7);
  } else if (style === 'cap') {
    hairCap(b, hy, -0.38);
    b.paint(hex(look.capColor ?? '#c03a2a'), MAT.CLOTH).sphere(0, hy + 0.05, 0, 0.112, 0.095, 0.118, 14, 8, { yMin: 0.0 });
    b.bevelBox(0, hy + 0.052, 0.14, 0.15, 0.012, 0.09, 0.005);
  } else if (style === 'peaked') {
    hairCap(b, hy, -0.38, 1.02);
    const navy = hex('#16213d');
    b.paint(navy, MAT.CLOTH).cylinder(0, hy + 0.055, -0.004, 0.114, 0.124, 0.085, 16, { top: false });
    b.paint(navy, MAT.CLOTH).cylinder(0, hy + 0.14, -0.004, 0.138, 0.138, 0.028, 16);
    b.paint(hex('#0a0a0a'), MAT.PAINT).push().transform(0, hy + 0.062, 0.11, 0, 0.28, 0).bevelBox(0, 0, 0.025, 0.17, 0.012, 0.08, 0.004).pop();
    b.paint(hex('#d9b84a'), MAT.METAL).bevelBox(0, hy + 0.11, 0.126, 0.032, 0.034, 0.01, 0.004);
    b.paint(hex('#0a0a0a'), MAT.CLOTH).cylinder(0, hy + 0.055, -0.004, 0.117, 0.117, 0.018, 16, { top: false });
  }
  if (look.headphones) {
    b.paint(hex('#1a1a1a'), MAT.PAINT);
    b.limb(-0.112, hy + 0.02, 0, -0.07, hy + 0.14, 0, 0.011, 0.011, 6).limb(-0.07, hy + 0.14, 0, 0.07, hy + 0.14, 0, 0.011, 0.011, 6).limb(0.07, hy + 0.14, 0, 0.112, hy + 0.02, 0, 0.011, 0.011, 6);
    b.paint(hex('#22c0d0'), MAT.PAINT);
    for (const sx of [-1, 1]) b.push().transform(sx * 0.115, hy, 0, 0, 0, Math.PI / 2).cylinder(0, -0.02, 0, 0.04, 0.04, 0.04, 12, { bottom: true }).pop();
  }
}

/** Build the rigged mesh for a look. Geometry is authored in each bone's local space. */
export function buildCharacter(gl, look) {
  const b = new MeshBuilder();
  const skin = hex(look.skin), top = hex(look.top), inner = hex(look.inner ?? look.top), bottoms = hex(look.bottoms), shoes = hex(look.shoes), hairC = hex(look.hairColor);
  const w = look.build ?? 1;
  const fem = !!look.female;
  const layered = look.jacket || look.suit || look.hoodie;
  const longSleeve = layered || look.uniform;
  const S = 10;

  // ---------------- hips: pelvis, slim belt, optional skirt
  b.setBone(BONE.HIPS);
  b.paint(bottoms, MAT.CLOTH).bevelBox(0, -0.02, 0, 0.29 * w * (fem ? 1.05 : 1), 0.2, 0.185, 0.07, { taperX: 1.04 });
  b.paint(hex(look.uniform ? '#0d0d0d' : '#1c1814'), MAT.CLOTH).bevelBox(0, 0.072, 0, 0.297 * w * (fem ? 1.05 : 1), 0.035, 0.19, 0.012);
  b.paint(hex('#b8a060'), MAT.METAL).box(0, 0.072, 0.096, 0.035, 0.026, 0.006);
  if (look.skirt) b.paint(bottoms, MAT.CLOTH).cylinder(0, -0.33, 0, 0.25 * w, 0.165 * w, 0.4, 14, { top: false });

  // ---------------- chest: tapered torso (waist -> chest), neck
  b.setBone(BONE.CHEST);
  const tw = 0.27 * w, taper = fem ? 1.16 : 1.3;
  b.paint(layered ? inner : top, MAT.CLOTH).bevelBox(0, 0.25, 0, tw, 0.5, 0.18, 0.075, { taperX: taper, taperZ: 1.06 });
  if (fem) b.sphere(0, 0.33, 0.06, 0.1 * w, 0.06, 0.05, 10, 6);
  // Rounded shoulder caps that sit inside the silhouette (no pillows).
  b.paint(longSleeve ? top : top, MAT.CLOTH);
  for (const sx of [-1, 1]) b.sphere(sx * 0.165 * w, 0.455, 0, 0.058 * w, 0.05, 0.062, 10, 6, { yMin: -0.2 });
  if (look.jacket || look.suit) {
    // Open jacket: two front panels leave the T-shirt visible, a back panel, a turned collar.
    b.paint(top, MAT.CLOTH);
    for (const sx of [-1, 1]) {
      b.push().transform(sx * 0.088 * w, 0, 0.012);
      b.bevelBox(0, 0.2, 0, 0.105 * w, 0.62, 0.17, 0.04, { taperX: 1.34 });
      b.pop();
    }
    b.bevelBox(0, 0.21, -0.03, tw + 0.02, 0.62, 0.13, 0.06, { taperX: taper + 0.04 });
    b.paint(top.map((c) => c * 0.82), MAT.CLOTH);
    b.bevelBox(0, 0.52, -0.055, 0.17, 0.065, 0.05, 0.02);
    for (const sx of [-1, 1]) b.push().transform(sx * 0.07, 0.5, 0.075, 0, -0.35, sx * 0.55).bevelBox(0, 0, 0, 0.045, 0.12, 0.022, 0.008).pop();
    // Crew neck of the shirt underneath.
    b.paint(inner.map((c) => c * 0.9), MAT.CLOTH).cylinder(0, 0.49, 0, 0.075, 0.068, 0.03, 12);
    if (look.suit) b.paint(inner.map((c) => c * 0.7), MAT.CLOTH).box(0, 0.4, 0.095, 0.03, 0.13, 0.008);
  } else if (look.hoodie) {
    b.paint(top, MAT.CLOTH).bevelBox(0, 0.25, 0.004, tw + 0.025, 0.52, 0.19, 0.08, { taperX: taper });
    b.sphere(0, 0.5, -0.09, 0.13, 0.08, 0.07, 10, 6);
    b.paint(top.map((c) => c * 0.85), MAT.CLOTH).bevelBox(0, 0.12, 0.1, 0.17, 0.09, 0.02, 0.01);
    b.paint(inner, MAT.CLOTH).limb(-0.04, 0.47, 0.09, -0.045, 0.3, 0.1, 0.006, 0.006, 4).limb(0.04, 0.47, 0.09, 0.045, 0.3, 0.1, 0.006, 0.006, 4);
  } else {
    b.paint(inner, MAT.CLOTH).bevelBox(0, 0.04, 0, tw * 1.01, 0.07, 0.185, 0.03);
    b.paint(top.map((c) => c * 0.85), MAT.CLOTH).cylinder(0, 0.49, 0, 0.075, 0.066, 0.035, 12);
  }
  if (look.uniform) {
    b.paint(hex('#c9a640'), MAT.METAL).bevelBox(-0.075, 0.4, 0.096, 0.04, 0.048, 0.01, 0.004);
    b.paint(top.map((c) => c * 0.8), MAT.CLOTH).bevelBox(0.075, 0.33, 0.094, 0.07, 0.065, 0.012, 0.005).bevelBox(-0.075, 0.33, 0.094, 0.07, 0.065, 0.012, 0.005);
    b.paint(hex('#e8e8e8'), MAT.CLOTH).box(0.16 * w, 0.485, 0.0, 0.03, 0.012, 0.1).box(-0.16 * w, 0.485, 0.0, 0.03, 0.012, 0.1);
  }
  if (look.apron) {
    b.paint(hex(look.apron), MAT.CLOTH).bevelBox(0, 0.2, 0.095, 0.24, 0.4, 0.015, 0.006);
    b.limb(-0.08, 0.4, 0.098, -0.05, 0.55, 0.03, 0.006, 0.006, 4).limb(0.08, 0.4, 0.098, 0.05, 0.55, 0.03, 0.006, 0.006, 4);
    b.setBone(BONE.HIPS);
    b.paint(hex(look.apron), MAT.CLOTH).bevelBox(0, -0.12, 0.1, 0.25, 0.32, 0.014, 0.006);
    b.setBone(BONE.CHEST);
  }
  b.paint(skin, MAT.SKIN).cylinder(0, 0.48, 0, 0.048, 0.044, 0.15, S);

  // ---------------- head, scaled up for the stylised 1:6.5 proportion
  b.setBone(BONE.HEAD);
  b.push().transform(0, 0, 0, 0, 0, 0, HEAD_SCALE);
  buildHead(b, look, skin, hairC);
  b.pop();

  // ---------------- arms: tapered, elbow definition, mitten hands
  for (const [ub, fb, sx] of [[BONE.UARM_L, BONE.FARM_L, 1], [BONE.UARM_R, BONE.FARM_R, -1]]) {
    b.setBone(ub);
    const sleeveEnd = longSleeve ? -0.29 : look.rolled ? -0.2 : -0.13;
    b.paint(skin, MAT.SKIN).limb(0, 0, 0, 0, -0.28, 0, 0.05 * w, 0.042 * w, S);
    b.paint(top, MAT.CLOTH).cylinder(0, sleeveEnd, 0, 0.054 * w, 0.058 * w, -sleeveEnd + 0.02, S, { top: false });
    if (look.rolled) b.paint(top.map((c) => c * 0.85), MAT.CLOTH).cylinder(0, sleeveEnd - 0.01, 0, 0.058 * w, 0.058 * w, 0.04, S);
    b.paint(longSleeve ? top : skin, longSleeve ? MAT.CLOTH : MAT.SKIN).sphere(0, -0.28, 0, 0.046 * w, 0.046, 0.046 * w, 8, 5);
    b.setBone(fb);
    b.paint(longSleeve ? top : skin, longSleeve ? MAT.CLOTH : MAT.SKIN).limb(0, 0, 0, 0, -0.24, 0, 0.043 * w, 0.034 * w, S);
    if (layered) b.paint(inner, MAT.CLOTH).cylinder(0, -0.25, 0, 0.036, 0.036, 0.02, S);
    // Mitten hand: palm block plus a thumb.
    b.paint(skin, MAT.SKIN).bevelBox(0, -0.3, 0.004, 0.066, 0.095, 0.034, 0.015);
    b.push().transform(sx * 0.032, -0.275, 0.018, 0, 0, sx * 0.45).bevelBox(0, 0, 0, 0.022, 0.048, 0.022, 0.009).pop();
  }
  // ---------------- legs: tapered, knee definition, shoes with soles
  for (const [tb, sb] of [[BONE.THIGH_L, BONE.SHIN_L], [BONE.THIGH_R, BONE.SHIN_R]]) {
    b.setBone(tb);
    const legC = look.skirt ? skin : bottoms, legM = look.skirt ? MAT.SKIN : MAT.CLOTH;
    b.paint(legC, legM).limb(0, 0, 0, 0, -0.43, 0, 0.074 * w, 0.056 * w, S);
    b.sphere(0, -0.43, 0.006, 0.056 * w, 0.054, 0.058 * w, 9, 5);
    b.setBone(sb);
    b.paint(legC, legM).limb(0, 0, 0, 0, -0.41, 0, 0.054 * w, 0.042 * w, S);
    if (!look.skirt) b.paint(bottoms.map((c) => c * 0.85), MAT.CLOTH).cylinder(0, -0.42, 0, 0.048, 0.048, 0.03, S);
    b.paint(shoes, MAT.PLAIN).bevelBox(0, -0.452, 0.04, 0.095, 0.075, 0.235, 0.03);
    b.paint(look.shoes === '#f2f2f2' ? hex('#d8d8d8') : hex('#151515'), MAT.PLAIN).bevelBox(0, -0.493, 0.042, 0.1, 0.022, 0.25, 0.008);
  }
  const data = b.build();
  data.bounds = { min: [-0.6, 0, -0.6], max: [0.6, 1.9, 0.6], center: [0, 0.95, 0], radius: 1.1 };
  return createMesh(gl, data);
}

/**
 * Procedural animator: turns a pose state into bone matrices (character-local).
 * state: { t, speed (m/s), phase, air, aim (0..1), punch (0..1 progress, side), hit (0..1), dead (0..1),
 *          seated (0..1), talk (0..1), crouch, lean, steer, heightScale }
 */
export class Animator {
  constructor(height = 1) {
    this.height = height;
    this.bones = new Float32Array(16 * 16);
    this.world = Array.from({ length: 11 }, () => new Float32Array(16));
    this.rot = Array.from({ length: 11 }, () => [0, 0, 0]);
    this.root = [0, 0, 0];
  }

  pose(s) {
    const r = this.rot;
    for (const a of r) a[0] = a[1] = a[2] = 0;
    const t = s.t ?? 0;
    const speed = s.speed ?? 0;
    const ph = s.phase ?? 0;
    const run = clamp((speed - 2.2) / 3, 0, 1);
    const move = clamp(speed / 1.4, 0, 1);
    let hipY = 0, hipZ = 0;

    // Idle breathing.
    const breath = Math.sin(t * 1.6) * 0.02 * (1 - move);
    r[BONE.CHEST][0] = breath;
    r[BONE.UARM_L][2] = 0.14 + breath;
    r[BONE.UARM_R][2] = -0.14 - breath;
    r[BONE.FARM_L][0] = -0.12;
    r[BONE.FARM_R][0] = -0.12;
    r[BONE.HEAD][1] = Math.sin(t * 0.37) * 0.15 * (1 - move);

    // Walk / run cycle.
    if (move > 0.01) {
      const amp = lerp(0.45, 0.85, run) * move;
      const sw = Math.sin(ph);
      r[BONE.THIGH_L][0] = -sw * amp;
      r[BONE.THIGH_R][0] = sw * amp;
      r[BONE.SHIN_L][0] = Math.max(0, Math.cos(ph)) * lerp(0.6, 1.4, run) * move + 0.05;
      r[BONE.SHIN_R][0] = Math.max(0, -Math.cos(ph)) * lerp(0.6, 1.4, run) * move + 0.05;
      r[BONE.UARM_L][0] = sw * amp * 0.8;
      r[BONE.UARM_R][0] = -sw * amp * 0.8;
      r[BONE.FARM_L][0] = -0.2 - run * 1.0;
      r[BONE.FARM_R][0] = -0.2 - run * 1.0;
      r[BONE.CHEST][0] += run * 0.22 + 0.04 * move;
      r[BONE.CHEST][1] = sw * 0.12 * move;
      r[BONE.HIPS][1] = -sw * 0.08 * move;
      hipY = Math.abs(Math.cos(ph)) * lerp(0.03, 0.07, run) * move - 0.02 * run;
    }
    // Airborne (jump hop): knees tucked, arms up.
    if (s.air) {
      r[BONE.THIGH_L][0] = -0.6;
      r[BONE.THIGH_R][0] = -0.25;
      r[BONE.SHIN_L][0] = 0.9;
      r[BONE.SHIN_R][0] = 0.6;
      r[BONE.UARM_L][2] = 0.5;
      r[BONE.UARM_R][2] = -0.5;
    }
    // Aim: right arm (and left supporting) straight forward, torso turned slightly.
    const aim = s.aim ?? 0;
    if (aim > 0) {
      const pitch = s.aimPitch ?? 0;
      r[BONE.UARM_R][0] = lerp(r[BONE.UARM_R][0], -1.5 - pitch, aim);
      r[BONE.UARM_R][2] = lerp(r[BONE.UARM_R][2], 0.05, aim);
      r[BONE.FARM_R][0] = lerp(r[BONE.FARM_R][0], -0.05, aim);
      if (s.twoHanded) {
        r[BONE.UARM_L][0] = lerp(r[BONE.UARM_L][0], -1.25 - pitch, aim);
        r[BONE.UARM_L][2] = lerp(r[BONE.UARM_L][2], -0.55, aim);
        r[BONE.FARM_L][0] = lerp(r[BONE.FARM_L][0], -0.5, aim);
      }
      r[BONE.CHEST][1] = lerp(r[BONE.CHEST][1], 0.15, aim);
      r[BONE.HEAD][1] = lerp(r[BONE.HEAD][1], -0.12, aim);
      r[BONE.HEAD][0] = lerp(r[BONE.HEAD][0], pitch * 0.5, aim);
      if (s.recoil) r[BONE.UARM_R][0] -= s.recoil * 0.25;
    }
    // Punch combo: alternating jabs.
    if (s.punch > 0) {
      const k = Math.sin(Math.min(1, s.punch) * Math.PI);
      const [u, f] = s.punchSide ? [BONE.UARM_L, BONE.FARM_L] : [BONE.UARM_R, BONE.FARM_R];
      const [u2, f2] = s.punchSide ? [BONE.UARM_R, BONE.FARM_R] : [BONE.UARM_L, BONE.FARM_L];
      r[u][0] = lerp(-0.9, -1.55, k);
      r[f][0] = lerp(-1.6, 0.0, k);
      r[u][2] = 0;
      r[u2][0] = -0.9;
      r[f2][0] = -1.7;
      r[BONE.CHEST][1] = (s.punchSide ? 0.35 : -0.35) * k;
    }
    // Hit reaction: snap back.
    if (s.hit > 0) {
      const k = Math.sin(s.hit * Math.PI);
      r[BONE.CHEST][0] -= 0.35 * k;
      r[BONE.HEAD][0] -= 0.3 * k;
      r[BONE.UARM_L][2] += 0.4 * k;
      r[BONE.UARM_R][2] -= 0.4 * k;
    }
    // Seated (driving): thighs forward, shins down, hands on the wheel.
    const seat = s.seated ?? 0;
    if (seat > 0) {
      const st = s.steer ?? 0;
      const mix = (bn, ax, v) => (r[bn][ax] = lerp(r[bn][ax], v, seat));
      mix(BONE.THIGH_L, 0, -1.45); mix(BONE.THIGH_R, 0, -1.45);
      mix(BONE.SHIN_L, 0, 1.35); mix(BONE.SHIN_R, 0, 1.35);
      mix(BONE.UARM_L, 0, -0.95 + st * 0.2); mix(BONE.UARM_R, 0, -0.95 - st * 0.2);
      mix(BONE.UARM_L, 2, -0.15); mix(BONE.UARM_R, 2, 0.15);
      mix(BONE.FARM_L, 0, -0.55); mix(BONE.FARM_R, 0, -0.55);
      mix(BONE.CHEST, 0, -0.3); mix(BONE.CHEST, 1, 0);
      mix(BONE.HEAD, 0, 0.25);
      hipY = lerp(hipY, -0.42, seat);
      hipZ = lerp(hipZ, -0.05, seat);
    }
    // Talking gestures.
    if (s.talk > 0) {
      const g = s.talk;
      r[BONE.UARM_R][0] += (-0.5 + Math.sin(t * 3.1) * 0.25) * g;
      r[BONE.FARM_R][0] += (-0.9 + Math.sin(t * 4.3) * 0.3) * g;
      r[BONE.UARM_L][0] += (-0.3 + Math.sin(t * 2.3 + 1) * 0.2) * g;
      r[BONE.FARM_L][0] += (-0.6 + Math.sin(t * 3.7 + 2) * 0.2) * g;
      r[BONE.HEAD][0] += Math.sin(t * 5.0) * 0.06 * g;
      r[BONE.HEAD][1] += Math.sin(t * 1.3) * 0.12 * g;
    }
    // Hands up (cuffed / surrender).
    if (s.handsUp > 0) {
      const k = s.handsUp;
      r[BONE.UARM_L][0] = lerp(r[BONE.UARM_L][0], -2.8, k); r[BONE.UARM_R][0] = lerp(r[BONE.UARM_R][0], -2.8, k);
      r[BONE.FARM_L][0] = lerp(r[BONE.FARM_L][0], -0.6, k); r[BONE.FARM_R][0] = lerp(r[BONE.FARM_R][0], -0.6, k);
    }
    // Phone look (idle pedestrians).
    if (s.phone > 0) {
      r[BONE.UARM_R][0] = lerp(r[BONE.UARM_R][0], -0.5, s.phone);
      r[BONE.FARM_R][0] = lerp(r[BONE.FARM_R][0], -1.6, s.phone);
      r[BONE.HEAD][0] = lerp(r[BONE.HEAD][0], 0.4, s.phone);
    }
    // Death: fall backwards and lie still.
    let rootPitch = 0;
    const dead = s.dead ?? 0;
    if (dead > 0) {
      const k = 1 - Math.pow(1 - Math.min(1, dead), 2);
      rootPitch = -1.5 * k;
      hipY = lerp(hipY, -0.8, k);
      r[BONE.UARM_L][2] = lerp(r[BONE.UARM_L][2], 1.2, k);
      r[BONE.UARM_R][2] = lerp(r[BONE.UARM_R][2], -1.0, k);
      r[BONE.THIGH_L][0] = lerp(r[BONE.THIGH_L][0], -0.2, k);
      r[BONE.SHIN_L][0] = lerp(r[BONE.SHIN_L][0], 0.4, k);
      r[BONE.HEAD][1] = lerp(r[BONE.HEAD][1], 0.5, k);
    }
    this.root = [0, hipY, hipZ];
    this.rootPitch = rootPitch;
    this.compose();
  }

  compose() {
    const h = this.height;
    for (let i = 0; i < 11; i++) {
      const o = OFFSET[i];
      const r = this.rot[i];
      let local;
      if (i === 0) local = m4compose(o[0] * h + this.root[0], o[1] * h + this.root[1], o[2] * h + this.root[2], r[1], r[0] + (this.rootPitch ?? 0), r[2], h);
      else local = m4compose(o[0], o[1], o[2], r[1], r[0], r[2]);
      if (PARENT[i] < 0) this.world[i] = local;
      else m4mul(this.world[PARENT[i]], local, this.world[i]);
      this.bones.set(this.world[i], i * 16);
    }
  }

  /** Character-local matrix of the right hand (for weapons). */
  handMatrix() {
    return m4mul(this.world[BONE.FARM_R], m4compose(0, -0.3, 0.02, 0, Math.PI / 2, 0));
  }
}
