// Weapon geometry: Kobra 9 pistol, Wasp SMG and Thunder shotgun meshes held in the right hand, plus the
// small brass shell casing ejected on every shot. Built once by the model library.

import { MeshBuilder, MAT } from '../engine/mesh-builder.js';
import { createMesh } from '../engine/gl.js';
import { hex } from '../core/math.js';

/** Weapon meshes, built along +Z (the barrel), grip at the origin. */
function buildWeaponMesh(gl, key) {
  const b = new MeshBuilder();
  const dark = hex('#1d1e22'), metal = hex('#5a5e66');
  if (key === 'pistol') {
    b.paint(dark, MAT.METAL).bevelBox(0, 0.04, 0.06, 0.035, 0.05, 0.2, 0.012);
    b.paint(metal, MAT.METAL).box(0, 0.075, 0.07, 0.03, 0.02, 0.2);
    b.paint(dark, MAT.PLAIN).push().transform(0, -0.02, -0.01, 0, -0.25, 0).bevelBox(0, -0.03, 0, 0.032, 0.11, 0.045, 0.01).pop();
  } else if (key === 'smg') {
    b.paint(dark, MAT.METAL).bevelBox(0, 0.04, 0.08, 0.045, 0.07, 0.3, 0.015);
    b.paint(metal, MAT.METAL).cylinder(0, 0.04, 0.23, 0.012, 0.012, 0.0001, 6);
    b.push().transform(0, 0.04, 0.23, 0, Math.PI / 2, 0).cylinder(0, 0, 0, 0.014, 0.014, 0.12, 6).pop();
    b.paint(dark, MAT.PLAIN).box(0, -0.05, 0.1, 0.03, 0.14, 0.035).box(0, -0.03, -0.02, 0.03, 0.09, 0.04).box(0, 0.03, -0.13, 0.025, 0.04, 0.12);
  } else if (key === 'shotgun') {
    b.paint(hex('#6a4a2a'), MAT.WOOD).bevelBox(0, 0.0, -0.12, 0.045, 0.08, 0.3, 0.015);
    b.paint(dark, MAT.METAL).bevelBox(0, 0.03, 0.15, 0.05, 0.06, 0.3, 0.012);
    b.paint(metal, MAT.METAL).push().transform(0, 0.05, 0.25, 0, Math.PI / 2, 0).cylinder(0, 0, 0, 0.018, 0.018, 0.4, 8).pop();
    b.paint(hex('#6a4a2a'), MAT.WOOD).push().transform(0, 0.015, 0.3, 0, Math.PI / 2, 0).cylinder(0, 0, 0, 0.025, 0.025, 0.16, 8).pop();
  }
  return createMesh(gl, b.build());
}

/** All held-weapon meshes plus the ejected shell casing. */
export function buildWeaponMeshes(gl) {
  const meshes = {};
  for (const k of ['pistol', 'smg', 'shotgun']) meshes[k] = buildWeaponMesh(gl, k);
  const b = new MeshBuilder();
  b.paint(hex('#d8a83a'), MAT.METAL).cylinder(0, -0.01, 0, 0.006, 0.006, 0.02, 5);
  meshes.casing = createMesh(gl, b.build());
  return meshes;
}
