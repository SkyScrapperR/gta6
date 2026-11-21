// Beveled low-poly vehicles. Each model is one rigged mesh: bone 0 body (roll/pitch), 1-4 wheels
// (FL, FR, RL, RR: spin + steer), 5-6 front doors (hinged), 7-8 rotors (helicopter). Bodies have a
// tapered hood/cabin/trunk profile, wheel arches, grille, mirrors, door seams, spoked rims, tinted
// glass, emissive head/tail/brake lights and clearcoat paint driven per draw (uPaint).

import { MeshBuilder, MAT } from '../engine/mesh-builder.js';
import { createMesh } from '../engine/gl.js';
import { hex } from '../core/math.js';

export const VB = { BODY: 0, FL: 1, FR: 2, RL: 3, RR: 4, DOOR_L: 5, DOOR_R: 6, ROTOR: 7, TAIL: 8 };

/**
 * Vehicle definitions. len/wid in metres; wheel z positions; cabin z range (front, back); mass in kg;
 * handling: accel, top speed (m/s), grip, steer.
 */
export const VEHICLES = {
  kancil: { name: 'Kancil', len: 3.7, wid: 1.66, h: 0.62, cabin: [0.55, -1.25], roof: 1.55, wheel: 0.3, axle: [1.2, -1.2], mass: 950, accel: 7.5, top: 36, grip: 7.5, steer: 0.62, colors: ['#e8d24a', '#e05a3a', '#4aa0e0', '#f2f2f2', '#9ae06a'] },
  merpati: { name: 'Merpati', len: 4.55, wid: 1.82, h: 0.64, cabin: [0.75, -1.15], roof: 1.52, wheel: 0.33, axle: [1.45, -1.45], mass: 1350, accel: 8.5, top: 45, grip: 8, steer: 0.56, colors: ['#3a5a8a', '#c03a3a', '#2a2a2e', '#d8d8d8', '#6a6a72', '#2a6a4a', '#8a6a3a'] },
  taxi: { name: 'Selara Taxi', len: 4.55, wid: 1.82, h: 0.64, cabin: [0.75, -1.15], roof: 1.52, wheel: 0.33, axle: [1.45, -1.45], mass: 1350, accel: 8.5, top: 44, grip: 8, steer: 0.56, colors: ['#18b8ae'], taxi: true },
  vesper: { name: 'Vesper GT', len: 4.6, wid: 1.98, h: 0.44, cabin: [0.3, -1.55], roof: 1.2, wheel: 0.34, axle: [1.45, -1.45], mass: 1250, accel: 13.5, top: 62, grip: 9.5, steer: 0.5, colors: ['#f2c41a', '#d02a2a', '#1a1a1e', '#e8e8e8'], sport: true },
  bajak: { name: 'Bajak', len: 4.9, wid: 1.96, h: 0.8, cabin: [1.35, -2.35], roof: 2.1, wheel: 0.36, axle: [1.65, -1.6], mass: 2100, accel: 6.5, top: 36, grip: 6.5, steer: 0.52, colors: ['#e8e8e8', '#3a6aa8', '#c0a060', '#5a8a5a'], van: true },
  bison: { name: 'Bison', len: 7.2, wid: 2.4, h: 1.0, cabin: [3.0, 1.6], roof: 2.85, wheel: 0.48, axle: [2.55, -2.3], mass: 6500, accel: 4.6, top: 30, grip: 6, steer: 0.46, colors: ['#c03a2a', '#3a3a6a', '#4a4a4a'], truck: true, size: 1.4 },
  patrol: { name: 'Garuda Patrol', len: 4.7, wid: 1.86, h: 0.64, cabin: [0.75, -1.15], roof: 1.53, wheel: 0.34, axle: [1.5, -1.5], mass: 1500, accel: 11, top: 54, grip: 9, steer: 0.55, colors: ['#f2f2f2'], police: true },
};

function lights(b, d, front, sideX) {
  // Headlights.
  b.paint([1.0, 0.97, 0.88], MAT.HEADLIGHT, 1.0);
  for (const s of [-1, 1]) b.bevelBox(s * sideX, d.h + 0.1, front + 0.01, 0.36, 0.13, 0.08, 0.03);
}

