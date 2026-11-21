// Low-poly vehicles with readable silhouettes. Each model is one rigged mesh: bone 0 body (roll/pitch),
// 1-4 wheels (FL, FR, RL, RR: spin + steer), 5-6 front doors (hinged), 7-8 rotors (helicopter). Car
// bodies are lofted from a side profile with real wheel-arch cut-outs and chamfered edges; on top come
// the greenhouse (pillars, raked glass, interior), light housings with lenses, grille, wraparound
// bumpers, mirrors on arms, door shut lines, dark wheel wells and per-model extras: the Vesper GT's
// wedge and ducktail, the taxi sign, the angkot livery, and the police lightbar and POLISI SELARA livery.

import { MeshBuilder, MAT } from '../engine/mesh-builder.js';
import { createMesh } from '../engine/gl.js';
import { hex } from '../core/math.js';
import { VEHICLES, VB } from './vehicle-specs.js';

export { VEHICLES, VB };

/** 5x7 pixel glyphs for livery lettering. */
const GLYPHS = {
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
};

/**
 * Raised pixel lettering centred at (x, y, z) on a plane facing along `axis` ('x' or 'z'); `dir` is the
 * reading direction along the plane's horizontal axis (+1 or -1), `px` the pixel size in metres.
 */
function letters(b, text, x, y, z, axis, dir, px) {
  const width = text.length * 6 - 1;
  for (let c = 0; c < text.length; c++) {
    const g = GLYPHS[text[c]];
    if (!g) continue;
    for (let row = 0; row < 7; row++) {
      for (let col = 0; col < 5; col++) {
        if (g[row][col] !== '1') continue;
        const u = (c * 6 + col - width / 2 + 0.5) * px * dir, v = (3 - row) * px;
        if (axis === 'x') b.box(x, y + v, z + u, 0.012, px * 0.92, px * 0.92);
        else b.box(x + u, y + v, z, px * 0.92, px * 0.92, 0.012);
      }
    }
  }
}

/**
 * Motor Bebek: the step-through scooter that fills Selara Bay's streets. Body bone carries the frame,
 * leg shield, seat, handlebars and lamps; bones FL and RL are the two wheels.
 */
function buildScooter(gl, d) {
  const b = new MeshBuilder();
  const trim = hex('#1a1b1e');
  b.setBone(VB.BODY);
  b.paint([1, 1, 1], MAT.PAINT);
  b.bevelBox(0, 0.62, -0.38, 0.36, 0.34, 0.82, 0.12, { taperX: 0.85 }); // rear body under the seat
  b.bevelBox(0, 0.72, 0.46, 0.34, 0.62, 0.16, 0.06, { taperZ: 0.7 }); // leg shield
  b.bevelBox(0, 0.42, 0.14, 0.22, 0.08, 0.6, 0.03); // floorboard
  b.bevelBox(0, 0.47, 0.66, 0.16, 0.16, 0.3, 0.05); // front mudguard
  b.paint(hex('#151515'), MAT.CLOTH).bevelBox(0, 0.84, -0.36, 0.28, 0.08, 0.66, 0.04); // seat
  b.paint(trim, MAT.METAL);
  b.limb(0, 0.5, 0.62, 0, 1.06, 0.5, 0.03, 0.03, 6); // steering column
  b.limb(-0.32, 1.06, 0.48, 0.32, 1.06, 0.48, 0.016, 0.016, 6); // handlebar
  b.paint([1, 1, 1], MAT.PAINT).bevelBox(0, 1.06, 0.53, 0.26, 0.12, 0.12, 0.04); // headset
  b.paint([1.0, 0.97, 0.88], MAT.HEADLIGHT, 1.0).bevelBox(0, 1.04, 0.6, 0.12, 0.07, 0.03, 0.015);
  b.paint([0.85, 0.08, 0.06], MAT.TAILLIGHT, 1.0).bevelBox(0, 0.74, -0.82, 0.16, 0.06, 0.04, 0.015);
  b.paint(hex('#2a2a2e'), MAT.METAL).bevelBox(0.12, 0.38, -0.42, 0.08, 0.1, 0.5, 0.03); // engine and exhaust
  b.limb(0.15, 0.35, -0.3, 0.17, 0.42, -0.78, 0.03, 0.03, 6);
  for (const bone of [VB.FL, VB.RL]) {
    b.setBone(bone);
    b.wheel(0, 0, 0, d.wheel, 0.1, [0.05, 0.05, 0.055], [0.7, 0.72, 0.75], 5);
  }
  const data = b.build();
  data.bounds = { min: [-0.5, 0, -1], max: [0.5, 1.3, 1], center: [0, 0.6, 0], radius: 1.2 };
  return createMesh(gl, data);
}

