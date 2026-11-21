// Street furniture and district props as instanced batches: street lamps, traffic lights, palms,
// tropical trees, benches, bins, hydrants, bus stops, umbrellas, containers, crates, barrels,
// pallets, bollards, boats, gantry cranes. Lamps and signal poles break and fall over when hit.

import { MeshBuilder, MAT } from '../engine/mesh-builder.js';
import { createMesh, uploadInstances, INSTANCE_FLOATS } from '../engine/gl.js';
import { m4compose, hex } from '../core/math.js';

/** Prop definitions: geometry builder, collision radius/height, breakable flag. */
const DEFS = {
  lamp: {
    r: 0.18, h: 7, breakable: true,
    build(b) {
      b.paint(hex('#3b4048'), MAT.METAL).cylinder(0, 0, 0, 0.22, 0.25, 0.4, 8).cylinder(0, 0.4, 0, 0.11, 0.08, 7.0, 8);
      b.limb(0, 7.0, 0, 0, 7.4, 1.4, 0.07, 0.07, 6);
      b.paint(hex('#2a2e35'), MAT.METAL).bevelBox(0, 7.35, 1.9, 0.5, 0.18, 1.1, 0.06);
      b.paint(hex('#fff1d0'), MAT.LAMP, 1.0).box(0, 7.24, 1.9, 0.36, 0.05, 0.85);
    },
  },
  signal: {
    r: 0.18, h: 6, breakable: true,
    build(b) {
      b.paint(hex('#2d3138'), MAT.METAL).cylinder(0, 0, 0, 0.14, 0.12, 5.6, 8);
      b.limb(0, 5.4, 0, 0, 5.4, 3.0, 0.07, 0.07, 6);
      b.paint(hex('#1d1f24'), MAT.METAL).bevelBox(0, 4.6, 3.0, 0.42, 1.25, 0.32, 0.06);
      b.paint(hex('#1d1f24'), MAT.METAL).bevelBox(0, 2.6, 0.2, 0.32, 0.9, 0.26, 0.05);
      b.paint(hex('#ffffff'), MAT.PLAIN).box(0, 2.9, 0.34, 0.5, 0.03, 0.03);
    },
  },
  bulb: {
    r: 0, build(b) { b.paint([1, 1, 1], MAT.NEON, 2.2).sphere(0, 0, 0, 0.13, 0.13, 0.06, 8, 5); },
  },
  palm: {
    r: 0.3, h: 9,
    build(b) {
      // Curved trunk from short tapered segments, then drooping fronds as cheap double-sided strips.
      b.paint(hex('#8a6a48'), MAT.WOOD);
      let x = 0, y = 0;
      for (let s = 0; s < 5; s++) {
        const nx = x + 0.14 * s, ny = y + 1.75;
        b.push().transform(x, y, 0, 0, 0, -Math.atan2(nx - x, ny - y));
        b.cylinder(0, 0, 0, 0.26 - s * 0.03, 0.23 - s * 0.03, Math.hypot(nx - x, ny - y) + 0.05, 7, { top: false });
        b.pop();
        x = nx; y = ny;
      }
      b.paint(hex('#2f8f3c'), MAT.FOLIAGE);
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2 + (k % 2) * 0.2;
        const ca = Math.cos(a), sa = Math.sin(a);
        const pts = [[0, 0], [1.4, 0.45], [2.6, 0.2], [3.5, -0.6]];
        const wdt = [0.15, 0.55, 0.45, 0.05];
        for (let s = 0; s < 3; s++) {
          const [r0, h0] = pts[s], [r1, h1] = pts[s + 1];
          const w0 = wdt[s], w1 = wdt[s + 1];
          const P = (r, h, w) => [x + ca * r - sa * w, y + h, sa * r + ca * w];
          const q = [P(r0, h0, -w0), P(r1, h1, -w1), P(r1, h1, w1), P(r0, h0, w0)];
          b.quad(q[0], q[1], q[2], q[3], [0, 1, 0]);
          b.quad(q[3], q[2], q[1], q[0], [0, 1, 0]);
        }
      }
      b.paint(hex('#5a4228'), MAT.WOOD).sphere(x, y - 0.1, 0, 0.42, 0.32, 0.42, 6, 3);
    },
  },
  tree: {
    r: 0.35, h: 7,
    build(b) {
      b.paint(hex('#5a3e28'), MAT.WOOD).cylinder(0, 0, 0, 0.32, 0.2, 3.4, 7);
      b.limb(0, 2.6, 0, 0.9, 3.8, 0.3, 0.14, 0.09, 6).limb(0, 2.9, 0, -0.8, 4.0, -0.4, 0.13, 0.08, 6);
      b.paint(hex('#2f7d34'), MAT.FOLIAGE);
      b.sphere(0, 4.6, 0, 2.3, 1.7, 2.3, 8, 5).sphere(1.2, 4.1, 0.6, 1.5, 1.2, 1.5, 6, 4).sphere(-1.1, 4.3, -0.7, 1.6, 1.3, 1.6, 6, 4);
      b.paint(hex('#3e9a3e'), MAT.FOLIAGE).sphere(0.2, 5.6, -0.2, 1.4, 1.0, 1.4, 6, 4);
    },
  },
  bench: {
    r: 0.6, h: 0.9,
    build(b) {
      b.paint(hex('#3b4048'), MAT.METAL).box(-0.8, 0.22, 0, 0.08, 0.44, 0.5).box(0.8, 0.22, 0, 0.08, 0.44, 0.5);
      b.paint(hex('#9a6a3e'), MAT.WOOD).box(0, 0.46, 0, 1.9, 0.07, 0.5).box(0, 0.8, -0.24, 1.9, 0.3, 0.06);
    },
  },
  bin: {
    r: 0.3, h: 1,
    build(b) {
      b.paint(hex('#2c6a3e'), MAT.PAINT).cylinder(0, 0, 0, 0.28, 0.3, 0.95, 10);
      b.paint(hex('#222'), MAT.METAL).cylinder(0, 0.95, 0, 0.31, 0.25, 0.06, 10);
    },
  },
  hydrant: {
    r: 0.22, h: 0.8,
    build(b) {
      b.paint(hex('#d6302c'), MAT.PAINT).cylinder(0, 0, 0, 0.18, 0.15, 0.7, 8).sphere(0, 0.72, 0, 0.16, 0.12, 0.16, 8, 4);
      b.limb(-0.25, 0.45, 0, 0.25, 0.45, 0, 0.06, 0.06, 6);
    },
  },
  busstop: {
    r: 0, h: 2.6,
    build(b) {
      b.paint(hex('#3b4048'), MAT.METAL).box(-1.8, 1.2, -0.6, 0.1, 2.4, 0.1).box(1.8, 1.2, -0.6, 0.1, 2.4, 0.1).box(-1.8, 1.2, 0.6, 0.1, 2.4, 0.1).box(1.8, 1.2, 0.6, 0.1, 2.4, 0.1);
      b.paint(hex('#1b8f86'), MAT.PAINT).bevelBox(0, 2.5, 0, 4.0, 0.15, 1.6, 0.05);
      b.paint(hex('#a9c7d0'), MAT.GLASS).box(0, 1.3, -0.62, 3.5, 1.8, 0.05);
      b.paint(hex('#fff1d0'), MAT.LAMP, 0.8).box(1.0, 1.4, -0.58, 1.2, 1.5, 0.04);
      b.paint(hex('#9a6a3e'), MAT.WOOD).box(0, 0.48, -0.35, 2.6, 0.08, 0.4);
    },
  },
  umbrella: {
    r: 0.1, h: 2.4,
    build(b) {
      b.paint(hex('#eeeeee'), MAT.METAL).cylinder(0, 0, 0, 0.04, 0.04, 2.3, 6);
      b.paint(hex('#ffffff'), MAT.CLOTH).cylinder(0, 2.0, 0, 1.4, 0.05, 0.5, 10, { top: false });
      b.paint(hex('#f2f0e6'), MAT.CLOTH).box(1.6, 0.25, 0, 0.6, 0.12, 1.8);
    },
  },
  container: {
    r: 0, h: 2.6,
    build(b) {
      b.paint([0.85, 0.85, 0.85], MAT.METAL).bevelBox(0, 1.3, 0, 2.44, 2.6, 6.06, 0.04);
      b.paint([0.62, 0.62, 0.62], MAT.METAL);
      for (let z = -2.6; z <= 2.6; z += 0.65) b.box(1.23, 1.3, z, 0.04, 2.3, 0.12).box(-1.23, 1.3, z, 0.04, 2.3, 0.12);
      b.box(0, 1.3, 3.04, 2.2, 2.4, 0.05);
      b.paint([0.25, 0.25, 0.25], MAT.METAL).box(0.45, 1.3, 3.08, 0.06, 2.3, 0.06).box(-0.45, 1.3, 3.08, 0.06, 2.3, 0.06);
    },
  },
  crate: {
    r: 0.7, h: 1.1,
    build(b) {
      b.paint(hex('#a07a48'), MAT.WOOD).bevelBox(0, 0.55, 0, 1.1, 1.1, 1.1, 0.04);
      b.paint(hex('#7a5a32'), MAT.WOOD).box(0, 0.55, 0.56, 1.12, 0.12, 0.03).box(0, 0.55, -0.56, 1.12, 0.12, 0.03);
    },
  },
  barrel: {
    r: 0.35, h: 1,
    build(b) {
      b.paint([0.9, 0.9, 0.9], MAT.PAINT).cylinder(0, 0, 0, 0.32, 0.32, 0.95, 10);
      b.paint(hex('#333'), MAT.METAL).cylinder(0, 0.3, 0, 0.33, 0.33, 0.05, 10).cylinder(0, 0.65, 0, 0.33, 0.33, 0.05, 10);
    },
  },
  pallet: {
    r: 0.6, h: 0.4,
    build(b) {
      b.paint(hex('#b08a58'), MAT.WOOD).box(0, 0.12, 0, 1.2, 0.04, 1.0);
      for (const x of [-0.5, 0, 0.5]) b.box(x, 0.05, 0, 0.12, 0.1, 1.0);
      b.paint(hex('#c9b48a'), MAT.CLOTH).bevelBox(0, 0.4, 0, 1.0, 0.5, 0.9, 0.08);
    },
  },
  bollard: {
    r: 0.2, h: 0.8,
    build(b) {
      b.paint(hex('#2c2f35'), MAT.METAL).cylinder(0, 0, 0, 0.18, 0.2, 0.6, 8).sphere(0, 0.62, 0, 0.24, 0.16, 0.24, 8, 4);
    },
  },
  forklift: {
    r: 1.1, h: 2.2,
    build(b) {
      b.paint(hex('#f2b63a'), MAT.PAINT).bevelBox(0, 0.8, 0, 1.2, 0.9, 2.0, 0.12);
      b.paint(hex('#222'), MAT.METAL).box(-0.55, 1.6, -0.2, 0.06, 1.6, 0.06).box(0.55, 1.6, -0.2, 0.06, 1.6, 0.06).box(0, 2.4, 0.1, 1.2, 0.06, 1.0);
      b.box(-0.3, 1.5, 1.3, 0.08, 2.2, 0.08).box(0.3, 1.5, 1.3, 0.08, 2.2, 0.08).box(-0.3, 0.12, 1.9, 0.12, 0.06, 1.1).box(0.3, 0.12, 1.9, 0.12, 0.06, 1.1);
      for (const [x, z] of [[-0.62, 0.6], [0.62, 0.6], [-0.62, -0.6], [0.62, -0.6]]) b.wheel(x, 0.3, z, 0.3, 0.2, [0.06, 0.06, 0.06], [0.6, 0.6, 0.6]);
    },
  },
  boat: {
    r: 0, h: 2,
    build(b) {
      b.paint([0.95, 0.95, 0.95], MAT.PAINT).bevelBox(0, 0.4, 0, 3.2, 1.2, 9, 0.4, { taperX: 1.1 });
      b.paint(hex('#1b5f8f'), MAT.PAINT).box(0, -0.15, 0, 3.0, 0.3, 8.6);
      b.paint(hex('#f4f4f4'), MAT.PLAIN).bevelBox(0, 1.5, -0.8, 2.2, 1.2, 3.2, 0.2);
      b.paint(hex('#233'), MAT.GLASS).box(0, 1.65, 0.81, 2.0, 0.6, 0.05);
      b.paint(hex('#ffd23a'), MAT.LAMP, 0.8).sphere(0, 2.3, -1.6, 0.12);
    },
  },
  crane: {
    r: 0, h: 40,
    build(b) {
      const y = hex('#e0a020');
      b.paint(y, MAT.PAINT);
      for (const [x, z] of [[-7, -5], [7, -5], [-7, 5], [7, 5]]) b.box(x, 15, z, 1.2, 30, 1.2);
      b.box(0, 30, -5, 15.2, 1.4, 1.4).box(0, 30, 5, 15.2, 1.4, 1.4).box(-7, 30, 0, 1.4, 1.4, 11).box(7, 30, 0, 1.4, 1.4, 11);
      b.box(0, 32, 0, 3, 2, 60).box(0, 34, -18, 2, 4, 4);
      for (let z = -28; z <= 28; z += 4) b.box(0, 33.2, z, 3.1, 0.2, 0.2);
      b.paint(hex('#333'), MAT.METAL).box(0, 31, 14, 2.4, 1.4, 3).box(0, 22, 14, 0.06, 18, 0.06).box(0, 13, 14, 2.6, 0.4, 6.2);
      b.paint(hex('#ff3a2a'), MAT.LAMP, 1.5).sphere(0, 34.4, 30, 0.35).sphere(0, 36.4, -18, 0.35);
      b.paint(hex('#fff1d0'), MAT.LAMP, 1.2).box(0, 31, 0, 1.0, 0.2, 1.0);
    },
  },
  planter: {
    r: 0.9, h: 0.7,
    build(b) {
      b.paint(hex('#b8b0a0'), MAT.CONCRETE).box(0, 0.35, 0, 1.8, 0.7, 1.8);
      b.paint(hex('#3a7d34'), MAT.FOLIAGE).sphere(0, 1.0, 0, 0.9, 0.6, 0.9, 8, 5);
      b.paint(hex('#e45a8a'), MAT.FOLIAGE).sphere(0.4, 1.3, 0.2, 0.3, 0.25, 0.3, 6, 4);
    },
  },
  fountain: {
    r: 4.2, h: 1,
    build(b) {
      b.paint(hex('#d6d0c4'), MAT.CONCRETE).cylinder(0, 0, 0, 4.2, 4.2, 0.7, 20).cylinder(0, 0.7, 0, 0.6, 0.5, 2.2, 10);
      b.paint(hex('#2fa9d0'), MAT.WATER).cylinder(0, 0.62, 0, 3.8, 3.8, 0.1, 20);
      b.paint(hex('#d6d0c4'), MAT.CONCRETE).cylinder(0, 2.9, 0, 1.8, 1.4, 0.3, 14);
      b.paint(hex('#bfe8ff'), MAT.NEON, 0.5).cylinder(0, 3.2, 0, 0.25, 0.05, 1.4, 8);
    },
  },
  rail: {
    r: 0, h: 1.1,
    build(b) {
      b.paint(hex('#d9dde0'), MAT.METAL).box(0, 1.0, 0, 0.06, 0.06, 10).box(0, 0.55, 0, 0.04, 0.04, 10);
      for (let z = -5; z <= 5; z += 2.5) b.box(0, 0.5, z, 0.08, 1.0, 0.08);
    },
  },
};

