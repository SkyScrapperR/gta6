// Unique landmark buildings. Each builds into a lot rectangle (x0,z0,x1,z1 of the block interior),
// registers collision, adds its sign, and returns gameplay anchors (markers, spawns, cutscene spots).
// The lot's north side (small z) faces the street the story uses for its markers.

import { MAT } from '../engine/mesh-builder.js';
import { hex } from '../core/math.js';
import { CURB } from './layout.js';
import { midrise, tower, warehouse, shopfronts, roofTop } from './buildings.js';

const Y = CURB;

function signAt(ctx, label, x, y, z, yaw, w, h, opts = {}, glow = 2.4) {
  const s = ctx.atlas.text(label, { w: 768, h: 160, ...opts });
  ctx.signs.quad(x, y, z, yaw, w, h, s, glow, opts.flicker ? 1 : 0);
}

/** Lin's Garage: open service bay with two lifts, tool walls, neon sign. Bay opens north. */
function garage(ctx, L) {
  const { b, col } = ctx;
  const cx = (L.x0 + L.x1) / 2, z0 = L.z0 + 2;
  const w = 30, d = 22, h = 7.5;
  const x0 = cx - w / 2, x1 = cx + w / 2, z1 = z0 + d;
  // Floor, walls (back and sides), roof. The north side is open.
  b.paint(hex('#5f6064'), MAT.CONCRETE).box(cx, Y + 0.03, z0 + d / 2, w, 0.06, d);
  b.paint(hex('#ffd23a'), MAT.PLAIN).box(cx, Y + 0.07, z0 + 1.2, w - 2, 0.02, 0.3);
  const wall = hex('#d9c7a2');
  b.paint(wall, MAT.PLAIN).box(cx, Y + h / 2, z1 - 0.3, w, h, 0.6).box(x0 + 0.3, Y + h / 2, z0 + d / 2, 0.6, h, d).box(x1 - 0.3, Y + h / 2, z0 + d / 2, 0.6, h, d);
  b.paint(hex('#3a3d44'), MAT.METAL).box(cx, Y + h + 0.2, z0 + d / 2, w + 1, 0.4, d + 1);
  b.paint(wall, MAT.PLAIN).box(cx, Y + h - 0.9, z0 + 0.3, w, 1.8, 0.6);
  col.addBox(x0, z1 - 0.6, x1, z1, Y + h, { kind: 'building' });
  col.addBox(x0, z0, x0 + 0.6, z1, Y + h, { kind: 'building' });
  col.addBox(x1 - 0.6, z0, x1, z1, Y + h, { kind: 'building' });
  // Two lifts with posts, arms and platforms (cars are placed on them by the city).
  const lifts = [];
  for (const lx of [cx - 7.5, cx + 7.5]) {
    b.paint(hex('#c03a2a'), MAT.PAINT);
    b.box(lx - 1.6, Y + 1.6, z0 + 13, 0.4, 3.2, 0.4).box(lx + 1.6, Y + 1.6, z0 + 13, 0.4, 3.2, 0.4);
    b.box(lx - 1.6, Y + 1.6, z0 + 8, 0.4, 3.2, 0.4).box(lx + 1.6, Y + 1.6, z0 + 8, 0.4, 3.2, 0.4);
    b.paint(hex('#5a5f66'), MAT.METAL).box(lx, Y + 1.8, z0 + 10.5, 3.6, 0.15, 5.6);
    col.addBox(lx - 1.9, z0 + 7.7, lx + 1.9, z0 + 13.3, Y + 1.9, { kind: 'lift' });
    lifts.push([lx, Y + 1.95, z0 + 10.5]);
  }
  // Tool walls: pegboards with coloured tools, workbench, tyre stack, oil drums.
  b.paint(hex('#8a7a5a'), MAT.WOOD).box(cx, Y + 2.3, z1 - 0.65, 14, 2.2, 0.1);
  for (let k = 0; k < 18; k++) {
    b.paint(hex(['#d03030', '#3070d0', '#e0c030', '#404448', '#30a060'][k % 5]), MAT.METAL);
    b.box(cx - 6.4 + k * 0.75, Y + 2.1 + (k % 3) * 0.5, z1 - 0.72, 0.12, 0.5 + (k % 2) * 0.3, 0.06);
  }
  b.paint(hex('#5a4a3a'), MAT.WOOD).box(cx, Y + 0.9, z1 - 1.4, 10, 0.1, 1.2);
  b.paint(hex('#3a3d44'), MAT.METAL).box(cx, Y + 0.45, z1 - 1.4, 9.6, 0.9, 1.0);
  b.paint(hex('#1a1a1a'), MAT.PLAIN);
  for (let k = 0; k < 4; k++) b.cylinder(x0 + 2, Y + k * 0.28, z1 - 2.2, 0.42, 0.42, 0.26, 12).cylinder(x0 + 2, Y + k * 0.28, z1 - 3.3, 0.42, 0.42, 0.26, 12);
  b.paint(hex('#fff1d0'), MAT.LAMP, 0.9);
  for (const lx of [cx - 9, cx, cx + 9]) b.box(lx, Y + h - 0.15, z0 + d / 2, 4, 0.12, 0.3);
  ctx.shopLights.push([cx, Y + h - 1, z0 + d / 2, [1, 0.85, 0.6]], [cx - 8, Y + h - 1, z0 + 6, [1, 0.85, 0.6]]);
  // Neon sign over the bay.
  signAt(ctx, "LIN'S GARAGE", cx, Y + h - 0.9, z0 - 0.02, Math.PI, 16, 2.6, { fg: '#ff7a3a', font: '900 96px "Arial Black", sans-serif', flicker: true }, 3.2);
  ctx.neonLights.push([cx, Y + h - 0.6, z0 - 1.5, [1.0, 0.45, 0.15]]);
  // Fill the rest of the lot with ordinary Kemuning buildings.
  ctx.fill(L.x0, z1 + 6, L.x1, L.z1, ['w', 'e', 's']);
  ctx.fill(L.x0, L.z0, x0 - 4, z1 + 2, ['w', 'n']);
  ctx.fill(x1 + 4, L.z0, L.x1, z1 + 2, ['e', 'n']);
  return {
    bay: [cx, z0 + 5], lifts, inside: [cx, z0 + 4], front: [cx - 10, L.z0 - 2.2],
    cutKai: [cx - 0.6, z0 + 1.6], cutLin: [cx + 1.1, z0 + 2.3],
  };
}