/** Wheel-arch points (front to rear) over an axle at z: a semicircle that dips just below the hub. */
function arch(z, wheel, R, steps = 9) {
  const pts = [];
  for (let k = 0; k <= steps; k++) {
    const a = -0.3 + (k / steps) * (Math.PI + 0.6);
    pts.push([z + Math.cos(a) * R, wheel + Math.sin(a) * R]);
  }
  return pts;
}

/** The lower body of a car: profile loft with arch cut-outs. Returns key heights for the details. */
function carBody(b, d) {
  const L = d.len, W = d.wid, H = d.h, hw = W / 2;
  const zf = L / 2, zr = -L / 2, cf = d.cabin[0], cb = d.cabin[1];
  const yB = d.wheel * 0.9 + H; // beltline
  const R = d.wheel + (d.sport ? 0.05 : 0.075);
  const sill = d.wheel - R * Math.sin(0.3);
  let top;
  if (d.sport) {
    // Wedge: knife-edge nose, long falling hood, raised rear haunches and a ducktail.
    top = [[zf + 0.03, sill + 0.3, hw * 0.88], [zf - 0.08, sill + 0.42, hw * 0.92], [zf - 0.5, yB - 0.08, hw * 0.95], [cf + 0.2, yB - 0.03, hw * 0.98],
      [cf, yB - 0.03, hw], [cb + 0.3, yB + 0.02, hw], [zr + 0.45, yB + 0.05, hw], [zr + 0.04, yB + 0.09, hw * 0.95], [zr - 0.02, yB - 0.1, hw * 0.93]];
  } else if (d.van) {
    top = [[zf + 0.01, sill + 0.28, hw * 0.93], [zf + 0.02, yB - 0.18, hw * 0.93], [zf - 0.15, yB - 0.04, hw * 0.95], [cf, yB, hw],
      [cb, yB, hw], [zr + 0.05, yB - 0.03, hw * 0.97], [zr, yB - 0.15, hw * 0.95]];
  } else {
    top = [[zf + 0.01, sill + 0.25, hw * 0.92], [zf + 0.01, yB - 0.17, hw * 0.92], [zf - 0.22, yB - 0.05, hw * 0.95], [cf, yB, hw],
      [cb, yB, hw], [zr + 0.25, yB - 0.03, hw * 0.96], [zr - 0.005, yB - 0.13, hw * 0.94]];
  }
  const low = (z, y) => [z, y, hw * 0.96];
  const bottom = [low(zf - 0.12, sill + 0.03)];
  for (const [z, y] of arch(d.axle[0], d.wheel, R)) bottom.push([z, y, hw * 0.97]);
  for (const [z, y] of arch(d.axle[1], d.wheel, R)) bottom.push([z, y, hw * 0.97]);
  bottom.push(low(zr + 0.12, sill + 0.03), low(zr, sill + 0.2));
  bottom.unshift(low(zf, sill + 0.2));
  b.paint([1, 1, 1], MAT.PAINT).loft(top, bottom, 0.045);
  // Dark wheel wells behind the arches so nothing shows through.
  b.paint(hex('#0b0b0c'), MAT.PLAIN);
  for (const z of d.axle) {
    const a = arch(z, d.wheel, R - 0.01, 9);
    for (let k = 0; k < a.length - 1; k++) {
      const [z0, y0] = a[k], [z1, y1] = a[k + 1];
      const ny = d.wheel - (y0 + y1) / 2, nz = z - (z0 + z1) / 2;
      b.quad([-hw * 0.86, y0, z0], [hw * 0.86, y0, z0], [hw * 0.86, y1, z1], [-hw * 0.86, y1, z1], [0, ny, nz]);
    }
  }
  return { L, W, H, hw, zf, zr, cf, cb, yB, sill, R };
}

