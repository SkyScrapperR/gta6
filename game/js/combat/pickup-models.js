// Pickup geometry: health cross, armor vest, cash bundle, weapon crate, the purple Orchid tag emblem and
// the mission cash bag. Glowing (emissive) so they read at night. Built once by the model library.

import { MeshBuilder, MAT } from '../engine/mesh-builder.js';
import { createMesh } from '../engine/gl.js';
import { hex } from '../core/math.js';

export function buildPickupMeshes(gl) {
  const m = {};
  let b = new MeshBuilder();
  b.paint(hex('#ffffff'), MAT.NEON, 0.4).bevelBox(0, 0, 0, 0.5, 0.5, 0.18, 0.06);
  b.paint(hex('#ff2a3a'), MAT.NEON, 1.2).box(0, 0, 0.1, 0.12, 0.36, 0.02).box(0, 0, 0.1, 0.36, 0.12, 0.02).box(0, 0, -0.1, 0.12, 0.36, 0.02).box(0, 0, -0.1, 0.36, 0.12, 0.02);
  m.health = createMesh(gl, b.build());
  b = new MeshBuilder();
  b.paint(hex('#2a6aff'), MAT.NEON, 0.8).bevelBox(0, 0, 0, 0.46, 0.55, 0.2, 0.08, { taperX: 1.2 });
  b.paint(hex('#9ad0ff'), MAT.NEON, 1.4).box(0, 0.05, 0.11, 0.2, 0.06, 0.02);
  m.armor = createMesh(gl, b.build());
  b = new MeshBuilder();
  b.paint(hex('#2fd06a'), MAT.NEON, 0.9).bevelBox(0, 0, 0, 0.42, 0.12, 0.24, 0.03);
  b.paint(hex('#d8ffd0'), MAT.NEON, 1.0).box(0, 0.065, 0, 0.12, 0.01, 0.25);
  m.cash = createMesh(gl, b.build());
  b = new MeshBuilder();
  b.paint(hex('#ff9a2a'), MAT.NEON, 1.0).bevelBox(0, 0, 0.05, 0.08, 0.1, 0.45, 0.02).box(0, -0.12, -0.08, 0.06, 0.2, 0.08);
  m.weapon = createMesh(gl, b.build());
  b = new MeshBuilder();
  b.paint(hex('#c070ff'), MAT.NEON, 1.4);
  for (let k = 0; k < 5; k++) b.push().transform(0, 0, 0, 0, 0, (k / 5) * Math.PI * 2).sphere(0, 0.16, 0, 0.08, 0.16, 0.03, 8, 4).pop();
  b.paint(hex('#fff6a0'), MAT.NEON, 2).sphere(0, 0, 0, 0.06);
  m.tag = createMesh(gl, b.build());
  b = new MeshBuilder();
  b.paint(hex('#3a3a3a'), MAT.CLOTH).sphere(0, 0, 0, 0.3, 0.26, 0.3, 10, 6);
  b.paint(hex('#2fd06a'), MAT.NEON, 1.2).box(0, 0.05, 0.28, 0.2, 0.1, 0.04);
  m.bag = createMesh(gl, b.build());
  return m;
}
