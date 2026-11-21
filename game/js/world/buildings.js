// Building generators. Each takes a build context (mesh builder, sign builder/atlas, collision,
// props, rng) and a parcel {x0,z0,x1,z1, fronts} and adds geometry + collision. Footprints vary:
// boxes, L-shapes, podium + tower, stepped setbacks; roofs carry gardens, pools, solar, AC, tanks.

import { MAT } from '../engine/mesh-builder.js';
import { hex } from '../core/math.js';
import { CURB } from './layout.js';

export const SHOP_NAMES = [
  'Es Cendol', 'Kopi Senja', 'Bengkel Motor', 'Laundry Kilau', 'Toko Bintang', 'Mie Ombak', 'Pizza Pelangi', 'Bakso Lestari',
  'Warung Mentari', 'Apotek Sehat', 'Salon Melati', 'Toko Elektro Petir', 'Sate Pak Dodi', 'Roti Hangat', 'Optik Terang',
  'Batik Ayu', 'Kios Pulsa 88', 'Martabak Malam', 'Toko Kue Manis', 'Jus Tropika', 'Gelato Pantai', 'Studio Tato Naga',
];
export const BRANDS = [
  ['NUSA FIZZ', 'the taste of the tide', '#ff3fa4', '#1a0b2e'],
  ['KILAU PHONE', 'brighter every day', '#2ff3e0', '#081a24'],
  ['OMBAK AIR', 'fly the coast', '#ffd23a', '#0b1840'],
  ['SURYA NOODLE', '3 minutes to happy', '#ff7a3a', '#2a0b0b'],
  ['PELANGI TV', 'channel 9 live', '#9a8cff', '#120a2a'],
  ['MERAK MOTORS', 'drive proud', '#4dff9a', '#06200f'],
];
const AWNINGS = ['#d8343b', '#1b8f86', '#f2b63a', '#2c6fd1', '#e96fa8', '#3aa655', '#f07c2c'];
const SIGN_FG = ['#ffe9a8', '#ff4fae', '#4ff6ff', '#ffffff', '#ffb347', '#9dff6a'];

export const PALETTES = {
  midtown: ['#c9714f', '#e8d9b5', '#e7a77b', '#d9a441', '#9fd1b8', '#ece6da', '#b85c44', '#d7c0a0'],
  downtownPodium: ['#a7a39b', '#c9c2b4', '#8f8a84', '#bdb2a0'],
  towerGlass: ['#3b7fb0', '#2c9a9a', '#8aa0b8', '#a07850', '#4a5f8a', '#5aa0c8'],
  house: ['#f1ead8', '#f3d9b0', '#d9ecef', '#f5cfc4', '#e9e3a8', '#ffffff', '#cfe6cc'],
  roof: ['#a8442e', '#8a3b2a', '#5a5f66', '#b5603a', '#3e4a52'],
  hotel: ['#ffffff', '#f7d6e0', '#cdeff0', '#fff1c9', '#e4f4e4'],
  warehouse: ['#7d8a91', '#a35a3a', '#4f6d7a', '#9b8f6a', '#5b6f5a'],
};

/** Unit direction a front faces: 'n' (-z), 's' (+z), 'e' (+x), 'w' (-x). */
export const FRONT_DIR = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
const FRONT_YAW = { n: Math.PI, s: 0, e: Math.PI / 2, w: -Math.PI / 2 };