/** Build the rigged mesh for a vehicle type. */
export function buildVehicle(gl, type) {
  const d = VEHICLES[type];
  if (d.scooter) return buildScooter(gl, d);
  if (d.truck) return buildTruck(gl, d);
  const b = new MeshBuilder();
  const glass = hex('#1b2a36');
  const trim = hex('#1a1b1e');
  const chrome = [0.78, 0.8, 0.82];
  b.setBone(VB.BODY);
  const { W, H, hw, zf, zr, cf, cb, yB, sill } = carBody(b, d);
  const y0 = yB;
  // ---------------------------------------------------------------- greenhouse: roof, pillars, glass, interior
  const roofY = d.roof;
  const lean = d.sport ? 0.55 : d.van ? 0.25 : 0.42;
  const roofF = d.sport ? cf - 0.6 : cf - (roofY - y0) * lean * 1.4;
  const roofB = d.sport ? cb + 0.95 : cb + (roofY - y0) * lean * (d.van ? 0.2 : 0.9);
  const rw = W * (d.van ? 0.92 : d.sport ? 0.74 : 0.8);
  b.paint([1, 1, 1], MAT.PAINT).bevelBox(0, roofY, (roofF + roofB) / 2, rw, 0.08, roofF - roofB, 0.04);
  for (const s of [-1, 1]) {
    b.limb(s * W * 0.45, y0, cf, s * rw * 0.48, roofY, roofF, 0.05, 0.04, 6);
    b.limb(s * W * 0.45, y0, cb, s * rw * 0.48, roofY, roofB, d.sport ? 0.07 : 0.06, 0.05, 6);
    if (!d.sport) b.limb(s * W * 0.46, y0, (cf + cb) / 2 - 0.15, s * rw * 0.49, roofY, (roofF + roofB) / 2 - 0.15, 0.04, 0.035, 6);
  }
  b.paint(glass, MAT.GLASS);
  const wsLen = Math.hypot(roofY - y0, cf - roofF);
  b.push().transform(0, (y0 + roofY) / 2, (cf + roofF) / 2, 0, -Math.atan2(cf - roofF, roofY - y0), 0).box(0, 0, 0, W * 0.84, wsLen, 0.04).pop();
  const rwLen = Math.hypot(roofY - y0, roofB - cb);
  b.push().transform(0, (y0 + roofY) / 2, (cb + roofB) / 2, 0, Math.atan2(roofB - cb, roofY - y0), 0).box(0, 0, 0, W * 0.84, rwLen, 0.04).pop();
  if (d.sport) {
    for (const s of [-1, 1]) {
      const x0 = s * W * 0.45, x1 = s * rw * 0.49;
      const q = [[x0, y0, cb], [x0, y0, cf], [x1, roofY - 0.02, roofF], [x1, roofY - 0.02, roofB]];
      b.quad(q[0], q[1], q[2], q[3]);
      b.quad(q[3], q[2], q[1], q[0]);
    }
  }
  // Rear side glass (fixed); the front side windows are rolled down so the driver shows.
  for (const s of d.sport ? [] : [-1, 1]) {
    b.push().transform(s * W * 0.455, (y0 + roofY) / 2, (cb + (cf + cb) / 2 - 0.15) / 2, 0, 0, 0);
    b.box(0, 0, 0, 0.03, roofY - y0 - 0.06, Math.abs((cf + cb) / 2 - 0.15 - cb) - 0.1);
    b.pop();
  }
  b.paint(hex('#2a2626'), MAT.CLOTH);
  const backTop = Math.min(roofY - 0.25, y0 + 0.4);
  for (const s of [-1, 1]) {
    b.bevelBox(s * 0.38, y0 - 0.45, -0.15, 0.5, 0.14, 0.55, 0.05);
    b.bevelBox(s * 0.38, (y0 - 0.45 + backTop) / 2, -0.5, 0.5, backTop - y0 + 0.45, 0.14, 0.05);
  }
  const dash = d.sport ? -0.45 : 0;
  b.paint(hex('#1e1e22'), MAT.PLAIN).bevelBox(0, y0 + 0.28 + dash * 0.5, cf - 0.18 + dash * 1.2, W * 0.86, 0.3, 0.45, 0.06);
  // Right-hand drive (traffic keeps left): the wheel sits on the car's right, body -X.
  b.paint(hex('#111'), MAT.PLAIN).push().transform(-0.38, y0 + 0.4 + dash * 0.3, cf - 0.5 + dash, 0, -1.0, 0).cylinder(0, 0, 0, 0.19, 0.19, 0.03, 12, { bottom: true }).pop();
  // ---------------------------------------------------------------- front
  const housing = hex('#121316');
  if (d.sport) {
    // Slim lights set into the falling nose, a wide low intake and a small upper slot.
    for (const s of [-1, 1]) {
      b.push().transform(s * hw * 0.62, sill + 0.4, zf - 0.13, 0, -0.95, 0);
      b.paint(housing, MAT.PLAIN).bevelBox(0, 0, 0, 0.46, 0.05, 0.24, 0.02);
      b.paint([1.0, 0.97, 0.88], MAT.HEADLIGHT, 1.0).bevelBox(0, 0.02, 0.01, 0.4, 0.03, 0.17, 0.012);
      b.pop();
    }
    b.paint(hex('#0a0a0b'), MAT.PLAIN).bevelBox(0, sill + 0.13, zf - 0.08, W * 0.66, 0.12, 0.12, 0.03);
    b.paint(hex('#202124'), MAT.METAL);
    for (let k = -3; k <= 3; k++) b.box(k * W * 0.09, sill + 0.13, zf - 0.03, 0.02, 0.1, 0.02);
    b.paint(hex('#0a0a0b'), MAT.PLAIN).box(0, sill + 0.03, zf - 0.1, W * 0.8, 0.03, 0.2); // splitter
  } else {
    const ly = yB - 0.16;
    for (const s of [-1, 1]) {
      b.paint(housing, MAT.PLAIN).bevelBox(s * hw * 0.64, ly, zf - 0.005, 0.46, 0.19, 0.08, 0.03);
      b.paint([1.0, 0.97, 0.88], MAT.HEADLIGHT, 1.0).bevelBox(s * hw * 0.64, ly + 0.005, zf + 0.02, 0.4, 0.13, 0.04, 0.02);
      b.paint(chrome, MAT.METAL).cylinder(s * hw * 0.52, ly - 0.05, zf + 0.04, 0.035, 0.035, 0.004, 8);
      b.paint([0.95, 0.55, 0.1], MAT.TAILLIGHT, 0.35).box(s * hw * 0.9, ly, zf - 0.03, 0.06, 0.08, 0.1); // indicator
    }
    // Grille: recessed, with two horizontal bars.
    b.paint(hex('#0b0c0e'), MAT.PLAIN).bevelBox(0, ly, zf - 0.01, W * 0.4, 0.17, 0.06, 0.02);
    b.paint(chrome, MAT.METAL).box(0, ly + 0.035, zf + 0.025, W * 0.38, 0.025, 0.02).box(0, ly - 0.035, zf + 0.025, W * 0.38, 0.025, 0.02);
    // Wraparound bumper with a dark lower lip and a plate.
    b.paint([1, 1, 1], MAT.PAINT).bevelBox(0, sill + 0.16, zf - 0.04, W * 0.96, 0.2, 0.2, 0.08, { taperX: 0.98 });
    b.paint(trim, MAT.PLAIN).bevelBox(0, sill + 0.04, zf - 0.06, W * 0.9, 0.08, 0.18, 0.03);
    b.paint([0.95, 0.95, 0.92], MAT.PLAIN).box(0, sill + 0.16, zf + 0.065, 0.46, 0.11, 0.01);
  }
  // ---------------------------------------------------------------- rear
  if (d.sport) {
    b.paint(housing, MAT.PLAIN).bevelBox(0, yB - 0.02, zr - 0.005, W * 0.86, 0.09, 0.06, 0.02);
    b.paint([0.85, 0.08, 0.06], MAT.TAILLIGHT, 1.0).box(0, yB - 0.02, zr - 0.035, W * 0.82, 0.04, 0.02);
    b.paint(hex('#0a0a0b'), MAT.PLAIN).bevelBox(0, sill + 0.1, zr + 0.06, W * 0.7, 0.14, 0.16, 0.03); // diffuser
    b.paint(chrome, MAT.METAL);
    for (const x of [-0.42, -0.3, 0.3, 0.42]) b.push().transform(x, sill + 0.1, zr - 0.02, 0, Math.PI / 2, 0).cylinder(0, 0, 0, 0.045, 0.045, 0.1, 8, { top: true }).pop();
  } else {
    const ty = yB - 0.12;
    for (const s of [-1, 1]) {
      b.paint(housing, MAT.PLAIN).bevelBox(s * hw * 0.68, ty, zr + 0.005, 0.44, 0.17, 0.06, 0.03);
      b.paint([0.85, 0.08, 0.06], MAT.TAILLIGHT, 1.0).bevelBox(s * hw * 0.7, ty + 0.01, zr - 0.02, 0.3, 0.12, 0.03, 0.015);
      b.paint([0.95, 0.95, 0.92], MAT.PLAIN).box(s * hw * 0.5, ty, zr - 0.02, 0.08, 0.1, 0.02); // reversing light
    }
    b.paint([1, 1, 1], MAT.PAINT).bevelBox(0, sill + 0.16, zr + 0.04, W * 0.96, 0.2, 0.2, 0.08, { taperX: 0.98 });
    b.paint(trim, MAT.PLAIN).bevelBox(0, sill + 0.04, zr + 0.06, W * 0.9, 0.08, 0.18, 0.03);
    b.paint([0.95, 0.95, 0.92], MAT.PLAIN).box(0, ty - 0.02, zr - 0.02, 0.46, 0.11, 0.01);
    b.paint(chrome, MAT.METAL).push().transform(-hw * 0.6, sill + 0.06, zr - 0.02, 0, Math.PI / 2, 0).cylinder(0, 0, 0, 0.035, 0.035, 0.12, 8, { top: true }).pop();
  }
  // ---------------------------------------------------------------- sides
  for (const s of [-1, 1]) {
    const x = s * (hw + 0.004);
    b.paint(hex('#0c0c0e'), MAT.PLAIN);
    b.box(x, (sill + yB) / 2 + 0.05, cf - 0.05, 0.01, yB - sill - 0.2, 0.02); // front shut line
    b.box(x, (sill + yB) / 2 + 0.05, (cf + cb) / 2 - 0.15, 0.01, yB - sill - 0.2, 0.02);
    if (!d.sport) b.box(x, (sill + yB) / 2 + 0.05, cb + 0.1, 0.01, yB - sill - 0.2, 0.02);
    b.paint(chrome, MAT.METAL).box(x + s * 0.01, yB - 0.12, (cf + cb) / 2 - 0.35, 0.02, 0.03, 0.16); // rear door handle
    b.paint(trim, MAT.PLAIN).box(s * (hw * 0.96 + 0.01), sill + 0.05, (d.axle[0] + d.axle[1]) / 2, 0.04, 0.08, d.axle[0] - d.axle[1] - 2 * (d.wheel + 0.1)); // rocker
    // Mirror on an arm.
    b.paint(trim, MAT.PLAIN).limb(s * hw * 0.95, yB + 0.03, cf - 0.1, s * (hw + 0.12), yB + 0.1, cf - 0.13, 0.02, 0.02, 5);
    b.paint([1, 1, 1], MAT.PAINT).bevelBox(s * (hw + 0.15), yB + 0.12, cf - 0.14, 0.15, 0.1, 0.1, 0.035);
    b.paint(hex('#3a4650'), MAT.GLASS).box(s * (hw + 0.15), yB + 0.12, cf - 0.205, 0.12, 0.075, 0.01);
    if (d.sport) {
      // Side intake ahead of the rear wheel.
      b.paint(hex('#0a0a0b'), MAT.PLAIN).box(s * (hw + 0.005), (sill + yB) / 2 + 0.04, d.axle[1] + d.wheel + 0.35, 0.02, 0.16, 0.42);
    }
  }
  // ---------------------------------------------------------------- extras
  if (d.sport) {
    b.paint(hex('#111'), MAT.PLAIN);
    for (const s of [-1, 1]) b.box(s * 0.22, yB - 0.055, zf - 0.85, 0.12, 0.02, 0.42); // hood vents
  }
  if (d.taxi) {
    b.paint([1.0, 0.85, 0.2], MAT.NEON, 0.8).bevelBox(0, d.roof + 0.16, -0.1, 0.62, 0.2, 0.28, 0.06);
    b.paint(hex('#111'), MAT.PLAIN).box(0, d.roof + 0.16, 0.045, 0.5, 0.06, 0.005).box(0, d.roof + 0.16, -0.245, 0.5, 0.06, 0.005);
    b.paint(hex('#111'), MAT.PLAIN);
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) b.box(s * (hw + 0.006), yB - 0.2, -1.2 + k * 0.4, 0.01, 0.1, 0.2);
  }
  if (d.police) {
    // Livery: navy lower body with a gold pinstripe, POLISI SELARA lettering, navy hood.
    const navy = hex('#16244a');
    for (const s of [-1, 1]) {
      const x = s * (hw + 0.012);
      // Navy band and gold pinstripe between the wheel arches (the doors carry their own).
      const a0 = d.axle[0] - d.wheel - 0.1, a1 = d.axle[1] + d.wheel + 0.1;
      b.paint(navy, MAT.PLAIN).box(x, sill + 0.24, (a0 + a1) / 2, 0.01, 0.2, a0 - a1);
      b.paint(hex('#e8b830'), MAT.PLAIN).box(x, sill + 0.36, (a0 + a1) / 2, 0.012, 0.035, a0 - a1);
      b.paint(navy, MAT.PLAIN);
      // Rear quarter: SELARA reads after POLISI on the doors from either side.
      letters(b, s > 0 ? 'SELARA' : 'POLISI', s * (hw + 0.02), yB - 0.1, (cb + (cf - 1.15)) / 2 - 0.04, 'x', -s, 0.024);
    }
    b.paint(navy, MAT.PLAIN).bevelBox(0, yB - 0.03, zf - 0.6, W * 0.84, 0.04, 1.0, 0.02);
    b.paint(navy, MAT.PLAIN);
    letters(b, 'POLISI', 0, yB - 0.3, zr - 0.03, 'z', -1, 0.022);
    // Lightbar: base, red and blue segmented lenses, clear takedown lights and chrome end caps.
    b.paint(trim, MAT.PLAIN).bevelBox(0, d.roof + 0.08, -0.05, 1.3, 0.07, 0.32, 0.03);
    for (let k = 0; k < 3; k++) {
      b.paint([1, 0.1, 0.1], MAT.SIREN_R, 1.0).bevelBox(-0.2 - k * 0.15, d.roof + 0.16, -0.05, 0.13, 0.1, 0.27, 0.03);
      b.paint([0.15, 0.3, 1], MAT.SIREN_B, 1.0).bevelBox(0.2 + k * 0.15, d.roof + 0.16, -0.05, 0.13, 0.1, 0.27, 0.03);
    }
    b.paint([0.95, 0.95, 0.9], MAT.LAMP, 0.6).bevelBox(0, d.roof + 0.16, -0.05, 0.22, 0.09, 0.26, 0.03);
    b.paint(chrome, MAT.METAL).bevelBox(-0.67, d.roof + 0.14, -0.05, 0.05, 0.12, 0.3, 0.02).bevelBox(0.67, d.roof + 0.14, -0.05, 0.05, 0.12, 0.3, 0.02);
    b.paint(trim, MAT.PLAIN).box(0, sill + 0.2, zf + 0.12, W * 0.7, 0.1, 0.08).box(0, sill + 0.42, zf + 0.12, W * 0.5, 0.06, 0.06); // push bar
    for (const s of [-1, 1]) b.box(s * W * 0.25, sill + 0.3, zf + 0.12, 0.06, 0.3, 0.06);
  }
  if (d.van) {
    b.paint(hex('#0c0c0e'), MAT.PLAIN);
    for (const s of [-1, 1]) b.box(s * (hw + 0.004), yB - 0.2, -0.9, 0.01, 0.02, 1.8); // sliding door track
    b.paint(glass, MAT.GLASS);
    for (const s of [-1, 1]) b.box(s * (W * 0.46 + 0.005), d.roof - 0.4, -1.1, 0.02, 0.45, 1.6);
  }
  if (d.angkot) {
    // Angkot livery: white waist stripes, a roof rack and a lit route board over the windscreen.
    b.paint([0.95, 0.95, 0.92], MAT.PLAIN);
    for (const s of [-1, 1]) b.box(s * (hw + 0.008), yB - 0.28, -0.2, 0.01, 0.12, d.len - 0.8);
    b.paint(hex('#3a3d44'), MAT.METAL);
    for (const z of [-1.4, -0.6, 0.2]) b.box(0, d.roof + 0.12, z, W * 0.86, 0.04, 0.05);
    for (const s of [-1, 1]) b.box(s * W * 0.43, d.roof + 0.14, -0.6, 0.04, 0.04, 1.8);
    b.paint([1.0, 0.85, 0.3], MAT.NEON, 0.7).bevelBox(0, d.roof - 0.1, d.cabin[0] + 0.02, W * 0.6, 0.16, 0.05, 0.02);
  }
  // ---------------------------------------------------------------- doors (hinged at the front edge)
  const doorLen = d.sport ? 1.25 : 1.05;
  for (const [bone, s] of [[VB.DOOR_L, 1], [VB.DOOR_R, -1]]) {
    b.setBone(bone);
    b.paint([1, 1, 1], MAT.PLAIN).bevelBox(0, 0, -doorLen / 2, 0.07, H * 0.85, doorLen, 0.03);
    b.paint(trim, MAT.PLAIN).box(0, H * 0.43, -doorLen / 2 + 0.05, 0.08, 0.05, doorLen - 0.1);
    b.paint(chrome, MAT.METAL).box(s * 0.04, H * 0.18, -doorLen + 0.25, 0.02, 0.03, 0.15);
    if (d.police) {
      const yRel = sill + 0.24 - (d.wheel * 0.9 + H / 2);
      b.paint(hex('#16244a'), MAT.PLAIN).box(s * 0.04, Math.max(yRel, -H * 0.42 + 0.1), -doorLen / 2, 0.01, 0.2, doorLen - 0.04);
      b.paint(hex('#e8b830'), MAT.PLAIN).box(s * 0.042, Math.max(yRel, -H * 0.42 + 0.1) + 0.12, -doorLen / 2, 0.012, 0.035, doorLen - 0.02);
      b.paint(hex('#16244a'), MAT.PLAIN);
      letters(b, s > 0 ? 'POLISI' : 'SELARA', s * 0.042, H * 0.12, -doorLen / 2, 'x', -s, 0.028);
    }
  }
  // ---------------------------------------------------------------- wheels
  const wheelW = d.sport ? 0.3 : 0.24;
  for (const bone of [VB.FL, VB.FR, VB.RL, VB.RR]) {
    b.setBone(bone);
    b.wheel(0, 0, 0, d.wheel, wheelW, [0.04, 0.04, 0.045], d.sport ? hex('#2a2a2e') : chrome, d.sport ? 10 : 6);
  }
  const data = b.build();
  data.bounds = { min: [-W, 0, -d.len], max: [W, 3, d.len], center: [0, 1, 0], radius: Math.hypot(d.len / 2, W / 2, 1.5) };
  return createMesh(gl, data);
}