/** Build the rigged mesh for a vehicle type. */
export function buildVehicle(gl, type) {
  const d = VEHICLES[type];
  const b = new MeshBuilder();
  const L = d.len, W = d.wid, H = d.h;
  const zf = L / 2, zr = -L / 2;
  const glass = hex('#1b2a36');
  const trim = hex('#1a1b1e');
  const chrome = [0.78, 0.8, 0.82];
  const paintMat = MAT.PAINT;
  b.setBone(VB.BODY);
  // ---------------------------------------------------------------- lower body
  const bodyY = d.wheel * 0.9 + H / 2;
  if (d.truck) {
    // Cab up front, cargo box behind.
    b.paint([1, 1, 1], paintMat).bevelBox(0, bodyY + 0.2, zf - 1.1, W, H + 0.6, 2.2, 0.16);
    b.paint([1, 1, 1], paintMat).bevelBox(0, bodyY + 0.9, zf - 1.35, W * 0.96, 1.1, 1.7, 0.18, { taperZ: 0.9, shiftZ: -0.1 });
    b.paint(glass, MAT.GLASS).push().transform(0, bodyY + 1.05, zf - 0.47, 0, -0.18, 0).box(0, 0, 0, W * 0.86, 0.85, 0.05).pop();
    b.paint(hex('#f2f0ea'), MAT.METAL).bevelBox(0, bodyY + 1.25, zf - 2.35 - 2.4, W + 0.08, 2.7, 4.8, 0.06);
    b.paint(hex('#c8c4b8'), MAT.METAL);
    for (let z = zf - 2.5; z > zr; z -= 0.6) b.box(0, bodyY + 1.25, z - 2.4 + 2.35 - 0.2, W + 0.12, 2.6, 0.05);
    b.paint(trim, MAT.METAL).box(0, d.wheel + 0.1, -0.3, W * 0.7, 0.25, L - 1.5);
  } else {
    b.paint([1, 1, 1], paintMat);
    b.bevelBox(0, bodyY, 0, W, H, L, 0.16, { taperX: 0.96 });
    // Hood and trunk slopes.
    b.bevelBox(0, bodyY + H / 2, d.cabin[0] + (zf - d.cabin[0]) / 2 - 0.05, W * 0.94, 0.1, zf - d.cabin[0] - 0.1, 0.05);
    if (!d.van) b.bevelBox(0, bodyY + H / 2, zr + (d.cabin[1] - zr) / 2 + 0.05, W * 0.94, 0.1, d.cabin[1] - zr - 0.1, 0.05);
  }
  // ---------------------------------------------------------------- cabin: roof, pillars, windscreens, interior
  if (!d.truck) {
    const cf = d.cabin[0], cb = d.cabin[1];
    const y0 = bodyY + H / 2;
    const roofY = d.roof;
    const lean = d.sport ? 0.55 : d.van ? 0.25 : 0.42;
    // Sports coupe: steeply raked windscreen, short roof, long shallow fastback.
    const roofF = d.sport ? cf - 0.6 : cf - (roofY - y0) * lean * 1.4;
    const roofB = d.sport ? cb + 0.95 : cb + (roofY - y0) * lean * (d.van ? 0.2 : 0.9);
    const rw = W * (d.van ? 0.94 : 0.82);
    b.paint([1, 1, 1], paintMat).bevelBox(0, roofY, (roofF + roofB) / 2, rw, 0.08, roofF - roofB, 0.04);
    // Pillars.
    for (const s of [-1, 1]) {
      b.limb(s * W * 0.44, y0, cf, s * rw * 0.48, roofY, roofF, 0.045, 0.04, 6);
      b.limb(s * W * 0.44, y0, cb, s * rw * 0.48, roofY, roofB, 0.06, 0.05, 6);
      if (!d.sport) b.limb(s * W * 0.45, y0, (cf + cb) / 2 - 0.15, s * rw * 0.49, roofY, (roofF + roofB) / 2 - 0.15, 0.035, 0.035, 6);
    }
    // Windscreen and rear window (tinted glass).
    b.paint(glass, MAT.GLASS);
    const wsLen = Math.hypot(roofY - y0, cf - roofF);
    b.push().transform(0, (y0 + roofY) / 2, (cf + roofF) / 2, 0, -Math.atan2(cf - roofF, roofY - y0), 0).box(0, 0, 0, W * 0.84, wsLen, 0.04).pop();
    const rwLen = Math.hypot(roofY - y0, roofB - cb);
    b.push().transform(0, (y0 + roofY) / 2, (cb + roofB) / 2, 0, Math.atan2(roofB - cb, roofY - y0), 0).box(0, 0, 0, W * 0.84, rwLen, 0.04).pop();
    // Coupe side glass: one tinted trapezoid per side following the roofline.
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
      b.push().transform(s * W * 0.45, (y0 + roofY) / 2, (cb + (cf + cb) / 2 - 0.15) / 2, 0, 0, 0);
      b.box(0, 0, 0, 0.03, roofY - y0 - 0.06, Math.abs((cf + cb) / 2 - 0.15 - cb) - 0.1);
      b.pop();
    }
    // Interior: seats, dashboard, steering wheel.
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
  }
  // ---------------------------------------------------------------- front, rear, trim
  b.paint(trim, MAT.PLAIN);
  b.bevelBox(0, d.wheel * 0.75, zf - 0.08, W * 1.0, 0.28, 0.2, 0.08); // front bumper
  b.bevelBox(0, d.wheel * 0.75, zr + 0.08, W * 1.0, 0.28, 0.2, 0.08); // rear bumper
  b.paint(hex('#0e0f11'), MAT.METAL).box(0, bodyY + 0.02, zf + 0.005, W * 0.5, 0.2, 0.04); // grille
  b.paint(chrome, MAT.METAL);
  for (let k = -2; k <= 2; k++) b.box(k * W * 0.09, bodyY + 0.02, zf + 0.03, 0.03, 0.18, 0.02);
  b.paint([0.95, 0.95, 0.92], MAT.PLAIN).box(0, d.wheel * 0.75, zf + 0.025, 0.5, 0.12, 0.02).box(0, d.wheel * 0.85, zr - 0.025, 0.5, 0.12, 0.02);
  lights(b, { h: bodyY - 0.08 }, zf, W * 0.36);
  b.paint([0.85, 0.08, 0.06], MAT.TAILLIGHT, 1.0);
  for (const s of [-1, 1]) b.bevelBox(s * W * 0.38, bodyY + 0.1, zr - 0.01, 0.34, 0.14, 0.06, 0.03);
  b.paint([0.9, 0.5, 0.1], MAT.TAILLIGHT, 0.4);
  for (const s of [-1, 1]) b.box(s * W * 0.46, bodyY + 0.02, zf - 0.05, 0.06, 0.08, 0.12);
  // Wheel arches (dark rings around the tyres).
  b.paint(hex('#111214'), MAT.PLAIN);
  for (const z of d.axle) {
    for (const s of [-1, 1]) {
      b.push().transform(s * (W / 2 - 0.02), d.wheel, z, 0, 0, Math.PI / 2);
      b.cylinder(0, -0.04, 0, d.wheel + 0.08, d.wheel + 0.08, 0.08, 14, { top: true, bottom: true });
      b.pop();
    }
  }
  // Door seams and handles, side skirts.
  b.paint(hex('#0c0c0e'), MAT.PLAIN);
  for (const s of [-1, 1]) {
    const x = s * (W / 2 + 0.003);
    b.box(x, bodyY, d.cabin[0] - 0.05, 0.01, H * 0.9, 0.02).box(x, bodyY, (d.cabin[0] + d.cabin[1]) / 2 - 0.15, 0.01, H * 0.9, 0.02);
    if (!d.sport && !d.truck) b.box(x, bodyY, d.cabin[1] + 0.1, 0.01, H * 0.9, 0.02);
    b.paint(chrome, MAT.METAL).box(x + s * 0.01, bodyY + H * 0.2, d.cabin[0] - 0.55, 0.02, 0.03, 0.16);
    b.paint(trim, MAT.PLAIN).box(s * (W / 2 - 0.02), d.wheel * 0.85, 0, 0.06, 0.1, L - 2 * d.wheel - 1.0);
    b.paint(hex('#0c0c0e'), MAT.PLAIN);
  }
  // Mirrors.
  b.paint(trim, MAT.PAINT);
  for (const s of [-1, 1]) b.bevelBox(s * (W / 2 + 0.1), bodyY + H / 2 + 0.12, d.cabin[0] - 0.12, 0.18, 0.12, 0.1, 0.03);
  // ---------------------------------------------------------------- extras
  if (d.sport) {
    b.paint(trim, MAT.PAINT);
    for (const s of [-1, 1]) b.box(s * W * 0.32, bodyY + H / 2 + 0.15, zr + 0.3, 0.06, 0.3, 0.12);
    b.paint([1, 1, 1], paintMat).bevelBox(0, bodyY + H / 2 + 0.32, zr + 0.28, W * 0.92, 0.05, 0.34, 0.02);
    b.paint(hex('#111'), MAT.PLAIN).box(0, bodyY + H / 2 + 0.01, zf - 0.6, 0.4, 0.02, 0.6); // hood vent
  }
  if (d.taxi) {
    b.paint([1.0, 0.85, 0.2], MAT.NEON, 0.8).bevelBox(0, d.roof + 0.16, -0.1, 0.62, 0.2, 0.28, 0.06);
    b.paint(hex('#111'), MAT.PLAIN).box(0, d.roof + 0.16, 0.045, 0.5, 0.06, 0.005).box(0, d.roof + 0.16, -0.245, 0.5, 0.06, 0.005);
    b.paint(hex('#111'), MAT.PLAIN);
    for (const s of [-1, 1]) for (let k = 0; k < 6; k++) b.box(s * (W / 2 + 0.005), bodyY + 0.15, -1.2 + k * 0.4, 0.01, 0.12, 0.2);
  }
  if (d.police) {
    // Navy panels and a lightbar.
    b.paint(hex('#16244a'), MAT.PAINT);
    for (const s of [-1, 1]) b.box(s * (W / 2 + 0.004), bodyY - 0.05, 0, 0.01, H * 0.55, L * 0.62);
    b.paint(hex('#16244a'), MAT.PAINT).bevelBox(0, bodyY + H / 2 + 0.02, zf - 0.55, W * 0.9, 0.04, 0.9, 0.02);
    b.paint(trim, MAT.PLAIN).bevelBox(0, d.roof + 0.09, -0.05, 1.2, 0.08, 0.3, 0.03);
    b.paint([1, 0.1, 0.1], MAT.SIREN_R, 1.0).bevelBox(-0.32, d.roof + 0.17, -0.05, 0.5, 0.11, 0.26, 0.04);
    b.paint([0.15, 0.3, 1], MAT.SIREN_B, 1.0).bevelBox(0.32, d.roof + 0.17, -0.05, 0.5, 0.11, 0.26, 0.04);
    b.paint(trim, MAT.PLAIN).box(0, d.wheel * 0.9, zf + 0.12, W * 0.8, 0.12, 0.1); // push bar
  }
  if (d.van) {
    b.paint(hex('#0c0c0e'), MAT.PLAIN);
    for (const s of [-1, 1]) b.box(s * (W / 2 + 0.004), bodyY + 0.25, -0.9, 0.01, 0.02, 1.8);
    b.paint(glass, MAT.GLASS);
    for (const s of [-1, 1]) b.box(s * (W / 2 + 0.005), d.roof - 0.4, -1.1, 0.02, 0.45, 1.6);
  }
  // ---------------------------------------------------------------- doors (hinged at the front edge)
  if (!d.truck) {
    const y0 = d.wheel * 0.9 + H / 2;
    const hingeZ = d.cabin[0] - 0.05;
    const doorLen = d.sport ? 1.25 : 1.05;
    for (const [bone, s] of [[VB.DOOR_L, 1], [VB.DOOR_R, -1]]) {
      b.setBone(bone);
      b.paint([1, 1, 1], paintMat).bevelBox(0, 0, -doorLen / 2, 0.07, H * 0.85, doorLen, 0.03);
      b.paint(trim, MAT.PLAIN).box(0, H * 0.43, -doorLen / 2 + 0.05, 0.08, 0.05, doorLen - 0.1);
      b.paint(chrome, MAT.METAL).box(s * 0.04, H * 0.18, -doorLen + 0.25, 0.02, 0.03, 0.15);
      void y0;
      void hingeZ;
    }
  }
  // ---------------------------------------------------------------- wheels
  const wheelW = d.truck ? 0.4 : d.sport ? 0.3 : 0.24;
  for (const [bone] of [[VB.FL], [VB.FR], [VB.RL], [VB.RR]]) {
    b.setBone(bone);
    b.wheel(0, 0, 0, d.wheel, wheelW, [0.05, 0.05, 0.055], d.sport ? hex('#2a2a2e') : chrome, d.sport ? 10 : 5);
  }
  const data = b.build();
  const r = Math.hypot(L / 2, W / 2, 1.5);
  data.bounds = { min: [-W, 0, -L], max: [W, 3, L], center: [0, 1, 0], radius: r };
  return createMesh(gl, data);
}

/** Door hinge positions in body space for a type (left, right). */
export function doorHinge(type) {
  const d = VEHICLES[type];
  const y0 = d.wheel * 0.9 + d.h / 2;
  return [[d.wid / 2 - 0.02, y0, d.cabin[0] - 0.05], [-d.wid / 2 + 0.02, y0, d.cabin[0] - 0.05]];
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