/** Shopfronts along one side of a footprint: glowing windows, mullions, awning and a name sign. */
export function shopfronts(ctx, x0, z0, x1, z1, side, y = CURB) {
  const { b, rng, atlas, signs } = ctx;
  const along = side === 'n' || side === 's';
  const len = along ? x1 - x0 : z1 - z0;
  const n = Math.max(1, Math.floor(len / 9));
  const w = len / n;
  const d = FRONT_DIR[side];
  const faceX = side === 'e' ? x1 : side === 'w' ? x0 : 0;
  const faceZ = side === 's' ? z1 : side === 'n' ? z0 : 0;
  for (let k = 0; k < n; k++) {
    const c = (along ? x0 : z0) + w * (k + 0.5);
    const cx = along ? c : faceX, cz = along ? faceZ : c;
    const sx = along ? w - 1.2 : 0.3, sz = along ? 0.3 : w - 1.2;
    const warm = rng.pick([[0.95, 0.75, 0.5], [0.9, 0.85, 0.7], [0.7, 0.85, 0.95], [1.0, 0.6, 0.45]]);
    b.paint([warm[0] * 0.32, warm[1] * 0.3, warm[2] * 0.3], MAT.LAMP, 0.42);
    b.box(cx + d[0] * 0.05, y + 1.85, cz + d[1] * 0.05, sx, 3.2, sz);
    b.paint(hex('#2a2a2e'), MAT.METAL);
    // Mullions and a door frame.
    for (const t of [-0.5, -0.15, 0.2, 0.5]) {
      const ox = along ? t * (w - 1.2) : 0, oz = along ? 0 : t * (w - 1.2);
      b.box(cx + ox + d[0] * 0.2, y + 1.85, cz + oz + d[1] * 0.2, along ? 0.12 : 0.15, 3.3, along ? 0.15 : 0.12);
    }
    b.box(cx + d[0] * 0.2, y + 3.5, cz + d[1] * 0.2, along ? w - 1.0 : 0.15, 0.14, along ? 0.15 : w - 1.0);
    // Awning, angled outwards.
    const aw = hex(rng.pick(AWNINGS));
    b.paint(aw, MAT.CLOTH);
    b.push().transform(cx + d[0] * 1.0, y + 3.95, cz + d[1] * 1.0, FRONT_YAW[side], 0.35, 0);
    b.box(0, 0, 0, w - 1.4, 0.08, 2.0);
    b.box(0, -0.25, 1.0, w - 1.4, 0.45, 0.05);
    b.pop();
    // Name sign above the awning.
    const name = rng.pick(SHOP_NAMES);
    const s = atlas.text(name, { fg: rng.pick(SIGN_FG), bg: rng.chance(0.5) ? '#14101c' : null, w: 512, h: 112 });
    signs.quad(cx + d[0] * 0.35, y + 5.0, cz + d[1] * 0.35, FRONT_YAW[side], Math.min(w - 1.6, 7.5), 1.25, s, 2.2, rng.chance(0.3) ? 1 : 0);
    ctx.shopLights.push([cx + d[0] * 2.5, y + 3.2, cz + d[1] * 2.5, warm]);
  }
}

