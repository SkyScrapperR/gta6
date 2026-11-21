// Procedural geometry: a builder that accumulates interleaved vertices under a transform stack.
// Primitives: quad, box, beveled (rounded) box with optional taper, tapered cylinder, sphere,
// capsule-like limbs, wheel, gable roof and a flat polygon. Materials are ids read by the lit shader.

import { m4, m4mul, m4compose, m4point } from '../core/math.js';

/** Material ids understood by shaders/lit.js. */
export const MAT = {
  PLAIN: 0,
  WINDOWS: 1, // building facade with procedural windows
  ASPHALT: 2,
  CONCRETE: 3,
  GLASS: 4, // tinted, reflective (cars, shopfronts)
  GRASS: 5,
  SAND: 6,
  PAINT: 7, // clearcoat car paint
  SKIN: 8,
  CLOTH: 9,
  NEON: 10, // pure emissive, lit at night
  METAL: 11,
  ROOF: 12, // roof tiles
  WOOD: 13,
  LAMP: 14, // emissive only when lights are on
  WATER: 15,
  GLASS_TOWER: 16, // curtain-wall towers
  HEADLIGHT: 17, // follows uCarLights.x
  TAILLIGHT: 18, // follows headlights (dim) and brake (bright)
  SIREN_R: 19,
  SIREN_B: 20,
  FOLIAGE: 21, // sways in the wind
};

/** Encode a material id together with a bone index for rigged meshes. */
export const matBone = (mat, bone) => mat + bone * 32;

export class MeshBuilder {
  constructor() {
    this.v = [];
    this.i = [];
    this.stack = [];
    this.mat = m4();
    this.color = [0.8, 0.8, 0.8];
    this.emissive = 0;
    this.material = MAT.PLAIN;
    this.bone = 0;
    this.min = [Infinity, Infinity, Infinity];
    this.max = [-Infinity, -Infinity, -Infinity];
  }

  get vertexCount() {
    return this.v.length / 11;
  }

  // ------------------------------------------------------------ state
  push() {
    this.stack.push(this.mat);
    this.mat = new Float32Array(this.mat);
    return this;
  }
  pop() {
    this.mat = this.stack.pop();
    return this;
  }
  /** Apply translation/rotation/scale after the current transform. */
  transform(px, py, pz, yaw = 0, pitch = 0, roll = 0, sx = 1, sy = sx, sz = sx) {
    this.mat = m4mul(this.mat, m4compose(px, py, pz, yaw, pitch, roll, sx, sy, sz));
    return this;
  }
  translate(x, y, z) {
    return this.transform(x, y, z);
  }
  /** Subsequent vertices follow bone `b` of a rigged mesh (0..15). */
  setBone(b) {
    this.bone = b;
    return this;
  }
  paint(color, material = this.material, emissive = 0) {
    this.color = color;
    this.material = material;
    this.emissive = emissive;
    return this;
  }

  // ------------------------------------------------------------ raw vertices
  vertex(x, y, z, nx, ny, nz) {
    const m = this.mat;
    const p = m4point(m, x, y, z);
    let tx = m[0] * nx + m[4] * ny + m[8] * nz;
    let ty = m[1] * nx + m[5] * ny + m[9] * nz;
    let tz = m[2] * nx + m[6] * ny + m[10] * nz;
    const l = Math.hypot(tx, ty, tz) || 1;
    tx /= l; ty /= l; tz /= l;
    this.v.push(p[0], p[1], p[2], tx, ty, tz, this.color[0], this.color[1], this.color[2], this.emissive, this.material + this.bone * 32);
    for (let k = 0; k < 3; k++) {
      if (p[k] < this.min[k]) this.min[k] = p[k];
      if (p[k] > this.max[k]) this.max[k] = p[k];
    }
    return this.vertexCount - 1;
  }

  tri(a, b, c) {
    this.i.push(a, b, c);
  }

