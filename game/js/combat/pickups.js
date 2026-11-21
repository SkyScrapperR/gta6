// Floating, glowing pickups: health, armor, weapons + ammo, and cash (dropped by people or placed).
// They bob and spin, cast a coloured light at night, and placed ones respawn a minute after use.

import { MeshBuilder, MAT } from '../engine/mesh-builder.js';
import { createMesh } from '../engine/gl.js';
import { hex, m4compose } from '../core/math.js';

function buildMeshes(gl) {
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

const GLOW = { health: [1, 0.2, 0.25], armor: [0.2, 0.45, 1], cash: [0.2, 1, 0.4], weapon: [1, 0.6, 0.2], tag: [0.8, 0.3, 1], bag: [0.2, 1, 0.4] };

export class Pickups {
  constructor(world) {
    this.world = world;
    this.meshes = buildMeshes(world.gl);
    this.list = [];
    this.t = 0;
  }

  /** kind: health | armor | cash | weapon | tag | bag. amount: hp/armor/cash; weapon: key. */
  spawn(kind, x, z, amount = 0, opts = {}) {
    const y = this.world.city.groundAt(x, z);
    const p = { kind, x, z, y, amount, weapon: opts.weapon, respawn: opts.respawn ?? 0, timer: 0, active: true, id: opts.id, onTake: opts.onTake };
    this.list.push(p);
    return p;
  }

  update(dt) {
    this.t += dt;
    const w = this.world;
    const pl = w.player;
    for (const p of this.list) {
      if (!p.active) {
        if (p.respawn > 0) {
          p.timer -= dt;
          if (p.timer <= 0) p.active = true;
        }
        continue;
      }
      if (!pl.alive || (pl.vehicle && p.kind !== 'cash')) continue;
      if (Math.hypot(pl.x - p.x, pl.z - p.z) > (pl.vehicle ? 2.6 : 1.3)) continue;
      if (p.kind === 'health' && pl.health >= pl.maxHealth) continue;
      if (p.kind === 'armor' && pl.armor >= 100) continue;
      this.take(p);
    }
    this.list = this.list.filter((p) => p.active || p.respawn > 0);
  }

  take(p) {
    const w = this.world;
    const pl = w.player;
    if (p.kind === 'health') pl.health = Math.min(pl.maxHealth, pl.health + (p.amount || 50));
    else if (p.kind === 'armor') pl.armor = Math.min(100, pl.armor + (p.amount || 50));
    else if (p.kind === 'cash') w.addMoney(p.amount);
    else if (p.kind === 'weapon') w.arsenal.give(p.weapon, p.amount);
    p.onTake?.(p);
    w.emit('pickup', { kind: p.kind, x: p.x, z: p.z, amount: p.amount, weapon: p.weapon });
    p.active = false;
    p.timer = p.respawn;
  }

  queue(renderer, night) {
    const cam = renderer.camera.pos;
    for (const p of this.list) {
      if (!p.active) continue;
      if (Math.abs(p.x - cam[0]) > 150 || Math.abs(p.z - cam[2]) > 150) continue;
      const bob = Math.sin(this.t * 2.5 + p.x) * 0.12;
      const mesh = this.meshes[p.kind] ?? this.meshes.cash;
      renderer.draw(mesh, { model: m4compose(p.x, p.y + 0.9 + bob, p.z, this.t * 1.8, 0, 0, p.kind === 'tag' ? 2.2 : 1.3), shadow: false });
      const g = GLOW[p.kind] ?? [1, 1, 1];
      renderer.light([p.x, p.y + 1.1, p.z], 5, [g[0] * (0.6 + night * 1.5), g[1] * (0.6 + night * 1.5), g[2] * (0.6 + night * 1.5)]);
    }
  }
}
