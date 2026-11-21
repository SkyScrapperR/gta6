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
  [0.2, 0.5, 0], // left shoulder
  [0, -0.29, 0], // left elbow
  [-0.2, 0.5, 0], // right shoulder
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
  kai: { skin: '#d9a27a', hair: 'spiky', hairColor: '#17110d', top: '#16b3a6', inner: '#1d2027', bottoms: '#283142', shoes: '#f2f2f2', jacket: true, height: 1.0, build: 1.05 },
  cop: { skin: '#c68a5e', hair: 'peaked', hairColor: '#1a1410', top: '#1c2a4a', inner: '#1c2a4a', bottoms: '#17213a', shoes: '#111111', uniform: true, height: 1.0, build: 1.05 },
  gang: { skin: '#a86d45', hair: 'short', hairColor: '#1a1410', top: '#6a2a8a', inner: '#2a1030', bottoms: '#1a1a20', shoes: '#222', jacket: true, height: 1.0, build: 1.08 },
  lin: { skin: '#e0ac83', hair: 'bun', hairColor: '#a8a8a8', top: '#e8792a', inner: '#e8792a', bottoms: '#3a3a40', shoes: '#4a3a2a', glasses: true, height: 0.93, build: 1.0, female: true },
  dex: { skin: '#8a5535', hair: 'curly', hairColor: '#1a1410', top: '#3a4a5a', inner: '#22c0d0', bottoms: '#2a2a30', shoes: '#e8e8e8', hoodie: true, headphones: true, height: 0.97, build: 0.95 },
  viktor: { skin: '#f1c9a5', hair: 'slick', hairColor: '#2a2420', top: '#f2f0ea', inner: '#7a2aa0', bottoms: '#f2f0ea', shoes: '#1a1a1a', suit: true, height: 1.04, build: 1.08 },
  rendy: { skin: '#e0ac83', hair: 'cap', hairColor: '#2a1d14', top: '#f2c41a', inner: '#111', bottoms: '#2a2a30', shoes: '#fff', height: 0.98, build: 0.95 },
};