/** How far each prop type is drawn (metres): small clutter fades early, landmarks of the skyline never. */
const RANGE = {
  bench: 150, bin: 120, hydrant: 110, bollard: 140, crate: 160, barrel: 140, pallet: 140, umbrella: 220, planter: 180,
  tree: 380, palm: 450, lamp: 330, signal: 300, busstop: 220, container: 520, forklift: 200, rail: 260, fountain: 400,
  boat: 1200, crane: 1400,
};

export class PropSystem {
  constructor(gl, col) {
    this.gl = gl;
    this.col = col;
    this.batches = {};
    this.lastCell = '';
    for (const [type, def] of Object.entries(DEFS)) {
      const b = new MeshBuilder();
      def.build(b);
      const data = b.build();
      this.batches[type] = { type, def, data, mesh: null, items: [], dirty: true };
    }
    this.lampLights = [];
  }

  /** Register a prop instance. Solid props get a collision circle (breakable ones remember their item). */
  add(type, x, y, z, yaw = 0, scale = 1, tint = [1, 1, 1, 0], { solid = true } = {}) {
    const bt = this.batches[type];
    const item = { type, x, y, z, yaw, scale, tint, fallen: 0, fallYaw: 0, alive: true };
    bt.items.push(item);
    const def = bt.def;
    if (solid && def.r > 0) item.collider = this.col.addCircle(x, z, def.r * scale, y + def.h * scale, { kind: 'prop', prop: item, breakable: !!def.breakable });
    bt.dirty = true;
    return item;
  }