/** Roof furniture on a flat roof rectangle at height y. */
export function roofTop(ctx, x0, z0, x1, z1, y, { allowHelipad = false, lux = false } = {}) {
  const { b, rng } = ctx;
  const w = x1 - x0, d = z1 - z0;
  // Parapet.
  b.paint(hex('#8d8a84'), MAT.CONCRETE);
  b.box((x0 + x1) / 2, y + 0.45, z0 + 0.2, w, 0.9, 0.4);
  b.box((x0 + x1) / 2, y + 0.45, z1 - 0.2, w, 0.9, 0.4);
  b.box(x0 + 0.2, y + 0.45, (z0 + z1) / 2, 0.4, 0.9, d);
  b.box(x1 - 0.2, y + 0.45, (z0 + z1) / 2, 0.4, 0.9, d);
  b.paint(hex('#6f6c68'), MAT.CONCRETE).box((x0 + x1) / 2, y + 0.02, (z0 + z1) / 2, w - 0.6, 0.04, d - 0.6);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const kind = allowHelipad && w > 16 && d > 16 ? 'helipad' : rng.pick(lux ? ['garden', 'pool', 'garden', 'solar'] : ['ac', 'tanks', 'solar', 'garden', 'ac', 'antenna']);
  if (kind === 'helipad') {
    b.paint(hex('#3a3d44'), MAT.ASPHALT).cylinder(cx, y, cz, 7, 7, 0.3, 20);
    b.paint(hex('#ffd23a'), MAT.PLAIN).cylinder(cx, y + 0.3, cz, 6.2, 6.2, 0.02, 20, { top: true });
    b.paint(hex('#3a3d44'), MAT.ASPHALT).cylinder(cx, y + 0.31, cz, 5.8, 5.8, 0.02, 20);
    b.paint(hex('#f4f4f4'), MAT.PLAIN);
    b.box(cx - 1.6, y + 0.34, cz, 0.6, 0.02, 4.4).box(cx + 1.6, y + 0.34, cz, 0.6, 0.02, 4.4).box(cx, y + 0.34, cz, 2.6, 0.02, 0.6);
    b.paint(hex('#ff3a2a'), MAT.LAMP, 1.0);
    for (let a = 0; a < 8; a++) b.box(cx + Math.cos(a * 0.785) * 6.8, y + 0.4, cz + Math.sin(a * 0.785) * 6.8, 0.3, 0.2, 0.3);
  } else if (kind === 'ac') {
    for (let k = 0; k < 4; k++) {
      const px = rng.range(x0 + 2, x1 - 2), pz = rng.range(z0 + 2, z1 - 2);
      b.paint(hex('#c9ccd0'), MAT.METAL).box(px, y + 0.6, pz, 1.8, 1.2, 1.2);
      b.paint(hex('#3a3a3a'), MAT.PLAIN).cylinder(px, y + 1.2, pz, 0.45, 0.45, 0.05, 10);
    }
  } else if (kind === 'tanks') {
    for (let k = 0; k < 2; k++) {
      const px = cx + (k - 0.5) * Math.min(6, w * 0.4), pz = cz;
      b.paint(hex('#5a5048'), MAT.METAL);
      for (const [lx, lz] of [[-0.8, -0.8], [0.8, -0.8], [-0.8, 0.8], [0.8, 0.8]]) b.box(px + lx, y + 1, pz + lz, 0.15, 2, 0.15);
      b.paint(hex('#2e7fc4'), MAT.PAINT).cylinder(px, y + 2, pz, 1.2, 1.2, 2.2, 12);
      b.paint(hex('#2a5f90'), MAT.METAL).cylinder(px, y + 4.2, pz, 1.2, 0.2, 0.6, 12);
    }
  } else if (kind === 'solar') {
    b.paint(hex('#1a2a4a'), MAT.GLASS);
    for (let px = x0 + 2.5; px < x1 - 2.5; px += 2.6) {
      for (let pz = z0 + 2.5; pz < z1 - 2.5; pz += 3.4) {
        b.push().transform(px, y + 0.8, pz, 0, -0.45, 0);
        b.box(0, 0, 0, 2.2, 0.06, 2.6);
        b.pop();
      }
    }
  } else if (kind === 'garden' || kind === 'pool') {
    b.paint(hex('#3f8f3a'), MAT.GRASS).box(cx, y + 0.12, cz, w - 2, 0.2, d - 2);
    if (kind === 'pool' && w > 10 && d > 10) {
      b.paint(hex('#e9e6dc'), MAT.CONCRETE).box(cx, y + 0.3, cz, w * 0.5 + 1, 0.2, d * 0.4 + 1);
      b.paint(hex('#27b6d6'), MAT.WATER).box(cx, y + 0.42, cz, w * 0.5, 0.06, d * 0.4);
    }
    b.paint(hex('#2f7d34'), MAT.FOLIAGE);
    for (let k = 0; k < 4; k++) b.sphere(rng.range(x0 + 2, x1 - 2), y + 1.2, rng.range(z0 + 2, z1 - 2), 1.2, 1.0, 1.2, 8, 5);
  } else {
    b.paint(hex('#c9ccd0'), MAT.METAL).cylinder(cx, y, cz, 0.15, 0.08, 9, 6);
    b.paint(hex('#ff2a2a'), MAT.LAMP, 1.2).sphere(cx, y + 9, cz, 0.25);
  }
}