/** Bison box truck: cab up front with a raked windscreen, ribbed cargo box behind, dual rear wheels. */
function buildTruck(gl, d) {
  const b = new MeshBuilder();
  const L = d.len, W = d.wid, H = d.h;
  const zf = L / 2, zr = -L / 2;
  const glass = hex('#1b2a36');
  const trim = hex('#1a1b1e');
  const chrome = [0.78, 0.8, 0.82];
  b.setBone(VB.BODY);
  const bodyY = d.wheel * 0.9 + H / 2;
  b.paint([1, 1, 1], MAT.PAINT).bevelBox(0, bodyY + 0.2, zf - 1.1, W, H + 0.6, 2.2, 0.16);
  b.paint([1, 1, 1], MAT.PAINT).bevelBox(0, bodyY + 0.9, zf - 1.35, W * 0.96, 1.1, 1.7, 0.18, { taperZ: 0.9, shiftZ: -0.1 });
  b.paint(glass, MAT.GLASS).push().transform(0, bodyY + 1.05, zf - 0.47, 0, -0.18, 0).box(0, 0, 0, W * 0.86, 0.85, 0.05).pop();
  for (const s of [-1, 1]) b.box(s * (W * 0.48 + 0.01), bodyY + 1.0, zf - 1.1, 0.02, 0.6, 0.8);
  b.paint(hex('#f2f0ea'), MAT.METAL).bevelBox(0, bodyY + 1.25, zf - 2.35 - 2.4, W + 0.08, 2.7, 4.8, 0.06);
  b.paint(hex('#c8c4b8'), MAT.METAL);
  for (let z = zf - 2.5; z > zr; z -= 0.6) b.box(0, bodyY + 1.25, z - 2.4 + 2.35 - 0.2, W + 0.12, 2.6, 0.05);
  b.paint(trim, MAT.METAL).box(0, d.wheel + 0.1, -0.3, W * 0.7, 0.25, L - 1.5);
  b.paint(trim, MAT.PLAIN).bevelBox(0, d.wheel * 0.75, zf - 0.08, W, 0.3, 0.22, 0.08);
  b.paint(hex('#0e0f11'), MAT.METAL).box(0, bodyY + 0.1, zf + 0.005, W * 0.6, 0.45, 0.04);
  b.paint(chrome, MAT.METAL);
  for (let k = 0; k < 4; k++) b.box(0, bodyY - 0.08 + k * 0.12, zf + 0.03, W * 0.58, 0.03, 0.02);
  for (const s of [-1, 1]) {
    b.paint(hex('#121316'), MAT.PLAIN).bevelBox(s * W * 0.38, bodyY - 0.05, zf - 0.005, 0.4, 0.22, 0.08, 0.03);
    b.paint([1.0, 0.97, 0.88], MAT.HEADLIGHT, 1.0).bevelBox(s * W * 0.38, bodyY - 0.05, zf + 0.02, 0.34, 0.16, 0.04, 0.02);
    b.paint([0.85, 0.08, 0.06], MAT.TAILLIGHT, 1.0).bevelBox(s * W * 0.42, d.wheel + 0.25, zr - 0.02, 0.24, 0.14, 0.04, 0.02);
    b.paint(trim, MAT.PLAIN).limb(s * W * 0.5, bodyY + 0.9, zf - 0.5, s * (W * 0.5 + 0.2), bodyY + 1.0, zf - 0.55, 0.025, 0.025, 5);
    b.bevelBox(s * (W * 0.5 + 0.24), bodyY + 0.9, zf - 0.56, 0.12, 0.42, 0.1, 0.03);
    // Mudflaps and arch shadows.
    b.box(s * W * 0.42, d.wheel * 0.6, d.axle[1] - d.wheel - 0.15, 0.4, 0.5, 0.02);
  }
  for (const bone of [VB.FL, VB.FR, VB.RL, VB.RR]) {
    b.setBone(bone);
    b.wheel(0, 0, 0, d.wheel, 0.4, [0.04, 0.04, 0.045], chrome, 8);
  }
  const data = b.build();
  data.bounds = { min: [-W, 0, -L], max: [W, 3.5, L], center: [0, 1.2, 0], radius: Math.hypot(L / 2, W / 2, 1.8) };
  return createMesh(gl, data);
}