  /** Triangle wound so its geometric normal agrees with its vertices' normals (front-facing outward). */
  facingTri(a, b, c) {
    const v = this.v;
    const A = a * 11, B = b * 11, C = c * 11;
    const ux = v[B] - v[A], uy = v[B + 1] - v[A + 1], uz = v[B + 2] - v[A + 2];
    const wx = v[C] - v[A], wy = v[C + 1] - v[A + 1], wz = v[C + 2] - v[A + 2];
    const nx = uy * wz - uz * wy, ny = uz * wx - ux * wz, nz = ux * wy - uy * wx;
    const sx = v[A + 3] + v[B + 3] + v[C + 3], sy = v[A + 4] + v[B + 4] + v[C + 4], sz = v[A + 5] + v[B + 5] + v[C + 5];
    if (nx * sx + ny * sy + nz * sz >= 0) this.i.push(a, b, c);
    else this.i.push(a, c, b);
  }

  /** Quad from four corners (counter-clockwise seen from the normal side), flat normal. */
  quad(p0, p1, p2, p3, n) {
    if (!n) {
      const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
      const vx = p3[0] - p0[0], vy = p3[1] - p0[1], vz = p3[2] - p0[2];
      n = [uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx];
    }
    const a = this.vertex(p0[0], p0[1], p0[2], n[0], n[1], n[2]);
    const b = this.vertex(p1[0], p1[1], p1[2], n[0], n[1], n[2]);
    const c = this.vertex(p2[0], p2[1], p2[2], n[0], n[1], n[2]);
    const d = this.vertex(p3[0], p3[1], p3[2], n[0], n[1], n[2]);
    this.i.push(a, b, c, a, c, d);
    return this;
  }