/** Mid-rise (Kemuning, docks offices): 4-10 storeys, balconies, ground-floor shops on street fronts. */
export function midrise(ctx, p, { floors = null, palette = PALETTES.midtown, shops = true } = {}) {
  const { b, rng, col } = ctx;
  const nf = floors ?? rng.int(4, 10);
  const h = nf * 3.5 + 1.0;
  const wall = hex(rng.pick(palette));
  const y0 = CURB;
  // L-shape occasionally: two boxes.
  const parts = [];
  if (rng.chance(0.3) && p.x1 - p.x0 > 22 && p.z1 - p.z0 > 22) {
    const mx = (p.x0 + p.x1) / 2, mz = (p.z0 + p.z1) / 2;
    parts.push([p.x0, p.z0, p.x1, mz + 2, h]);
    parts.push([p.x0, mz - 2, mx + 2, p.z1, h - rng.int(1, 3) * 3.5]);
  } else parts.push([p.x0, p.z0, p.x1, p.z1, h]);
  for (const [x0, z0, x1, z1, hh] of parts) {
    b.paint(wall, MAT.WINDOWS);
    b.box((x0 + x1) / 2, y0 + hh / 2, (z0 + z1) / 2, x1 - x0, hh, z1 - z0);
    // Floor bands and a cornice.
    b.paint(wall.map((c) => c * 0.82), MAT.CONCRETE);
    b.box((x0 + x1) / 2, y0 + 4.05, (z0 + z1) / 2, x1 - x0 + 0.3, 0.35, z1 - z0 + 0.3);
    b.box((x0 + x1) / 2, y0 + hh - 0.2, (z0 + z1) / 2, x1 - x0 + 0.5, 0.5, z1 - z0 + 0.5);
    col.addBox(x0, z0, x1, z1, y0 + hh, { kind: 'building' });
    roofTop(ctx, x0, z0, x1, z1, y0 + hh);
  }
  // Balconies on the street fronts.
  const balcony = hex(rng.pick(['#f4f1ea', '#3a3a3a', '#b7b2a8']));
  for (const f of p.fronts) {
    const d = FRONT_DIR[f];
    const along = f === 'n' || f === 's';
    const [x0, z0, x1, z1] = parts[0];
    const len = along ? x1 - x0 : z1 - z0;
    const face = f === 'e' ? x1 : f === 'w' ? x0 : f === 's' ? z1 : z0;
    if (rng.chance(0.7)) {
      for (let fl = 2; fl < nf; fl += 1) {
        for (let k = 0; k < Math.floor(len / 6.2); k += 2) {
          const c = (along ? x0 : z0) + 3.1 + k * 6.2 + 1.5;
          const y = y0 + fl * 3.5 + 0.35;
          const bx = along ? c : face + d[0] * 0.7, bz = along ? face + d[1] * 0.7 : c;
          b.paint(balcony, MAT.CONCRETE).box(bx, y, bz, along ? 3.0 : 1.4, 0.18, along ? 1.4 : 3.0);
          b.paint(balcony, MAT.METAL).box(bx + d[0] * 0.65, y + 0.5, bz + d[1] * 0.65, along ? 3.0 : 0.06, 0.9, along ? 0.06 : 3.0);
        }
      }
    }
    if (shops) shopfronts(ctx, x0, z0, x1, z1, f);
  }
  return h;
}