function safehouse(ctx, L) {
  const { b, col } = ctx;
  const cx = (L.x0 + L.x1) / 2, cz = L.z0 + 18;
  b.paint(hex('#4f9a3e'), MAT.GRASS).box(cx, Y + 0.03, cz + 4, 40, 0.06, 34);
  b.paint(hex('#f3efe6'), MAT.PLAIN).box(cx, Y + 3.3, cz + 6, 18, 6.6, 12);
  b.paint(hex('#2a3540'), MAT.GLASS).box(cx, Y + 1.8, cz - 0.02, 12, 2.6, 0.1).box(cx, Y + 5.0, cz - 0.02, 14, 2.2, 0.1);
  b.paint(hex('#3e4a52'), MAT.METAL).box(cx, Y + 6.8, cz + 6, 19.5, 0.4, 13.5);
  b.paint(hex('#8a6a4a'), MAT.WOOD).box(cx + 6, Y + 1.1, cz - 0.05, 1.3, 2.2, 0.12);
  b.paint(hex('#9a958c'), MAT.CONCRETE).box(cx, Y + 0.08, cz - 5, 6, 0.1, 10);
  b.paint(hex('#22b4d8'), MAT.WATER).box(cx - 13, Y + 0.2, cz + 8, 6, 0.05, 10);
  b.paint(hex('#ebe7dc'), MAT.CONCRETE).box(cx - 13, Y + 0.1, cz + 8, 7.2, 0.18, 11.2);
  col.addBox(cx - 9, cz, cx + 9, cz + 12, Y + 6.8, { kind: 'building' });
  signAt(ctx, 'SAFEHOUSE', cx, Y + 7.6, cz - 0.1, Math.PI, 6, 1.1, { fg: '#2ff3e0' }, 2);
  ctx.fill(L.x0, cz + 16, L.x1, L.z1, ['w', 'e', 's'], 'house');
  ctx.fill(L.x0, L.z0, cx - 22, cz + 14, ['w', 'n'], 'house');
  ctx.fill(cx + 22, L.z0, L.x1, cz + 14, ['e', 'n'], 'house');
  return { door: [cx + 6, cz - 1.5], save: [cx - 3, cz - 4], pickup: [cx + 3, cz - 6], front: [cx, L.z0 - 2.2] };
}

