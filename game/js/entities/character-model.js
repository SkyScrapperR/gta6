// Smooth low-poly humanoids: tapered 8-12 sided limbs, rounded torso, a head with large stylized
// eyes, brows, nose and mouth, shaped hair (short, spiky, bun, cap, ponytail, curly, slick, peaked
// police cap), clothing details (collars, belts, two-tone tops, hoodies, suits) and accessories
// (glasses, headphones). Each body part follows one bone; poses come from a procedural animator.

import { MeshBuilder, MAT } from '../engine/mesh-builder.js';
import { createMesh } from '../engine/gl.js';
import { hex } from '../core/math.js';
import { BONE } from './animator.js';
import { LOOKS } from './looks.js';

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
  // Face bones: the jaw carries the dark mouth interior and lower lip (tucked into the head when
  // closed); the lids are skin caps over the eyes that slide forward to blink.
  b.setBone(BONE.JAW);
  b.paint([0.16, 0.05, 0.05], MAT.SKIN).sphere(0, hy - 0.064, 0.098, 0.019, 0.012, 0.01, 8, 5);
  b.paint(hex(look.female ? '#b04a5c' : '#80423a'), MAT.SKIN).bevelBox(0, hy - 0.074, 0.1, 0.036, 0.008, 0.012, 0.004);
  b.setBone(BONE.LIDS);
  b.paint(skin.map((c) => c * 0.95), MAT.SKIN);
  for (const sx of [-1, 1]) b.sphere(sx * 0.042, hy + 0.03, 0.1, 0.033, 0.027, 0.018, 10, 6);
  b.setBone(BONE.HEAD);
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
  const S = 14;

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
    // Cloth gathers in soft creases at the inside of the elbow.
    if (longSleeve) {
      b.paint(top.map((c) => c * 0.78), MAT.CLOTH);
      for (const [y, r] of [[-0.015, 0.045], [-0.05, 0.043]]) b.cylinder(0, y, 0.004, r * w, r * w, 0.008, S);
    }
    // Mitten hand: palm block, knuckle ridge, finger grooves and a thumb.
    b.paint(skin, MAT.SKIN).bevelBox(0, -0.3, 0.004, 0.066, 0.095, 0.034, 0.015);
    b.bevelBox(0, -0.318, 0.004, 0.07, 0.02, 0.038, 0.008);
    b.paint(skin.map((c) => c * 0.7), MAT.SKIN);
    for (const gx of [-0.016, 0, 0.016]) b.box(gx, -0.333, 0.004, 0.003, 0.032, 0.036);
    b.paint(skin, MAT.SKIN);
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
    if (!look.skirt) {
      // Trouser creases behind the knee and where the hem breaks over the shoe.
      b.paint(bottoms.map((c) => c * 0.8), MAT.CLOTH);
      b.cylinder(0, -0.03, -0.004, 0.056 * w, 0.056 * w, 0.008, S).cylinder(0, -0.36, 0, 0.047 * w, 0.047 * w, 0.007, S);
    }
    if (!look.skirt) b.paint(bottoms.map((c) => c * 0.85), MAT.CLOTH).cylinder(0, -0.42, 0, 0.048, 0.048, 0.03, S);
    b.paint(shoes, MAT.PLAIN).bevelBox(0, -0.452, 0.04, 0.095, 0.075, 0.235, 0.03);
    b.paint(look.shoes === '#f2f2f2' ? hex('#d8d8d8') : hex('#151515'), MAT.PLAIN).bevelBox(0, -0.493, 0.042, 0.1, 0.022, 0.25, 0.008);
  }
  const data = b.build();
  data.bounds = { min: [-0.6, 0, -0.6], max: [0.6, 1.9, 0.6], center: [0, 0.95, 0], radius: 1.1 };
  return createMesh(gl, data);
}