/** Downtown tower: podium with shops, glass shaft with optional setbacks, crown and roof kit. */
export function tower(ctx, p, { height = null, glass = null, podiumColor = null, allowHelipad = true } = {}) {
  const { b, rng, col } = ctx;
  const H = height ?? rng.range(40, 140);
  const y0 = CURB;
  const podH = rng.pick([8, 11.5, 15]);
  const pc = hex(podiumColor ?? rng.pick(PALETTES.downtownPodium));
  b.paint(pc, MAT.WINDOWS).box((p.x0 + p.x1) / 2, y0 + podH / 2, (p.z0 + p.z1) / 2, p.x1 - p.x0, podH, p.z1 - p.z0);
  col.addBox(p.x0, p.z0, p.x1, p.z1, y0 + podH, { kind: 'building' });
  for (const f of p.fronts) shopfronts(ctx, p.x0, p.z0, p.x1, p.z1, f);
  const inset = rng.range(3, 6);
  let x0 = p.x0 + inset, z0 = p.z0 + inset, x1 = p.x1 - inset, z1 = p.z1 - inset;
  roofTop(ctx, p.x0, p.z0, p.x1, p.z1, y0 + podH, { lux: true });
  const g = hex(glass ?? rng.pick(PALETTES.towerGlass));
  let y = y0 + podH;
  const stages = H > 80 ? rng.int(2, 3) : rng.int(1, 2);
  const stageH = (H - podH) / stages;
  for (let s = 0; s < stages; s++) {
    b.paint(g, MAT.GLASS_TOWER).box((x0 + x1) / 2, y + stageH / 2, (z0 + z1) / 2, x1 - x0, stageH, z1 - z0);
    // Vertical fins on the corners.
    b.paint(hex('#d8dde2'), MAT.METAL);
    for (const [fx, fz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) b.box(fx, y + stageH / 2, fz, 0.7, stageH, 0.7);
    col.addBox(x0, z0, x1, z1, y + stageH, { kind: 'building', y0: y - 1 });
    y += stageH;
    if (s < stages - 1) {
      roofTop(ctx, x0, z0, x1, z1, y, { lux: true });
      const sb = rng.range(2, 4);
      x0 += sb; z0 += sb; x1 -= sb; z1 -= sb;
    }
  }
  // Crown band that glows at night.
  b.paint(g.map((c) => Math.min(1, c * 1.6 + 0.2)), MAT.NEON, 0.6);
  b.box((x0 + x1) / 2, y - 0.6, (z0 + z1) / 2, x1 - x0 + 0.3, 0.5, z1 - z0 + 0.3);
  roofTop(ctx, x0, z0, x1, z1, y, { allowHelipad: allowHelipad && rng.chance(1 / 6) });
  return y;
}

/** Bukit Asri house: one or two storeys, pitched tile roof, garden, fence, optional pool and tree. */
export function house(ctx, p) {
  const { b, rng, col } = ctx;
  const y0 = CURB;
  const w = p.x1 - p.x0, d = p.z1 - p.z0;
  // Garden ground.
  b.paint(hex('#4f9a3e'), MAT.GRASS).box((p.x0 + p.x1) / 2, y0 + 0.03, (p.z0 + p.z1) / 2, w, 0.06, d);
  const hw = Math.min(w - 8, rng.range(10, 14)), hd = Math.min(d - 8, rng.range(9, 12));
  const front = p.fronts[0] ?? 's';
  const fd = FRONT_DIR[front];
  const hx = (p.x0 + p.x1) / 2 - fd[0] * 2, hz = (p.z0 + p.z1) / 2 - fd[1] * 2;
  const storeys = rng.chance(0.5) ? 2 : 1;
  const hh = storeys * 3.2;
  const wall = hex(rng.pick(PALETTES.house));
  b.paint(wall, MAT.PLAIN).box(hx, y0 + hh / 2, hz, hw, hh, hd);
  col.addBox(hx - hw / 2, hz - hd / 2, hx + hw / 2, hz + hd / 2, y0 + hh + 2.5, { kind: 'building' });
  // Windows and door on every side.
  b.paint(hex('#22303a'), MAT.GLASS);
  for (let s = 0; s < storeys; s++) {
    const wy = y0 + s * 3.2 + 1.7;
    for (const t of [-0.3, 0.3]) {
      b.box(hx + t * hw, wy, hz + hd / 2 + 0.02, 1.4, 1.3, 0.08).box(hx + t * hw, wy, hz - hd / 2 - 0.02, 1.4, 1.3, 0.08);
      b.box(hx + hw / 2 + 0.02, wy, hz + t * hd, 0.08, 1.3, 1.4).box(hx - hw / 2 - 0.02, wy, hz + t * hd, 0.08, 1.3, 1.4);
    }
  }
  b.paint(hex('#fff2c8'), MAT.LAMP, 0.5);
  b.box(hx + fd[0] * (hw / 2 + 0.05), y0 + 1.9, hz + fd[1] * (hd / 2 + 0.05), fd[0] ? 0.08 : 1.0, 0.7, fd[0] ? 1.0 : 0.08);
  b.paint(hex('#6a4028'), MAT.WOOD).box(hx + fd[0] * (hw / 2 + 0.06), y0 + 1.1, hz + fd[1] * (hd / 2 + 0.06), fd[0] ? 0.1 : 1.1, 2.2, fd[0] ? 1.1 : 0.1);
  // Roof: gable along the longer side.
  b.paint(hex(rng.pick(PALETTES.roof)), MAT.ROOF);
  if (hw >= hd) b.gableRoof(hx, y0 + hh, hz, hw, hd, rng.range(2.2, 3.2), 0.5);
  else b.push().transform(hx, 0, hz, Math.PI / 2).gableRoof(0, y0 + hh, 0, hd, hw, rng.range(2.2, 3.2), 0.5).pop();
  // Fence along the street fronts with a gate gap.
  b.paint(hex(rng.pick(['#f4f4f0', '#3a3a3a', '#8a6a4a'])), MAT.WOOD);
  for (const f of p.fronts) {
    const along = f === 'n' || f === 's';
    const face = f === 'e' ? p.x1 - 0.3 : f === 'w' ? p.x0 + 0.3 : f === 's' ? p.z1 - 0.3 : p.z0 + 0.3;
    const a0 = along ? p.x0 : p.z0, a1 = along ? p.x1 : p.z1;
    const mid = (a0 + a1) / 2;
    for (const [s0, s1] of [[a0 + 0.5, mid - 2], [mid + 2, a1 - 0.5]]) {
      const c = (s0 + s1) / 2, len = s1 - s0;
      if (along) b.box(c, y0 + 0.6, face, len, 1.2, 0.12);
      else b.box(face, y0 + 0.6, c, 0.12, 1.2, len);
      if (along) col.addBox(s0, face - 0.15, s1, face + 0.15, y0 + 1.2, { kind: 'fence' });
      else col.addBox(face - 0.15, s0, face + 0.15, s1, y0 + 1.2, { kind: 'fence' });
    }
  }
  // Pool behind the house.
  if (rng.chance(0.45)) {
    const px = hx - fd[0] * (hd / 2 + 5), pz = hz - fd[1] * (hd / 2 + 5);
    const inside = px > p.x0 + 4 && px < p.x1 - 4 && pz > p.z0 + 4 && pz < p.z1 - 4;
    if (inside) {
      b.paint(hex('#ebe7dc'), MAT.CONCRETE).box(px, y0 + 0.1, pz, 7, 0.2, 4.5);
      b.paint(hex('#22b4d8'), MAT.WATER).box(px, y0 + 0.21, pz, 6, 0.04, 3.5);
    }
  }
  // Car port slab.
  b.paint(hex('#9a958c'), MAT.CONCRETE).box(hx + (fd[1] ? hw / 2 + 2.6 : 0), y0 + 0.08, hz + (fd[0] ? hd / 2 + 2.6 : 0), fd[1] ? 4 : 6, 0.1, fd[0] ? 4 : 6);
  ctx.treeSpots.push([p.x0 + 2.5, p.z0 + 2.5], [p.x1 - 2.5, p.z1 - 2.5]);
}

/** Warehouse: corrugated shed with roller doors, roof vents and safety lines in front. */
export function warehouse(ctx, p, { color = null, label = null } = {}) {
  const { b, rng, col, atlas, signs } = ctx;
  const y0 = CURB;
  const h = rng.range(9, 13);
  const w = p.x1 - p.x0 - 4, d = p.z1 - p.z0 - 4;
  const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
  const c = hex(color ?? rng.pick(PALETTES.warehouse));
  b.paint(c, MAT.METAL).box(cx, y0 + h / 2, cz, w, h, d);
  // Corrugation ribs.
  b.paint(c.map((v) => v * 0.8), MAT.METAL);
  for (let x = cx - w / 2 + 1.5; x < cx + w / 2; x += 3) {
    b.box(x, y0 + h / 2, cz + d / 2 + 0.05, 0.2, h, 0.1).box(x, y0 + h / 2, cz - d / 2 - 0.05, 0.2, h, 0.1);
  }
  b.paint(hex('#5a5f66'), MAT.METAL);
  b.push().transform(cx, y0 + h, cz, 0, 0, 0);
  b.box(0, 0.8, d / 4, w + 0.6, 0.25, d / 2 + 0.6);
  b.pop();
  b.box(cx, y0 + h + 0.7, cz - d / 4, w + 0.6, 0.25, d / 2 + 0.6);
  col.addBox(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y0 + h + 1, { kind: 'building' });
  const f = p.fronts[0] ?? 'n';
  const fd = FRONT_DIR[f];
  const along = f === 'n' || f === 's';
  const face = along ? cz + fd[1] * (d / 2 + 0.06) : cx + fd[0] * (w / 2 + 0.06);
  const span = along ? w : d;
  const doors = Math.max(1, Math.floor(span / 12));
  for (let k = 0; k < doors; k++) {
    const t = (along ? cx - w / 2 : cz - d / 2) + (k + 0.5) * (span / doors);
    b.paint(hex('#c9c4b0'), MAT.METAL).box(along ? t : face, y0 + 2.8, along ? face : t, along ? 6 : 0.12, 5.6, along ? 0.12 : 6);
    b.paint(hex('#ffd23a'), MAT.PLAIN).box(along ? t : face + fd[0] * 2.5, y0 + 0.02, along ? face + fd[1] * 2.5 : t, along ? 6.5 : 5, 0.02, along ? 5 : 6.5);
    b.paint(hex('#ffe9b0'), MAT.LAMP, 0.9).box(along ? t : face + fd[0] * 0.3, y0 + 6.3, along ? face + fd[1] * 0.3 : t, along ? 1.2 : 0.3, 0.25, along ? 0.3 : 1.2);
    ctx.shopLights.push([along ? t : face + fd[0] * 3, y0 + 6, along ? face + fd[1] * 3 : t, [1, 0.85, 0.6]]);
  }
  if (label) {
    const s = atlas.text(label, { fg: '#ffffff', bg: '#4a1a6a', w: 768, h: 128 });
    signs.quad(along ? cx : face + fd[0] * 0.1, y0 + h - 1.6, along ? face + fd[1] * 0.1 : cz, FRONT_YAW[f], Math.min(span * 0.7, 18), 3, s, 1.8);
  }
  return h;
}

/** Beach hotel: tall pastel slab with continuous balconies and a pool deck facing the sea. */
export function hotel(ctx, p, name) {
  const { b, rng, col, atlas, signs } = ctx;
  const y0 = CURB;
  const nf = rng.int(6, 12);
  const h = nf * 3.3;
  const c = hex(rng.pick(PALETTES.hotel));
  const w = p.x1 - p.x0, d = Math.min(18, p.z1 - p.z0 - 12);
  const cx = (p.x0 + p.x1) / 2, cz = p.z0 + d / 2 + 2;
  b.paint(c, MAT.WINDOWS).box(cx, y0 + h / 2, cz, w, h, d);
  col.addBox(cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y0 + h, { kind: 'building' });
  const stripe = hex(rng.pick(['#1b8f86', '#e96fa8', '#2c6fd1', '#f2b63a']));
  for (let fl = 1; fl < nf; fl++) {
    b.paint([0.95, 0.95, 0.93], MAT.CONCRETE).box(cx, y0 + fl * 3.3, cz + d / 2 + 0.8, w - 1, 0.2, 1.6);
    b.paint(stripe, MAT.PAINT).box(cx, y0 + fl * 3.3 + 0.55, cz + d / 2 + 1.55, w - 1, 0.9, 0.06);
  }
  roofTop(ctx, cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, y0 + h, { lux: true });
  shopfronts(ctx, cx - w / 2, cz - d / 2, cx + w / 2, cz + d / 2, 'n');
  // Pool deck on the sea side.
  const pz = cz + d / 2 + 6;
  b.paint(hex('#ece4d2'), MAT.CONCRETE).box(cx, y0 + 0.1, pz, w - 4, 0.2, 9);
  b.paint(hex('#1fc0dd'), MAT.WATER).box(cx, y0 + 0.21, pz, w - 10, 0.05, 5);
  const s = atlas.text(name, { fg: '#ffffff', bg: null, w: 768, h: 128, font: 'italic 900 72px "Arial Black", sans-serif' });
  signs.quad(cx, y0 + h - 2.2, cz - d / 2 - 0.15, Math.PI, Math.min(w * 0.8, 22), 3.6, s, 2.2);
  return h;
}