function hospital(ctx, L) {
  const { b, col } = ctx;
  const cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2 + 6;
  b.paint(hex('#eef2f4'), MAT.WINDOWS).box(cx, Y + 14, cz, 50, 28, 36);
  b.paint(hex('#d3dde2'), MAT.CONCRETE).box(cx, Y + 3, cz - 21, 24, 0.4, 8);
  for (const x of [cx - 11, cx + 11]) b.box(x, Y + 1.5, cz - 24.5, 0.5, 3, 0.5);
  col.addBox(cx - 25, cz - 18, cx + 25, cz + 18, Y + 28, { kind: 'building' });
  roofTop(ctx, cx - 25, cz - 18, cx + 25, cz + 18, Y + 28, { allowHelipad: true });
  const cross = ctx.atlas.custom('redcross', 128, 128, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    c.fillStyle = '#e02424'; c.fillRect(w * 0.38, h * 0.12, w * 0.24, h * 0.76); c.fillRect(w * 0.12, h * 0.38, w * 0.76, h * 0.24);
  });
  ctx.signs.quad(cx, Y + 23, cz - 18.1, Math.PI, 5, 5, cross, 2.4);
  signAt(ctx, 'SELARA GENERAL HOSPITAL', cx, Y + 8.5, cz - 18.12, Math.PI, 24, 2.4, { fg: '#e02424', bg: '#ffffff' }, 1.6);
  ctx.fill(L.x0, L.z0, L.x1, cz - 26, ['n', 'w', 'e']);
  return { respawn: [cx, cz - 24], front: [cx, L.z0 - 2.2] };
}

function police(ctx, L) {
  const { b, col } = ctx;
  const cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2 + 6;
  b.paint(hex('#c8ccd2'), MAT.WINDOWS).box(cx, Y + 11, cz, 46, 22, 30);
  b.paint(hex('#1d3f7a'), MAT.PAINT).box(cx, Y + 4.2, cz - 15.2, 46.2, 1.4, 0.3).box(cx, Y + 22.3, cz, 46.4, 0.6, 30.4);
  col.addBox(cx - 23, cz - 15, cx + 23, cz + 15, Y + 22, { kind: 'building' });
  roofTop(ctx, cx - 23, cz - 15, cx + 23, cz + 15, Y + 22);
  signAt(ctx, 'SELARA POLICE HQ', cx, Y + 6.6, cz - 15.4, Math.PI, 18, 2.2, { fg: '#ffffff', bg: '#1d3f7a' }, 1.8);
  // Car park in front with painted bays.
  b.paint(hex('#3a3c42'), MAT.ASPHALT).box(cx, Y + 0.02, cz - 22, 46, 0.04, 12);
  b.paint([0.9, 0.9, 0.9], MAT.PLAIN);
  for (let x = cx - 21; x <= cx + 21; x += 4.2) b.box(x, Y + 0.05, cz - 22, 0.15, 0.02, 5);
  ctx.fill(L.x0, L.z0, L.x1, cz - 30, ['n', 'w', 'e']);
  ctx.parkingLot.push(...[-12.6, -4.2, 4.2, 12.6].map((dx) => [cx + dx + 2.1, cz - 22, 0, 'police']));
  return { respawn: [cx, cz - 18.5], front: [cx, L.z0 - 2.2] };
}

function bank(ctx, L) {
  const { b, col } = ctx;
  const cx = (L.x0 + L.x1) / 2, z0 = L.z0 + 8;
  b.paint(hex('#e8e0cc'), MAT.WINDOWS).box(cx, Y + 9, z0 + 15, 36, 18, 30);
  b.paint(hex('#f2ecdc'), MAT.CONCRETE).box(cx, Y + 0.5, z0 - 2, 30, 1, 4).box(cx, Y + 13.5, z0 - 2.5, 32, 1.6, 5);
  for (let k = 0; k < 6; k++) b.paint(hex('#f6f1e4'), MAT.CONCRETE).cylinder(cx - 12.5 + k * 5, Y + 1, z0 - 3.5, 0.75, 0.65, 11.8, 12);
  b.paint(hex('#2a2a2e'), MAT.GLASS).box(cx, Y + 3.5, z0 - 0.02, 8, 5, 0.1);
  col.addBox(cx - 18, z0, cx + 18, z0 + 30, Y + 18, { kind: 'building' });
  roofTop(ctx, cx - 18, z0, cx + 18, z0 + 30, Y + 18);
  signAt(ctx, 'BANK SAMUDRA', cx, Y + 13.5, z0 - 5.05, Math.PI, 18, 1.4, { fg: '#ffd23a', bg: '#10223a' }, 2.0);
  ctx.fill(L.x0, z0 + 34, L.x1, L.z1, ['w', 'e', 's'], 'tower');
  return { door: [cx, z0 - 6], getaway: [cx + 8, L.z0 - 15.8], front: [cx, L.z0 - 2.2] };
}