/** A random pedestrian look from a seeded rng. */
export function randomLook(rng) {
  const female = rng.chance(0.5);
  return {
    skin: rng.pick(SKIN_TONES),
    hair: female ? rng.pick(['bun', 'ponytail', 'long', 'curly', 'short']) : rng.pick(['short', 'short', 'cap', 'curly', 'bald', 'slick', 'spiky']),
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

/**
 * Hair shell around the head with a hairline: vertices over the face and below the nape are pulled
 * inside the skull, everything else sits just outside it, so the hair reads as a shaped cut.
 */
function hairCap(b, hy, scale, nape) {
  const segW = 16, segH = 10;
  const base = b.vertexCount;
  for (let y = 0; y <= segH; y++) {
    const phi = (y / segH) * Math.PI;
    for (let x = 0; x <= segW; x++) {
      const th = (x / segW) * Math.PI * 2;
      const nx = Math.cos(th) * Math.sin(phi), ny = Math.cos(phi), nz = Math.sin(th) * Math.sin(phi);
      const face = nz > 0.2 && ny < 0.42 - (Math.abs(nx) < 0.35 ? 0.0 : 0.15);
      const low = ny < nape || (nz > -0.2 && ny < -0.05);
      const r = face || low ? 0.82 : 1.06 * scale;
      b.vertex(nx * 0.112 * r, hy + 0.005 + ny * 0.132 * r, 0.0 + nz * 0.122 * r, nx, ny, nz);
    }
  }
  for (let y = 0; y < segH; y++) {
    for (let x = 0; x < segW; x++) {
      const a = base + y * (segW + 1) + x, c = a + segW + 1;
      b.i.push(a, a + 1, c + 1, a, c + 1, c);
    }
  }
}

/** Build the rigged mesh for a look. Geometry is authored in each bone's local space. */
export function buildCharacter(gl, look) {
  const b = new MeshBuilder();
  const skin = hex(look.skin), top = hex(look.top), inner = hex(look.inner ?? look.top), bottoms = hex(look.bottoms), shoes = hex(look.shoes), hairC = hex(look.hairColor);
  const w = look.build ?? 1;
  const fem = !!look.female;
  const sleeve = look.uniform || look.jacket || look.hoodie || look.suit ? top : skin;
  const S = 10; // limb sides

  // Hips / pelvis with belt.
  b.setBone(BONE.HIPS);
  b.paint(bottoms, MAT.CLOTH).bevelBox(0, 0.0, 0, 0.32 * w * (fem ? 1.06 : 1), 0.2, 0.2, 0.08);
  b.paint(hex(look.uniform ? '#111111' : look.suit ? '#e8e4da' : '#2a2018'), MAT.CLOTH).bevelBox(0, 0.09, 0, 0.335 * w, 0.05, 0.21, 0.02);
  if (look.uniform) b.paint(hex('#c9a640'), MAT.METAL).box(0, 0.09, 0.106, 0.05, 0.035, 0.01);
  if (look.skirt) b.paint(bottoms, MAT.CLOTH).cylinder(0, -0.32, 0, 0.27 * w, 0.18 * w, 0.4, 12, { top: false });

  // Chest: tapered torso, shoulders wider than the waist.
  b.setBone(BONE.CHEST);
  if (look.jacket || look.suit || look.hoodie) {
    // Open jacket over an inner shirt.
    b.paint(inner, MAT.CLOTH).bevelBox(0, 0.28, 0.005, 0.3 * w, 0.54, 0.2, 0.09, { taperX: 1.3, taperZ: 1.08 });
    b.paint(top, MAT.CLOTH);
    for (const sx of [-1, 1]) {
      b.push().transform(sx * 0.085 * w, 0, 0);
      b.bevelBox(0, 0.28, 0.0, 0.15 * w, 0.56, 0.22, 0.07, { taperX: 1.45, taperZ: 1.08 });
      b.pop();
    }
    b.bevelBox(0, 0.3, -0.02, 0.32 * w, 0.52, 0.18, 0.08, { taperX: 1.35 });
    // Lapels / collar.
    b.paint(top.map((c) => c * 0.85), MAT.CLOTH);
    b.push().transform(0.07, 0.5, 0.1, 0, -0.3, 0.5).box(0, 0, 0, 0.05, 0.14, 0.03).pop();
    b.push().transform(-0.07, 0.5, 0.1, 0, -0.3, -0.5).box(0, 0, 0, 0.05, 0.14, 0.03).pop();
    if (look.hoodie) b.paint(top, MAT.CLOTH).sphere(0, 0.55, -0.1, 0.15, 0.09, 0.08, 10, 5);
    if (look.suit) b.paint(hex('#2a1030'), MAT.CLOTH).box(0, 0.42, 0.108, 0.035, 0.18, 0.01);
  } else {
    b.paint(top, MAT.CLOTH).bevelBox(0, 0.28, 0, 0.31 * w * (fem ? 0.95 : 1), 0.56, 0.21, 0.09, { taperX: fem ? 1.18 : 1.32, taperZ: 1.08 });
    // Two-tone: a contrasting band and collar.
    b.paint(inner, MAT.CLOTH).bevelBox(0, 0.05, 0, 0.315 * w, 0.08, 0.215, 0.03);
    b.paint(inner, MAT.CLOTH).cylinder(0, 0.54, 0, 0.09, 0.075, 0.05, S);
    if (look.uniform) {
      b.paint(hex('#c9a640'), MAT.METAL).box(-0.08, 0.42, 0.11, 0.04, 0.05, 0.012);
      b.paint(hex('#2a3a5a'), MAT.CLOTH).box(0.08, 0.36, 0.11, 0.07, 0.07, 0.015).box(-0.08, 0.36, 0.11, 0.07, 0.07, 0.015);
      b.paint(hex('#e8e8e8'), MAT.CLOTH).box(0.17 * w, 0.48, 0.0, 0.03, 0.03, 0.12).box(-0.17 * w, 0.48, 0.0, 0.03, 0.03, 0.12);
    }
  }
  if (fem && !look.jacket) b.paint(top, MAT.CLOTH).sphere(0, 0.36, 0.07, 0.12 * w, 0.07, 0.06, 10, 5);
  // Neck.
  b.paint(skin, MAT.SKIN).cylinder(0, 0.52, 0, 0.055, 0.05, 0.12, S);

  // Head.
  b.setBone(BONE.HEAD);
  const hy = 0.12;
  b.paint(skin, MAT.SKIN).sphere(0, hy, 0.005, 0.112, 0.132, 0.122, 14, 10);
  b.sphere(0, hy - 0.07, 0.03, 0.08, 0.06, 0.085, 10, 6); // jaw
  b.sphere(0.112, hy, -0.005, 0.02, 0.035, 0.022, 6, 4).sphere(-0.112, hy, -0.005, 0.02, 0.035, 0.022, 6, 4); // ears
  b.sphere(0, hy - 0.005, 0.124, 0.018, 0.026, 0.02, 6, 4); // nose
  // Eyes: big whites, coloured iris, dark pupil, highlight.
  for (const sx of [-1, 1]) {
    b.paint([0.95, 0.95, 0.95], MAT.SKIN).sphere(sx * 0.045, hy + 0.03, 0.1, 0.03, 0.024, 0.016, 10, 6);
    b.paint(hex(look.eyes ?? '#3a2618'), MAT.SKIN).sphere(sx * 0.045, hy + 0.028, 0.112, 0.017, 0.018, 0.008, 8, 5);
    b.paint([0.02, 0.02, 0.02], MAT.SKIN).sphere(sx * 0.045, hy + 0.028, 0.117, 0.009, 0.01, 0.005, 6, 4);
    b.paint([1, 1, 1], MAT.NEON, 0.3).sphere(sx * 0.045 + 0.006, hy + 0.036, 0.12, 0.004, 0.004, 0.003, 4, 3);
    // Brows.
    b.paint(hairC.map((c) => c * 0.8), MAT.SKIN);
    b.push().transform(sx * 0.047, hy + 0.068, 0.108, 0, 0, sx * (look === LOOKS.viktor ? 0.25 : 0.1)).box(0, 0, 0, 0.05, 0.011, 0.014).pop();
  }
  b.paint(hex(fem ? '#b0485a' : '#7a3a34'), MAT.SKIN).box(0, hy - 0.058, 0.112, 0.045, 0.009, 0.012); // mouth
  if (look.glasses) {
    b.paint(hex('#151515'), MAT.METAL);
    for (const sx of [-1, 1]) {
      b.box(sx * 0.045, hy + 0.03, 0.128, 0.05, 0.006, 0.006).box(sx * 0.045, hy + 0.008, 0.128, 0.05, 0.006, 0.006);
      b.box(sx * 0.07, hy + 0.02, 0.128, 0.006, 0.026, 0.006).box(sx * 0.02, hy + 0.02, 0.128, 0.006, 0.026, 0.006);
      b.box(sx * 0.11, hy + 0.03, 0.06, 0.006, 0.006, 0.12);
    }
    b.box(0, hy + 0.028, 0.13, 0.02, 0.005, 0.005);
  }
  // Hair.
  const hairStyle = look.hair;
  b.paint(hairC, MAT.CLOTH);
  const cap = (scale = 1) => hairCap(b, hy, scale, look.female && hairStyle !== 'bun' ? -0.62 : -0.4);
  if (hairStyle === 'short') cap();
  else if (hairStyle === 'spiky') {
    cap(1.02);
    for (let k = 0; k < 7; k++) {
      const a = -0.9 + k * 0.3;
      b.push().transform(Math.sin(a) * 0.06, hy + 0.12, 0.02 + Math.cos(a) * 0.02, a * 0.6, 0.5, 0);
      b.cylinder(0, 0, 0, 0.035, 0.0, 0.1, 5);
      b.pop();
    }
    b.push().transform(0, hy + 0.09, 0.1, 0, 1.2, 0).cylinder(0, 0, 0, 0.05, 0, 0.08, 5).pop();
  } else if (hairStyle === 'bun') {
    cap();
    b.sphere(0, hy + 0.12, -0.09, 0.055, 0.055, 0.055, 8, 6);
  } else if (hairStyle === 'ponytail') {
    cap();
    b.limb(0, hy + 0.06, -0.12, 0, hy - 0.2, -0.16, 0.04, 0.02, 6);
  } else if (hairStyle === 'long') {
    cap();
    b.bevelBox(0, hy - 0.1, -0.06, 0.24, 0.3, 0.12, 0.05);
  } else if (hairStyle === 'curly') {
    cap(0.98);
    for (let k = 0; k < 14; k++) {
      const a = (k / 14) * Math.PI * 2;
      b.sphere(Math.cos(a) * 0.1, hy + 0.08 + (k % 3) * 0.02, Math.sin(a) * 0.1 - 0.01, 0.045, 0.045, 0.045, 6, 4);
    }
    b.sphere(0, hy + 0.13, -0.01, 0.08, 0.05, 0.08, 8, 5);
  } else if (hairStyle === 'slick') {
    b.sphere(0, hy + 0.03, -0.012, 0.118, 0.12, 0.13, 12, 8, { yMin: -0.08 });
    b.paint(hairC.map((c) => c + 0.05), MAT.PAINT).sphere(0, hy + 0.07, 0.0, 0.11, 0.08, 0.12, 10, 6);
  } else if (hairStyle === 'cap') {
    cap(0.98);
    b.paint(hex(look.capColor ?? '#c03a2a'), MAT.CLOTH).sphere(0, hy + 0.05, 0, 0.122, 0.1, 0.128, 12, 7, { yMin: 0.0 });
    b.box(0, hy + 0.055, 0.15, 0.17, 0.012, 0.1);
  } else if (hairStyle === 'peaked') {
    cap(0.95);
    const navy = hex('#16213d');
    b.paint(navy, MAT.CLOTH).cylinder(0, hy + 0.06, -0.005, 0.124, 0.135, 0.09, 14, { top: false });
    b.paint(navy, MAT.CLOTH).cylinder(0, hy + 0.15, -0.005, 0.15, 0.15, 0.03, 14);
    b.paint(hex('#0a0a0a'), MAT.PAINT).push().transform(0, hy + 0.07, 0.12, 0, 0.3, 0).box(0, 0, 0.02, 0.2, 0.012, 0.09).pop();
    b.paint(hex('#d9b84a'), MAT.METAL).box(0, hy + 0.12, 0.137, 0.035, 0.035, 0.01);
    b.paint(hex('#0a0a0a'), MAT.CLOTH).cylinder(0, hy + 0.06, -0.005, 0.127, 0.127, 0.02, 14, { top: false });
  }
  if (look.headphones) {
    b.paint(hex('#1a1a1a'), MAT.PAINT);
    b.limb(-0.125, hy + 0.02, 0, -0.08, hy + 0.15, 0, 0.012, 0.012, 5).limb(-0.08, hy + 0.15, 0, 0.08, hy + 0.15, 0, 0.012, 0.012, 5).limb(0.08, hy + 0.15, 0, 0.125, hy + 0.02, 0, 0.012, 0.012, 5);
    b.paint(hex('#22c0d0'), MAT.PAINT);
    for (const sx of [-1, 1]) b.push().transform(sx * 0.128, hy, 0, 0, 0, Math.PI / 2).cylinder(0, -0.02, 0, 0.045, 0.045, 0.04, 10).pop();
  }

  // Arms: tapered upper arm and forearm with rounded joints; hands.
  for (const [ub, fb, sx] of [[BONE.UARM_L, BONE.FARM_L, 1], [BONE.UARM_R, BONE.FARM_R, -1]]) {
    b.setBone(ub);
    b.paint(sleeve, MAT.CLOTH).limb(0, 0, 0, 0, -0.29, 0, 0.065 * w, 0.052 * w, S);
    if (look.jacket || look.suit || look.uniform || look.hoodie) b.sphere(0, -0.01, 0, 0.075 * w, 0.07, 0.075 * w, S, 6);
    else b.paint(top, MAT.CLOTH).sphere(0, -0.02, 0, 0.074 * w, 0.075, 0.074 * w, S, 6).cylinder(0, -0.13, 0, 0.07 * w, 0.072 * w, 0.12, S, { top: false });
    b.setBone(fb);
    b.paint(look.jacket || look.suit || look.uniform || look.hoodie ? sleeve : skin, look.jacket || look.suit || look.uniform || look.hoodie ? MAT.CLOTH : MAT.SKIN);
    b.limb(0, 0, 0, 0, -0.25, 0, 0.05 * w, 0.04 * w, S);
    if (look.jacket || look.suit || look.hoodie) b.paint(inner, MAT.CLOTH).cylinder(0, -0.255, 0, 0.044, 0.042, 0.03, S);
    b.paint(skin, MAT.SKIN).sphere(0, -0.31, 0.0, 0.042, 0.055, 0.03, 8, 6);
    b.sphere(sx * 0.03, -0.29, 0.02, 0.016, 0.03, 0.014, 6, 4); // thumb
  }
  // Legs: thigh, shin, shoes.
  for (const [tb, sb] of [[BONE.THIGH_L, BONE.SHIN_L], [BONE.THIGH_R, BONE.SHIN_R]]) {
    b.setBone(tb);
    b.paint(look.skirt ? skin : bottoms, look.skirt ? MAT.SKIN : MAT.CLOTH).limb(0, 0, 0, 0, -0.43, 0, 0.088 * w, 0.064 * w, S);
    b.setBone(sb);
    b.paint(look.skirt ? skin : bottoms, look.skirt ? MAT.SKIN : MAT.CLOTH).limb(0, 0, 0, 0, -0.42, 0, 0.062 * w, 0.048 * w, S);
    b.paint(shoes, MAT.PLAIN).bevelBox(0, -0.465, 0.045, 0.1, 0.08, 0.25, 0.035);
    b.paint(hex('#e8e8e8'), MAT.PLAIN).bevelBox(0, -0.5, 0.045, 0.104, 0.02, 0.255, 0.008);
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
    r[BONE.UARM_L][2] = 0.08 + breath;
    r[BONE.UARM_R][2] = -0.08 - breath;
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