/** Rajawali police helicopter: rounded cabin, tail boom, skids, main and tail rotors, spotlight. */
export function buildHelicopter(gl) {
  const b = new MeshBuilder();
  b.setBone(VB.BODY);
  b.paint(hex('#f2f2f2'), MAT.PAINT).bevelBox(0, 1.6, 0.4, 2.0, 1.9, 4.2, 0.8, { taperX: 0.85, taperZ: 0.8 });
  b.paint(hex('#16244a'), MAT.PAINT).bevelBox(0, 1.05, 0.4, 2.04, 0.5, 4.0, 0.2);
  b.paint(hex('#1b2a36'), MAT.GLASS).sphere(0, 1.9, 1.7, 0.95, 0.85, 1.0, 12, 8);
  b.paint(hex('#f2f2f2'), MAT.PAINT).cylinder(0, 1.7, -1.6, 0.45, 0.2, 0.01, 8);
  b.push().transform(0, 1.9, -1.4, 0, -Math.PI / 2 - 0.05, 0).cylinder(0, 0, 0, 0.42, 0.16, 5.2, 10).pop();
  b.paint(hex('#16244a'), MAT.PAINT).bevelBox(0, 2.5, -6.3, 0.1, 1.2, 0.8, 0.04).bevelBox(0, 1.9, -6.0, 1.4, 0.08, 0.5, 0.03);
  b.paint(hex('#2a2a2e'), MAT.METAL);
  for (const s of [-1, 1]) {
    b.box(s * 0.95, 0.15, 0.4, 0.08, 0.08, 3.6);
    b.limb(s * 0.95, 0.15, 1.2, s * 0.7, 0.8, 1.2, 0.04, 0.04, 6).limb(s * 0.95, 0.15, -0.4, s * 0.7, 0.8, -0.4, 0.04, 0.04, 6);
  }
  b.paint(hex('#2a2a2e'), MAT.METAL).cylinder(0, 2.5, 0.2, 0.25, 0.18, 0.5, 8);
  b.paint([1, 0.1, 0.1], MAT.SIREN_R, 1).sphere(0.5, 0.75, -0.6, 0.12).paint([0.1, 0.3, 1], MAT.SIREN_B, 1).sphere(-0.5, 0.75, -0.6, 0.12);
  b.paint([1, 1, 0.95], MAT.HEADLIGHT, 1.2).sphere(0, 0.62, 1.9, 0.18, 0.12, 0.18, 8, 5);
  b.setBone(VB.ROTOR);
  b.paint(hex('#222'), MAT.METAL).cylinder(0, 0, 0, 0.15, 0.15, 0.2, 8);
  for (let k = 0; k < 4; k++) b.push().transform(0, 0.15, 0, (k * Math.PI) / 2).box(0, 0, 3.6, 0.3, 0.04, 7.0).pop();
  b.setBone(VB.TAIL);
  b.paint(hex('#222'), MAT.METAL);
  for (let k = 0; k < 2; k++) b.push().transform(0, 0, 0, 0, 0, (k * Math.PI) / 2).box(0.0, 0, 0, 0.04, 1.3, 0.14).pop();
  const data = b.build();
  data.bounds = { min: [-4, 0, -7], max: [4, 3, 4], center: [0, 1.5, -1], radius: 7.5 };
  return createMesh(gl, data);
}
