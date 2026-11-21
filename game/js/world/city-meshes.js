// Ground-level geometry for one chunk: asphalt with lane markings, zebra crossings, stop lines and
// manholes; raised sidewalks with kerbs; lot ground per district; and the coast (sea wall, beach,
// boardwalk, ferry pier, east pier, sea plane).

import { MAT } from '../engine/mesh-builder.js';
import { hex } from '../core/math.js';
import { PITCH, GRID, ROAD_HALF, SIDEWALK, CURB, CITY, SEA_LEVEL, BEACH_END } from './layout.js';

const ASPHALT = hex('#3a3c42');
const WHITE = [0.86, 0.86, 0.82];
const YELLOW = hex('#e8b830');
const SIDEWALK_COL = hex('#b9b2a4');
const KERB = hex('#d8d4cc');

/** Road surfaces owned by chunk (i, j): the junction at (i,j) plus the segments east and south of it. */
export function buildRoads(b, i, j, rng) {
  const X = i * PITCH, Z = j * PITCH;
  const H = ROAD_HALF;
  b.paint(ASPHALT, MAT.ASPHALT);
  b.plane(X - H, Z - H, X + H, Z + H, 0);
  // Junction box with a faint yellow grid edge.
  const segs = [];
  if (i < GRID) segs.push(['x', X + H, X + PITCH - H, Z]);
  if (j < GRID) segs.push(['z', Z + H, Z + PITCH - H, X]);
  for (const [axis, a0, a1, c] of segs) {
    b.paint(ASPHALT, MAT.ASPHALT);
    if (axis === 'x') b.plane(a0, c - H, a1, c + H, 0);
    else b.plane(c - H, a0, c + H, a1, 0);
    const mk = (u0, u1, v0, v1, col, y = 0.012) => {
      b.paint(col, MAT.PLAIN);
      if (axis === 'x') b.plane(u0, c + v0, u1, c + v1, y);
      else b.plane(c + v0, u0, c + v1, u1, y);
    };
    // Centre dashes.
    for (let u = a0 + 14; u < a1 - 14; u += 7) mk(u, u + 3.5, -0.09, 0.09, WHITE);
    // Lane edge lines (parking shoulder beyond them).
    mk(a0 + 12, a1 - 12, 4.3, 4.45, WHITE);
    mk(a0 + 12, a1 - 12, -4.45, -4.3, WHITE);
    // Zebra crossings and stop lines at both ends.
    for (const end of [a0, a1]) {
      const dir = end === a0 ? 1 : -1;
      const z0 = end + dir * 1.0, z1 = end + dir * 4.0;
      const lo = Math.min(z0, z1), hi = Math.max(z0, z1);
      for (let v = -H + 0.6; v < H - 0.6; v += 1.1) mk(lo, hi, v, v + 0.55, WHITE, 0.014);
      const sl = end + dir * 5.2;
      // Stop line across the incoming (left) half.
      if (dir === 1) mk(Math.min(sl, sl + 0.4), Math.max(sl, sl + 0.4), axis === 'x' ? 0.15 : -4.4, axis === 'x' ? 4.4 : -0.15, WHITE);
      else mk(Math.min(sl, sl - 0.4), Math.max(sl, sl - 0.4), axis === 'x' ? -4.4 : 0.15, axis === 'x' ? -0.15 : 4.4, WHITE);
    }
    // Yellow no-parking hatch near junctions.
    for (const end of [a0 + 6.5, a1 - 9.5]) {
      mk(end, end + 3, 4.6, 6.2, YELLOW);
      mk(end, end + 3, -6.2, -4.6, YELLOW);
    }
    // Manholes and patched asphalt.
    for (let k = 0; k < 2; k++) {
      const u = rng.range(a0 + 15, a1 - 15), v = rng.range(-3.5, 3.5);
      b.paint(hex('#2a2a2c'), MAT.METAL);
      if (axis === 'x') b.cylinder(u, 0, c + v, 0.45, 0.45, 0.02, 12);
      else b.cylinder(c + v, 0, u, 0.45, 0.45, 0.02, 12);
    }
    const pu = rng.range(a0 + 10, a1 - 20), pv = rng.range(-4, 2);
    b.paint(hex('#303237'), MAT.ASPHALT);
    if (axis === 'x') b.plane(pu, c + pv, pu + rng.range(3, 8), c + pv + rng.range(1, 2.5), 0.006);
    else b.plane(c + pv, pu, c + pv + rng.range(1, 2.5), pu + rng.range(3, 8), 0.006);
  }
}

/** Raised sidewalk ring with kerb stones around block (i, j). */
export function buildSidewalks(b, i, j) {
  const x0 = i * PITCH + ROAD_HALF, x1 = (i + 1) * PITCH - ROAD_HALF;
  const z0 = j * PITCH + ROAD_HALF, z1 = (j + 1) * PITCH - ROAD_HALF;
  const S = SIDEWALK;
  b.paint(SIDEWALK_COL, MAT.CONCRETE);
  b.box((x0 + x1) / 2, CURB / 2, z0 + S / 2, x1 - x0, CURB, S);
  b.box((x0 + x1) / 2, CURB / 2, z1 - S / 2, x1 - x0, CURB, S);
  b.box(x0 + S / 2, CURB / 2, (z0 + z1) / 2, S, CURB, z1 - z0 - 2 * S);
  b.box(x1 - S / 2, CURB / 2, (z0 + z1) / 2, S, CURB, z1 - z0 - 2 * S);
  b.paint(KERB, MAT.CONCRETE);
  b.box((x0 + x1) / 2, CURB / 2 + 0.005, z0 + 0.15, x1 - x0, CURB + 0.01, 0.3);
  b.box((x0 + x1) / 2, CURB / 2 + 0.005, z1 - 0.15, x1 - x0, CURB + 0.01, 0.3);
  b.box(x0 + 0.15, CURB / 2 + 0.005, (z0 + z1) / 2, 0.3, CURB + 0.01, z1 - z0);
  b.box(x1 - 0.15, CURB / 2 + 0.005, (z0 + z1) / 2, 0.3, CURB + 0.01, z1 - z0);
}