  /** Horizontal rectangle at height y (normal up), from (x0,z0) to (x1,z1). */
  plane(x0, z0, x1, z1, y = 0) {
    return this.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], [0, 1, 0]);
  }

  // ------------------------------------------------------------ solids
  /** Axis-aligned box centered at (cx, cy, cz) with full sizes (sx, sy, sz). `faces` can skip the bottom. */
  box(cx, cy, cz, sx, sy, sz, { bottom = false } = {}) {
    const x0 = cx - sx / 2, x1 = cx + sx / 2, y0 = cy - sy / 2, y1 = cy + sy / 2, z0 = cz - sz / 2, z1 = cz + sz / 2;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]);
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]);
    if (bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]);
    return this;
  }

  /**
   * Rounded/beveled box centered at (cx,cy,cz): a 4x4 grid per face pushed out from an inner box by `bevel`,
   * which gives smooth rounded edges with very few triangles. taperTop scales the top's x/z (car cabins, hoods).
   */
  bevelBox(cx, cy, cz, sx, sy, sz, bevel = 0.05, { taperX = 1, taperZ = 1, shiftZ = 0 } = {}) {
    const h = [sx / 2, sy / 2, sz / 2];
    const b = Math.min(bevel, h[0] * 0.95, h[1] * 0.95, h[2] * 0.95);
    const coords = (k) => [-h[k], -h[k] + b, h[k] - b, h[k]];
    const faces = [
      [0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [1, 2, 0, -1], [2, 0, 1, 1], [2, 0, 1, -1],
    ];
    for (const [ax, ua, va, sign] of faces) {
      const uc = coords(ua), vc = coords(va);
      const base = this.vertexCount;
      for (let vi = 0; vi < 4; vi++) {
        for (let ui = 0; ui < 4; ui++) {
          const p = [0, 0, 0];
          p[ax] = sign * h[ax];
          p[ua] = uc[ui];
          p[va] = vc[vi];
          const inner = [0, 0, 0];
          for (let k = 0; k < 3; k++) inner[k] = Math.max(-h[k] + b, Math.min(h[k] - b, p[k]));
          let d = [p[0] - inner[0], p[1] - inner[1], p[2] - inner[2]];
          const dl = Math.hypot(d[0], d[1], d[2]) || 1;
          d = [d[0] / dl, d[1] / dl, d[2] / dl];
          let x = inner[0] + d[0] * b, y = inner[1] + d[1] * b, z = inner[2] + d[2] * b;
          const t = (y + h[1]) / (2 * h[1]);
          x *= 1 + (taperX - 1) * t;
          z = z * (1 + (taperZ - 1) * t) + shiftZ * t;
          this.vertex(cx + x, cy + y, cz + z, d[0], d[1], d[2]);
        }
      }
      for (let vi = 0; vi < 3; vi++) {
        for (let ui = 0; ui < 3; ui++) {
          const a = base + vi * 4 + ui;
          this.facingTri(a, a + 1, a + 5);
          this.facingTri(a, a + 5, a + 4);
        }
      }
    }
    return this;
  }

  /** Tapered cylinder along +Y from y0, radius r0 at the bottom and r1 at the top, smooth sides. */
  cylinder(cx, y0, cz, r0, r1, height, sides = 10, { top = true, bottom = false, rx = 1, rz = 1 } = {}) {
    const base = this.vertexCount;
    const slope = (r0 - r1) / height;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const nl = Math.hypot(1, slope);
      this.vertex(cx + c * r0 * rx, y0, cz + sn * r0 * rz, c / nl, slope / nl, sn / nl);
      this.vertex(cx + c * r1 * rx, y0 + height, cz + sn * r1 * rz, c / nl, slope / nl, sn / nl);
    }
    for (let s = 0; s < sides; s++) {
      const a = base + s * 2;
      this.i.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
    if (top && r1 > 0) this.disc(cx, y0 + height, cz, r1 * rx, r1 * rz, sides, 1);
    if (bottom && r0 > 0) this.disc(cx, y0, cz, r0 * rx, r0 * rz, sides, -1);
    return this;
  }

  disc(cx, y, cz, rx, rz, sides, dir = 1) {
    const c0 = this.vertex(cx, y, cz, 0, dir, 0);
    const base = this.vertexCount;
    for (let s = 0; s <= sides; s++) {
      const a = (s / sides) * Math.PI * 2;
      this.vertex(cx + Math.cos(a) * rx, y, cz + Math.sin(a) * rz, 0, dir, 0);
    }
    for (let s = 0; s < sides; s++) {
      if (dir > 0) this.i.push(c0, base + s + 1, base + s);
      else this.i.push(c0, base + s, base + s + 1);
    }
    return this;
  }

  /** UV sphere / ellipsoid centered at (cx,cy,cz) with radii. */
  sphere(cx, cy, cz, rx, ry = rx, rz = rx, segW = 10, segH = 7, { yMin = -1 } = {}) {
    const base = this.vertexCount;
    for (let y = 0; y <= segH; y++) {
      const v = y / segH;
      const phi = v * Math.PI;
      const cy_ = Math.cos(phi);
      const sy = Math.sin(phi);
      for (let x = 0; x <= segW; x++) {
        const th = (x / segW) * Math.PI * 2;
        const nx = Math.cos(th) * sy, ny = cy_, nz = Math.sin(th) * sy;
        const py = Math.max(ny, yMin);
        this.vertex(cx + nx * rx, cy + py * ry, cz + nz * rz, nx / rx, ny / ry, nz / rz);
      }
    }
    for (let y = 0; y < segH; y++) {
      for (let x = 0; x < segW; x++) {
        const a = base + y * (segW + 1) + x;
        const b = a + segW + 1;
        this.i.push(a, a + 1, b + 1, a, b + 1, b);
      }
    }
    return this;
  }

  /** Limb segment from point A to point B (local space), tapered, with a rounded cap at each end. */
  limb(ax, ay, az, bx, by, bz, ra, rb, sides = 8) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz) || 1e-4;
    const yaw = Math.atan2(dx, dz);
    const pitch = Math.acos(Math.max(-1, Math.min(1, dy / len)));
    this.push().transform(ax, ay, az, yaw, pitch, 0);
    this.cylinder(0, 0, 0, ra, rb, len, sides, { top: false });
    this.sphere(0, len, 0, rb, rb, rb, sides, 4);
    this.sphere(0, 0, 0, ra, ra, ra, sides, 4);
    return this.pop();
  }

  /**
   * Car wheel lying on the X axis at (cx, cy, cz): a tread with rounded shoulders, slightly lighter
   * sidewalls, a recessed rim with a lip, spokes, a hub cap and a brake disc behind the spokes.
   */
  wheel(cx, cy, cz, radius, width, tireColor, rimColor, spokes = 5) {
    const saved = [this.color, this.material, this.emissive];
    this.push().transform(cx, cy, cz, 0, 0, Math.PI / 2);
    const sh = Math.min(0.04, width * 0.2), rs = radius - sh * 0.9;
    this.paint(tireColor, MAT.PLAIN);
    this.cylinder(0, -width / 2 + sh, 0, radius, radius, width - 2 * sh, 18, { top: false });
    this.cylinder(0, width / 2 - sh, 0, radius, rs, sh, 18, { top: false });
    this.cylinder(0, -width / 2, 0, rs, radius, sh, 18, { top: false });
    const side = [tireColor[0] * 1.8 + 0.02, tireColor[1] * 1.8 + 0.02, tireColor[2] * 1.8 + 0.025];
    const rr = radius * 0.64;
    for (const s of [1, -1]) {
      // Sidewall ring and the rim set slightly into it.
      this.paint(side, MAT.PLAIN);
      this.push().transform(0, s * width / 2, 0, 0, s > 0 ? 0 : Math.PI, 0);
      this.cylinder(0, -0.004, 0, rs, rr * 1.06, 0.008, 18, { top: true });
      this.paint(rimColor, MAT.METAL);
      this.cylinder(0, -0.012, 0, rr * 1.06, rr, 0.016, 16, { top: true });
      this.paint([rimColor[0] * 0.35, rimColor[1] * 0.35, rimColor[2] * 0.35], MAT.METAL);
      this.cylinder(0, -0.05, 0, rr * 0.98, rr * 0.98, 0.04, 16, { top: true });
      this.paint([0.32, 0.31, 0.3], MAT.METAL).cylinder(0, -0.04, 0, rr * 0.7, rr * 0.7, 0.012, 14, { top: true });
      this.paint(rimColor, MAT.METAL);
      for (let k = 0; k < spokes; k++) {
        this.push().transform(0, -0.006, 0, (k / spokes) * Math.PI * 2, 0, 0);
        this.box(0, 0, rr * 0.52, 0.05, 0.026, rr * 0.88);
        this.pop();
      }
      this.cylinder(0, -0.01, 0, rr * 0.24, rr * 0.18, 0.03, 10);
      this.pop();
    }
    this.pop();
    [this.color, this.material, this.emissive] = saved;
    return this;
  }

  /**
   * Side-profile solid (car bodies): `top` and `bottom` are chains of [z, y, halfWidth] points from front
   * to rear (z decreasing), so the bottom can carry wheel-arch cut-outs. The flanks are inset by `bevel`
   * and joined to the outer band by a chamfer, so every edge catches a highlight; the band is smooth.
   */
  loft(top, bottom, bevel = 0.04) {
    const pts = [...top, ...[...bottom].reverse()];
    const n = pts.length;
    // Outward profile normal per point (the average of its two edge normals), from the loop's winding.
    let area = 0;
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; area += p[0] * q[1] - q[0] * p[1]; }
    const wind = area > 0 ? 1 : -1;
    const edgeN = pts.map((p, i) => {
      const q = pts[(i + 1) % n];
      const nz = (q[1] - p[1]) * wind, ny = -(q[0] - p[0]) * wind;
      const l = Math.hypot(nz, ny) || 1;
      return [nz / l, ny / l];
    });
    const pn = pts.map((p, i) => {
      const a = edgeN[(i + n - 1) % n], c = edgeN[i];
      const z = a[0] + c[0], y = a[1] + c[1], l = Math.hypot(z, y) || 1;
      return [z / l, y / l];
    });
    const ins = pts.map(([z, y, w], i) => [z - pn[i][0] * bevel, y - pn[i][1] * bevel, w]);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, a = pts[i], c = pts[j];
      // Band across the width.
      const v = [
        this.vertex(-(a[2] - bevel), a[1], a[0], 0, pn[i][1], pn[i][0]),
        this.vertex(a[2] - bevel, a[1], a[0], 0, pn[i][1], pn[i][0]),
        this.vertex(c[2] - bevel, c[1], c[0], 0, pn[j][1], pn[j][0]),
        this.vertex(-(c[2] - bevel), c[1], c[0], 0, pn[j][1], pn[j][0]),
      ];
      this.facingTri(v[0], v[1], v[2]);
      this.facingTri(v[0], v[2], v[3]);
      for (const s of [-1, 1]) {
        // Chamfer between the band edge and the inset flank.
        const ch = (p, q) => { const l = Math.hypot(0.7, q[1], q[0]); return [s * 0.7 / l, q[1] / l, q[0] / l]; };
        const na = ch(a, pn[i]), nc = ch(c, pn[j]);
        const u = [
          this.vertex(s * (a[2] - bevel), a[1], a[0], ...na),
          this.vertex(s * a[2], ins[i][1], ins[i][0], ...na),
          this.vertex(s * c[2], ins[j][1], ins[j][0], ...nc),
          this.vertex(s * (c[2] - bevel), c[1], c[0], ...nc),
        ];
        this.facingTri(u[0], u[1], u[2]);
        this.facingTri(u[0], u[2], u[3]);
      }
    }
    // Flanks: triangulate between the inset top and bottom chains, merging them by z.
    const nt = top.length;
    const it = ins.slice(0, nt), ib = ins.slice(nt).reverse();
    for (const s of [-1, 1]) {
      const V = (p) => this.vertex(s * p[2], p[1], p[0], s, 0, 0);
      let i = 0, j = 0;
      while (i < it.length - 1 || j < ib.length - 1) {
        const advanceTop = j >= ib.length - 1 || (i < it.length - 1 && it[i + 1][0] >= ib[j + 1][0]);
        if (advanceTop) { this.facingTri(V(it[i]), V(it[i + 1]), V(ib[j])); i++; }
        else { this.facingTri(V(it[i]), V(ib[j + 1]), V(ib[j])); j++; }
      }
    }
    return this;
  }

  /** Gable roof over a w (x) by d (z) rectangle at y0, ridge along x, rising by `rise`, with overhang. */
  gableRoof(cx, y0, cz, w, d, rise, overhang = 0.3) {
    const x0 = cx - w / 2 - overhang, x1 = cx + w / 2 + overhang;
    const z0 = cz - d / 2 - overhang, z1 = cz + d / 2 + overhang;
    const yr = y0 + rise;
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, yr, cz], [x0, yr, cz]);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, yr, cz], [x1, yr, cz]);
    // Gable ends
    const n0 = [-1, 0, 0], n1 = [1, 0, 0];
    let a = this.vertex(x0 + overhang, y0, z0 + overhang, ...n0), b = this.vertex(x0 + overhang, y0, z1 - overhang, ...n0), c = this.vertex(x0 + overhang, yr, cz, ...n0);
    this.tri(a, b, c);
    a = this.vertex(x1 - overhang, y0, z1 - overhang, ...n1); b = this.vertex(x1 - overhang, y0, z0 + overhang, ...n1); c = this.vertex(x1 - overhang, yr, cz, ...n1);
    this.tri(a, b, c);
    return this;
  }

  /** Append another builder's geometry (already in world space). */
  append(other) {
    const base = this.vertexCount;
    for (const x of other.v) this.v.push(x);
    for (const x of other.i) this.i.push(x + base);
    for (let k = 0; k < 3; k++) {
      this.min[k] = Math.min(this.min[k], other.min[k]);
      this.max[k] = Math.max(this.max[k], other.max[k]);
    }
    return this;
  }

  /** Typed arrays plus a bounding sphere/box for culling. */
  build() {
    const bounds = this.v.length
      ? { min: this.min.slice(), max: this.max.slice(), center: [(this.min[0] + this.max[0]) / 2, (this.min[1] + this.max[1]) / 2, (this.min[2] + this.max[2]) / 2], radius: Math.hypot(this.max[0] - this.min[0], this.max[1] - this.min[1], this.max[2] - this.min[2]) / 2 }
      : { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], radius: 0 };
    return { vertices: new Float32Array(this.v), indices: new Uint32Array(this.i), bounds };
  }
}