  /** Knock a breakable prop over in direction (dx, dz). Returns true if it fell. */
  knockOver(item, dx, dz) {
    if (item.fallen || !this.batches[item.type].def.breakable) return false;
    item.fallen = 0.001;
    item.fallYaw = Math.atan2(dx, dz);
    if (item.collider) this.col.removeItem(item.collider);
    this.batches[item.type].dirty = true;
    return true;
  }

  finalize() {
    for (const bt of Object.values(this.batches)) {
      bt.mesh = createMesh(this.gl, bt.data, { instanced: true, maxInstances: Math.max(1, bt.items.length + 8) });
    }
  }

  /** Rebuild instance buffers around the camera when it changes cell or a prop changed. */
  update(dt, camX, camZ, drawDist) {
    const cell = `${Math.floor(camX / 40)},${Math.floor(camZ / 40)},${drawDist}`;
    const moved = cell !== this.lastCell;
    this.lastCell = cell;
    for (const bt of Object.values(this.batches)) {
      let animating = false;
      for (const it of bt.items) {
        if (it.fallen > 0 && it.fallen < 1) {
          it.fallen = Math.min(1, it.fallen + dt * 1.8);
          animating = true;
        }
      }
      if (!bt.mesh || (!bt.dirty && !moved && !animating)) continue;
      bt.dirty = false;
      const out = bt.mesh.idata;
      let n = 0;
      const lim = Math.min(drawDist + 30, (RANGE[bt.type] ?? 260) * Math.min(1, Math.max(0.6, drawDist / 900)));
      for (const it of bt.items) {
        if (!it.alive) continue;
        if (Math.abs(it.x - camX) > lim || Math.abs(it.z - camZ) > lim) continue;
        if (n >= bt.mesh.maxInstances) break;
        const fall = it.fallen ? (1 - Math.pow(1 - it.fallen, 2)) * 1.45 : 0;
        let m;
        if (fall > 0) {
          // Tip over around the base towards fallYaw.
          m = m4compose(it.x, it.y, it.z, it.fallYaw, fall, 0, it.scale);
          const r = m4compose(0, 0, 0, it.yaw - it.fallYaw, 0, 0);
          const mm = new Float32Array(16);
          for (let c = 0; c < 4; c++) for (let rr = 0; rr < 4; rr++) {
            let s = 0;
            for (let k = 0; k < 4; k++) s += m[k * 4 + rr] * r[c * 4 + k];
            mm[c * 4 + rr] = s;
          }
          m = mm;
        } else m = m4compose(it.x, it.y, it.z, it.yaw, 0, 0, it.scale);
        out.set(m, n * INSTANCE_FLOATS);
        out.set(it.fallen ? [it.tint[0], it.tint[1], it.tint[2], -1] : it.tint, n * INSTANCE_FLOATS + 16);
        n++;
      }
      uploadInstances(this.gl, bt.mesh, n);
    }
  }

  queue(renderer) {
    for (const bt of Object.values(this.batches)) {
      if (bt.mesh && bt.mesh.icount > 0) renderer.draw(bt.mesh, { cull: false, shadow: bt.type !== 'bulb' });
    }
  }
}