/** Ground of the lot inside the sidewalk ring. */
export function buildLotGround(b, x0, z0, x1, z1, district) {
  const col = {
    downtown: [hex('#a9a49a'), MAT.CONCRETE],
    midtown: [hex('#9d968a'), MAT.CONCRETE],
    residential: [hex('#4f9a3e'), MAT.GRASS],
    docks: [hex('#8c8a84'), MAT.CONCRETE],
    beach: [hex('#5aa04a'), MAT.GRASS],
    park: [hex('#4c9a3c'), MAT.GRASS],
  }[district] ?? [hex('#9d968a'), MAT.CONCRETE];
  b.paint(col[0], col[1]);
  b.box((x0 + x1) / 2, CURB / 2, (z0 + z1) / 2, x1 - x0, CURB, z1 - z0);
}

/** The edges of the island: sea walls, promenade, beach with boardwalk, piers and the sea itself. */
export function buildCoast(b, rng) {
  const E = CITY;
  // Promenade strips beyond the outer roads (west, north, east) with a sea wall.
  b.paint(hex('#b5ad9d'), MAT.CONCRETE);
  b.box(-18.25, CURB / 2, E / 2, 23.5, CURB, E + 60);
  b.box(E / 2, CURB / 2, -18.25, E + 13, CURB, 23.5);
  b.box(E + 18.25, CURB / 2, (E + ROAD_HALF - 30) / 2, 23.5, CURB, E + ROAD_HALF + 30);
  b.box(E / 2, CURB / 2, E + ROAD_HALF + SIDEWALK / 2, E + 60, CURB, SIDEWALK); // coast-road sidewalk
  b.paint(hex('#d8d4cc'), MAT.CONCRETE).box(E / 2, CURB / 2 + 0.005, E + ROAD_HALF + 0.15, E + 13, CURB + 0.01, 0.3);
  b.paint(hex('#b5ad9d'), MAT.CONCRETE);
  b.paint(hex('#5f9f4a'), MAT.GRASS);
  b.box(-18, CURB + 0.02, E / 2, 10, 0.05, E);
  b.box(E / 2, CURB + 0.02, -18, E, 0.05, 10);
  // Sea walls.
  b.paint(hex('#8a8478'), MAT.CONCRETE);
  b.box(-30.5, -2.5, E / 2, 1, 5.4, E + 64);
  b.box(E / 2, -2.5, -30.5, E + 64, 5.4, 1);
  b.box(E + 30.5, -2.5, E / 2 - 20, 1, 5.4, E + 20);
  // Railings along the walls are props; quay edge for the docks.
  b.paint(YELLOW, MAT.PLAIN).box(E + 29.6, CURB + 0.01, E / 2 - 20, 0.4, 0.02, E + 20);
  // Beach: sand sloping from the coast road down under the sea.
  const z0 = E + ROAD_HALF + SIDEWALK;
  b.paint(hex('#e3cf9f'), MAT.SAND);
  const steps = 8;
  for (let k = 0; k < steps; k++) {
    const za = z0 + ((BEACH_END - z0) * k) / steps, zb = z0 + ((BEACH_END - z0) * (k + 1)) / steps;
    const ya = 0.12 - Math.pow(k / steps, 1.4) * 3.4, yb = 0.12 - Math.pow((k + 1) / steps, 1.4) * 3.4;
    b.quad([-30, ya, za], [-30, yb, zb], [E + 30, yb, zb], [E + 30, ya, za]);
  }
  b.paint(hex('#d8c592'), MAT.SAND).box(E / 2, -1.7, BEACH_END + 20, E + 60, 0.2, 40);
  // Boardwalk.
  b.paint(hex('#9a6a3e'), MAT.WOOD);
  b.box(E / 2, 0.35, z0 + 3.5, E + 40, 0.12, 4.5);
  for (let x = -18; x < E + 20; x += 6) b.box(x, 0.12, z0 + 1.4, 0.25, 0.5, 0.25).box(x, 0.12, z0 + 5.6, 0.25, 0.5, 0.25);
  // Ferry pier on pylons.
  b.paint(hex('#8a6038'), MAT.WOOD).box(450, 0.55, 1105, 16, 0.3, 92);
  b.paint(hex('#5a4028'), MAT.WOOD);
  for (let z = 1062; z <= 1150; z += 8) for (const x of [443, 457]) b.cylinder(x, -4, z, 0.3, 0.3, 4.7, 6);
  // East pier (Viktor's escape boat).
  b.paint(hex('#8a8478'), MAT.CONCRETE).box(1090, 0.0, 690, 120, 0.6, 28);
  b.paint(YELLOW, MAT.PLAIN).box(1090, 0.31, 677, 120, 0.02, 0.3).box(1090, 0.31, 703, 120, 0.02, 0.3);
  b.paint(hex('#6a655c'), MAT.CONCRETE);
  for (let x = 1036; x <= 1146; x += 10) for (const z of [678, 702]) b.cylinder(x, -4, z, 0.6, 0.6, 3.8, 8);
  // The sea (the water shader takes over in the transparent pass; this is the deep floor tint).
  b.paint(hex('#0b2a3a'), MAT.PLAIN).plane(-1500, -1500, 2600, 2700, -6);
  void rng;
  void SEA_LEVEL;
}