function orchidTower(ctx, L) {
  const { b, col, atlas, signs } = ctx;
  const cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2;
  // Plaza.
  b.paint(hex('#b9b2c8'), MAT.CONCRETE).box(cx, Y + 0.05, cz, L.x1 - L.x0, 0.1, L.z1 - L.z0);
  const topY = tower(ctx, { x0: cx - 18, z0: cz - 18, x1: cx + 18, z1: cz + 18, fronts: ['n', 's', 'e', 'w'] }, { height: 215, glass: '#6a3aa8', podiumColor: '#3a2a4a', allowHelipad: true });
  // Spire and the glowing orchid emblem on all four faces.
  b.paint(hex('#d8c8ff'), MAT.METAL).cylinder(cx, topY, cz, 0.8, 0.1, 28, 8);
  b.paint(hex('#ff2a8a'), MAT.LAMP, 2).sphere(cx, topY + 28, cz, 0.5);
  const orchid = atlas.custom('orchid', 256, 256, (c, w, h) => {
    c.translate(w / 2, h / 2);
    c.shadowColor = '#ff5ad0'; c.shadowBlur = 18;
    for (let k = 0; k < 5; k++) {
      c.save(); c.rotate((k / 5) * Math.PI * 2);
      const g = c.createLinearGradient(0, 0, 0, -h * 0.42);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.4, '#ff7ad8'); g.addColorStop(1, '#a040ff');
      c.fillStyle = g;
      c.beginPath(); c.ellipse(0, -h * 0.22, w * 0.11, h * 0.21, 0, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    c.fillStyle = '#fff6a0'; c.beginPath(); c.arc(0, 0, w * 0.07, 0, Math.PI * 2); c.fill();
  });
  const ey = topY - 14;
  const half = 18 - 4.5;
  for (const [x, z, yaw] of [[cx, cz - half - 0.6, Math.PI], [cx, cz + half + 0.6, 0], [cx + half + 0.6, cz, Math.PI / 2], [cx - half - 0.6, cz, -Math.PI / 2]]) {
    signs.quad(x, ey, z, yaw, 16, 16, orchid, 4.0);
  }
  ctx.neonLights.push([cx, Y + 12, cz - 24, [0.8, 0.3, 1.0]]);
  // Plaza planters and fountains.
  ctx.props.add('fountain', cx - 26, Y, cz - 28);
  ctx.props.add('fountain', cx + 26, Y, cz - 28);
  for (const [px, pz] of [[cx - 30, cz], [cx + 30, cz], [cx - 30, cz + 28], [cx + 30, cz + 28]]) ctx.props.add('planter', px, Y, pz);
  signAt(ctx, 'ORCHID TOWER', cx, Y + 5.5, cz - 18.2, Math.PI, 14, 1.8, { fg: '#e0a0ff' }, 2.6);
  return { base: [cx, cz - 26], front: [cx - 10, L.z0 - 2.2], carStart: [cx + 12, L.z0 - 5.2], top: [cx, topY, cz] };
}

function freight(ctx, L) {
  const cx = (L.x0 + L.x1) / 2;
  warehouse(ctx, { x0: L.x0 + 2, z0: L.z0 + 2, x1: L.x1 - 2, z1: L.z0 + 40, fronts: ['s'] }, { color: '#3a2a4a', label: 'ORCHID FREIGHT' });
  // Yard with lit containers (the firefight arena).
  const yard = { x0: L.x0 + 4, z0: L.z0 + 46, x1: L.x1 - 4, z1: L.z1 - 4 };
  const cover = [];
  const colors = [[0.75, 0.2, 0.18], [0.15, 0.4, 0.75], [0.2, 0.6, 0.35], [0.85, 0.6, 0.15], [0.55, 0.25, 0.65]];
  let k = 0;
  for (const [x, z, yaw] of [[yard.x0 + 8, yard.z0 + 6, 0], [yard.x0 + 20, yard.z0 + 14, Math.PI / 2], [cx + 6, yard.z0 + 8, 0], [cx + 18, yard.z0 + 18, Math.PI / 2], [yard.x0 + 10, yard.z1 - 6, Math.PI / 2], [yard.x1 - 8, yard.z1 - 8, 0], [cx - 2, yard.z1 - 12, Math.PI / 2]]) {
    const c = colors[k++ % colors.length];
    ctx.container(x, z, yaw, c, k % 3 === 0 ? 2 : 1);
    cover.push([x, z, yaw]);
  }
  ctx.props.add('crane', cx, Y, yard.z0 + 10, Math.PI / 2, 1, [1, 1, 1, 0], { solid: false });
  ctx.col.addBox(cx - 7.6, yard.z0 + 2.4, cx - 6.4, yard.z0 + 3.6, 30, { kind: 'crane' });
  ctx.col.addBox(cx + 6.4, yard.z0 + 2.4, cx + 7.6, yard.z0 + 3.6, 30, { kind: 'crane' });
  ctx.col.addBox(cx - 7.6, yard.z0 + 16.4, cx - 6.4, yard.z0 + 17.6, 30, { kind: 'crane' });
  ctx.col.addBox(cx + 6.4, yard.z0 + 16.4, cx + 7.6, yard.z0 + 17.6, 30, { kind: 'crane' });
  for (let x = yard.x0 + 3; x < yard.x1; x += 9) ctx.lamps.push([x, Y, yard.z1 + 1, Math.PI]);
  return { yard, cover, truck: [cx - 10, yard.z0 + 20], entrance: [cx, L.z1 + 4], guardSpots: [[yard.x0 + 8, yard.z0 + 10], [yard.x0 + 22, yard.z0 + 18], [cx + 6, yard.z0 + 12], [cx + 16, yard.z0 + 24], [yard.x0 + 12, yard.z1 - 10], [yard.x1 - 10, yard.z1 - 12]] };
}

function respray(ctx, L) {
  const { b, col } = ctx;
  const cx = (L.x0 + L.x1) / 2, z0 = L.z0 + 2;
  const w = 16, d = 14, h = 6.5;
  b.paint(hex('#2c3a3a'), MAT.PLAIN);
  b.box(cx, Y + h / 2, z0 + d - 0.3, w, h, 0.6).box(cx - w / 2 + 0.3, Y + h / 2, z0 + d / 2, 0.6, h, d).box(cx + w / 2 - 0.3, Y + h / 2, z0 + d / 2, 0.6, h, d);
  b.paint(hex('#3a4a4a'), MAT.METAL).box(cx, Y + h + 0.2, z0 + d / 2, w + 0.8, 0.4, d + 0.8);
  b.paint(hex('#555'), MAT.CONCRETE).box(cx, Y + 0.03, z0 + d / 2, w, 0.06, d);
  b.paint(hex('#4dff9a'), MAT.NEON, 0.8);
  for (const x of [cx - w / 2 + 0.7, cx + w / 2 - 0.7]) b.box(x, Y + h - 0.3, z0 + d / 2, 0.12, 0.12, d - 1);
  col.addBox(cx - w / 2, z0 + d - 0.6, cx + w / 2, z0 + d, Y + h, { kind: 'building' });
  col.addBox(cx - w / 2, z0, cx - w / 2 + 0.6, z0 + d, Y + h, { kind: 'building' });
  col.addBox(cx + w / 2 - 0.6, z0, cx + w / 2, z0 + d, Y + h, { kind: 'building' });
  signAt(ctx, 'KILAT RESPRAY', cx, Y + h + 1.4, z0 - 0.1, Math.PI, 12, 2, { fg: '#4dff9a', flicker: true }, 3);
  ctx.neonLights.push([cx, Y + 4, z0 + 4, [0.3, 1.0, 0.6]]);
  ctx.fill(L.x0, L.z0, cx - w / 2 - 4, L.z1, ['w', 'n', 's']);
  ctx.fill(cx + w / 2 + 4, L.z0, L.x1, L.z1, ['e', 'n', 's']);
  ctx.fill(cx - w / 2 - 2, z0 + d + 4, cx + w / 2 + 2, L.z1, ['s']);
  return { bay: [cx, z0 + d / 2], front: [cx - 12, L.z0 - 2.2] };
}

function guns(ctx, L) {
  const { atlas, signs } = ctx;
  const p = { x0: L.x0, z0: L.z0, x1: L.x0 + 34, z1: L.z0 + 26, fronts: ['n', 'w'] };
  const h = midrise(ctx, p, { floors: 3, palette: ['#4a4a4a'], shops: false });
  shopfronts(ctx, p.x0, p.z0, p.x1, p.z1, 'w');
  ctx.b.paint(hex('#1a1a1a'), MAT.METAL).box((p.x0 + p.x1) / 2, Y + 2, p.z0 - 0.1, 30, 3.6, 0.2);
  const s = atlas.text('BANG BANG ARMS', { fg: '#ff7a3a', bg: '#140a08', w: 768, h: 160, sub: 'AMMO · ARMOR · GEAR' });
  signs.quad((p.x0 + p.x1) / 2, Y + 5.2, p.z0 - 0.25, Math.PI, 16, 3.2, s, 2.4);
  ctx.neonLights.push([(p.x0 + p.x1) / 2, Y + 5, p.z0 - 2, [1.0, 0.5, 0.2]]);
  ctx.fill(p.x1 + 4, L.z0, L.x1, L.z1, ['e', 'n', 's']);
  ctx.fill(L.x0, p.z1 + 4, p.x1, L.z1, ['w', 's']);
  void h;
  return { counter: [(p.x0 + p.x1) / 2, p.z0 - 2.5], front: [(p.x0 + p.x1) / 2, L.z0 - 2.2] };
}

function dex(ctx, L) {
  const p = { x0: L.x0 + 20, z0: L.z0, x1: L.x0 + 52, z1: L.z0 + 28, fronts: ['n'] };
  midrise(ctx, p, { floors: 7, palette: ['#7a6a9a', '#6a7a8a'] });
  const s = ctx.atlas.text('DEX', { fg: '#7ad7ff', w: 256, h: 128 });
  ctx.signs.quad(p.x0 + 3, Y + 12, p.z0 - 0.2, Math.PI, 3, 1.5, s, 3, 1);
  ctx.fill(L.x0, L.z0, p.x0 - 4, L.z1, ['w', 'n', 's']);
  ctx.fill(p.x1 + 4, L.z0, L.x1, L.z1, ['e', 'n', 's']);
  ctx.fill(p.x0, p.z1 + 4, p.x1, L.z1, ['s']);
  return { door: [(p.x0 + p.x1) / 2, p.z0 - 2.5], front: [(p.x0 + p.x1) / 2, L.z0 - 2.2] };
}

function cafe(ctx, L) {
  const { b, col } = ctx;
  const cx = L.x0 + 22, z0 = L.z0 + 8;
  b.paint(hex('#2a1a2a'), MAT.WINDOWS).box(cx, Y + 3.6, z0 + 8, 26, 7.2, 16);
  col.addBox(cx - 13, z0, cx + 13, z0 + 16, Y + 7.2, { kind: 'building' });
  shopfronts(ctx, cx - 13, z0, cx + 13, z0 + 16, 'n');
  roofTop(ctx, cx - 13, z0, cx + 13, z0 + 16, Y + 7.2, { lux: true });
  const s = ctx.atlas.text('KEDAI ORCHID', { fg: '#ff7ab8', w: 768, h: 160, sub: 'kopi · teh · roti bakar' });
  ctx.signs.quad(cx, Y + 6.6, z0 - 0.3, Math.PI, 13, 2.6, s, 3, 1);
  ctx.neonLights.push([cx, Y + 6, z0 - 2, [1.0, 0.4, 0.7]]);
  // Terrace tables with umbrellas.
  for (let k = 0; k < 4; k++) ctx.props.add('umbrella', cx - 9 + k * 6, Y, z0 - 4, 0, 0.8, [k % 2 ? 0.9 : 0.5, 0.3, k % 2 ? 0.6 : 0.8, 0]);
  ctx.fill(cx + 17, L.z0, L.x1, L.z1, ['e', 'n', 's']);
  ctx.fill(L.x0, z0 + 20, cx + 13, L.z1, ['w', 's']);
  return { front: [cx, z0 - 6], terrace: [cx, z0 - 4], fightArea: [cx, L.z0 - 8] };
}

export const LANDMARK_BUILDERS = { garage, safehouse, hospital, police, bank, tower: orchidTower, freight, respray, guns, dex, cafe };
