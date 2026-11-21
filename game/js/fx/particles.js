// Particle system: a fixed pool in typed arrays, simulated on the CPU and drawn as instanced
// billboards in two batches (alpha-blended smoke/dust, additive fire/sparks/flashes/tracers).
// Emitters for muzzle flashes, impact sparks, tracers, tyre smoke, car smoke and fire, explosions,
// water splashes and rain streaks.

import { createProgram } from '../engine/gl.js';
import { PARTICLE_VS, PARTICLE_FS } from '../engine/shaders/particles.js';

const MAX = 6000;
const STRIDE = 16; // instance floats: pos3 size1 col4 stretch4 misc4

export const PK = { ROUND: 0, SMOKE: 1, STREAK: 2 };

export class Particles {
  constructor(gl) {
    this.gl = gl;
    this.prog = createProgram(gl, PARTICLE_VS, PARTICLE_FS, 'particles');
    this.n = 0;
    // Simulation state.
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.col0 = new Float32Array(MAX * 4);
    this.col1 = new Float32Array(MAX * 4);
    this.size = new Float32Array(MAX * 2);
    this.life = new Float32Array(MAX * 2);
    this.kind = new Uint8Array(MAX);
    this.add = new Uint8Array(MAX);
    this.drag = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.stretch = new Float32Array(MAX);
    this.seed = new Float32Array(MAX);
    this.rot = new Float32Array(MAX);
    this.inst = new Float32Array(MAX * STRIDE);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    this.ibuf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
    gl.bufferData(gl.ARRAY_BUFFER, this.inst.byteLength, gl.DYNAMIC_DRAW);
    for (let k = 0; k < 4; k++) {
      gl.enableVertexAttribArray(1 + k);
      gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, STRIDE * 4, k * 16);
      gl.vertexAttribDivisor(1 + k, 1);
    }
    gl.bindVertexArray(null);
  }

  /**
   * Spawn one particle. o: { x,y,z, vx,vy,vz, life, size, size1, col:[r,g,b,a], col1, kind, additive, drag, grav, stretch }
   */
  spawn(o) {
    if (this.n >= MAX) return;
    const i = this.n++;
    this.pos.set([o.x, o.y, o.z], i * 3);
    this.vel.set([o.vx ?? 0, o.vy ?? 0, o.vz ?? 0], i * 3);
    const c0 = o.col ?? [1, 1, 1, 1];
    this.col0.set(c0, i * 4);
    this.col1.set(o.col1 ?? [c0[0], c0[1], c0[2], 0], i * 4);
    this.size.set([o.size ?? 0.3, o.size1 ?? o.size ?? 0.3], i * 2);
    this.life.set([0, o.life ?? 1], i * 2);
    this.kind[i] = o.kind ?? PK.ROUND;
    this.add[i] = o.additive ? 1 : 0;
    this.drag[i] = o.drag ?? 0;
    this.grav[i] = o.grav ?? 0;
    this.stretch[i] = o.stretch ?? 0;
    this.seed[i] = Math.random();
    this.rot[i] = Math.random() * 6.28;
  }

  update(dt) {
    let w = 0;
    for (let i = 0; i < this.n; i++) {
      const age = this.life[i * 2] + dt;
      if (age >= this.life[i * 2 + 1]) continue;
      if (w !== i) this.copy(i, w);
      this.life[w * 2] = age;
      const d = Math.exp(-this.drag[w] * dt);
      this.vel[w * 3] *= d;
      this.vel[w * 3 + 1] = this.vel[w * 3 + 1] * d - this.grav[w] * dt;
      this.vel[w * 3 + 2] *= d;
      this.pos[w * 3] += this.vel[w * 3] * dt;
      this.pos[w * 3 + 1] += this.vel[w * 3 + 1] * dt;
      this.pos[w * 3 + 2] += this.vel[w * 3 + 2] * dt;
      if (this.pos[w * 3 + 1] < 0.02 && this.grav[w] > 0) {
        this.pos[w * 3 + 1] = 0.02;
        this.vel[w * 3 + 1] *= -0.3;
      }
      w++;
    }
    this.n = w;
  }

  copy(a, b) {
    this.pos.copyWithin(b * 3, a * 3, a * 3 + 3);
    this.vel.copyWithin(b * 3, a * 3, a * 3 + 3);
    this.col0.copyWithin(b * 4, a * 4, a * 4 + 4);
    this.col1.copyWithin(b * 4, a * 4, a * 4 + 4);
    this.size.copyWithin(b * 2, a * 2, a * 2 + 2);
    this.life.copyWithin(b * 2, a * 2, a * 2 + 2);
    this.kind[b] = this.kind[a];
    this.add[b] = this.add[a];
    this.drag[b] = this.drag[a];
    this.grav[b] = this.grav[a];
    this.stretch[b] = this.stretch[a];
    this.seed[b] = this.seed[a];
    this.rot[b] = this.rot[a];
  }

  fill(additive) {
    let n = 0;
    const o = this.inst;
    for (let i = 0; i < this.n; i++) {
      if (this.add[i] !== additive) continue;
      const t = this.life[i * 2] / this.life[i * 2 + 1];
      const k = n * STRIDE;
      o[k] = this.pos[i * 3]; o[k + 1] = this.pos[i * 3 + 1]; o[k + 2] = this.pos[i * 3 + 2];
      o[k + 3] = this.size[i * 2] + (this.size[i * 2 + 1] - this.size[i * 2]) * t;
      for (let c = 0; c < 4; c++) o[k + 4 + c] = this.col0[i * 4 + c] + (this.col1[i * 4 + c] - this.col0[i * 4 + c]) * t;
      if (this.stretch[i] > 0) {
        o[k + 8] = this.vel[i * 3]; o[k + 9] = this.vel[i * 3 + 1]; o[k + 10] = this.vel[i * 3 + 2];
        o[k + 11] = this.stretch[i];
      } else {
        o[k + 8] = o[k + 9] = o[k + 10] = 0;
        o[k + 11] = 0;
      }
      o[k + 12] = this.kind[i]; o[k + 13] = this.seed[i]; o[k + 14] = t; o[k + 15] = this.rot[i] + t * 0.8;
      n++;
    }
    return n;
  }

  draw(renderer) {
    if (!this.n) return;
    const gl = this.gl, p = this.prog, cam = renderer.camera;
    gl.useProgram(p.program);
    renderer.setEnvUniforms(p);
    gl.uniformMatrix4fv(p.u('uViewProj'), false, cam.viewProj);
    const v = cam.view;
    gl.uniform3f(p.u('uCamRight'), v[0], v[4], v[8]);
    gl.uniform3f(p.u('uCamUp'), v[1], v[5], v[9]);
    gl.uniform3fv(p.u('uHemiSky'), renderer.env.hemiSky);
    gl.bindVertexArray(this.vao);
    gl.disable(gl.CULL_FACE);
    for (const additive of [0, 1]) {
      const n = this.fill(additive);
      if (!n) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, this.ibuf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.inst, 0, n * STRIDE);
      gl.uniform1f(p.u('uAdditive'), additive);
      if (additive) gl.blendFunc(gl.ONE, gl.ONE);
      else gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
    }
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.CULL_FACE);
  }

  // ------------------------------------------------------------ emitters
  muzzle(x, y, z, dx, dy, dz) {
    this.spawn({ x, y, z, life: 0.06, size: 0.32, size1: 0.12, col: [9, 6, 2.5, 1], col1: [5, 2, 0.5, 0], additive: true });
    this.spawn({ x: x + dx * 0.15, y: y + dy * 0.15, z: z + dz * 0.15, vx: dx * 3, vy: dy * 3, vz: dz * 3, life: 0.05, size: 0.07, stretch: 0.35, col: [10, 7, 3, 1], kind: PK.STREAK, additive: true });
    this.spawn({ x, y, z, vx: dx * 1.5, vy: 0.4, vz: dz * 1.5, life: 0.6, size: 0.12, size1: 0.45, col: [0.6, 0.6, 0.6, 0.35], kind: PK.SMOKE, drag: 2 });
  }

  tracer(x, y, z, tx, ty, tz) {
    const dx = tx - x, dy = ty - y, dz = tz - z;
    const len = Math.hypot(dx, dy, dz) || 1;
    const speed = 380;
    const life = Math.min(0.12, len / speed);
    this.spawn({ x: x + dx * 0.1, y: y + dy * 0.1, z: z + dz * 0.1, vx: (dx / len) * speed, vy: (dy / len) * speed, vz: (dz / len) * speed, life, size: 0.035, stretch: 2.4, col: [8, 6, 2.6, 1], col1: [6, 3, 1, 0.6], kind: PK.STREAK, additive: true });
  }

  sparks(x, y, z, nx, ny, nz, n = 8, color = [7, 4.5, 1.6]) {
    for (let k = 0; k < n; k++) {
      const s = 3 + Math.random() * 6;
      this.spawn({ x, y, z, vx: (nx + (Math.random() - 0.5) * 1.4) * s, vy: (ny + Math.random() * 0.8) * s, vz: (nz + (Math.random() - 0.5) * 1.4) * s, life: 0.25 + Math.random() * 0.3, size: 0.025, stretch: 0.12, col: [...color, 1], col1: [color[0] * 0.5, color[1] * 0.3, 0.1, 0], kind: PK.STREAK, additive: true, grav: 9, drag: 1 });
    }
    this.spawn({ x, y, z, vx: nx * 0.6, vy: 0.5, vz: nz * 0.6, life: 0.7, size: 0.1, size1: 0.5, col: [0.5, 0.48, 0.45, 0.35], kind: PK.SMOKE, drag: 2 });
  }

  /** Dust puff where a bullet hits the ground or a wall. */
  dust(x, y, z, color = [0.55, 0.5, 0.45]) {
    for (let k = 0; k < 3; k++) this.spawn({ x, y, z, vx: (Math.random() - 0.5) * 1.5, vy: Math.random() * 1.5, vz: (Math.random() - 0.5) * 1.5, life: 0.6, size: 0.08, size1: 0.35, col: [...color, 0.5], kind: PK.SMOKE, drag: 3 });
  }

  tyreSmoke(x, y, z) {
    this.spawn({ x: x + (Math.random() - 0.5) * 0.3, y: y + 0.2, z: z + (Math.random() - 0.5) * 0.3, vx: (Math.random() - 0.5), vy: 0.6 + Math.random() * 0.5, vz: (Math.random() - 0.5), life: 1.4, size: 0.3, size1: 1.6, col: [0.85, 0.85, 0.85, 0.45], col1: [0.9, 0.9, 0.9, 0], kind: PK.SMOKE, drag: 1.2 });
  }

  carSmoke(x, y, z, dark) {
    this.spawn({ x, y, z, vx: (Math.random() - 0.5) * 0.6, vy: 1.6 + Math.random(), vz: (Math.random() - 0.5) * 0.6, life: 1.8, size: 0.35, size1: 1.4, col: dark ? [0.12, 0.12, 0.12, 0.6] : [0.7, 0.7, 0.7, 0.45], kind: PK.SMOKE, drag: 0.6 });
  }

  fire(x, y, z, scale = 1) {
    this.spawn({ x: x + (Math.random() - 0.5) * 0.6 * scale, y, z: z + (Math.random() - 0.5) * 0.6 * scale, vx: (Math.random() - 0.5) * 0.4, vy: 1.6 + Math.random() * 1.6, vz: (Math.random() - 0.5) * 0.4, life: 0.45 + Math.random() * 0.3, size: 0.45 * scale, size1: 0.1, col: [7, 2.6, 0.5, 1], col1: [3, 0.6, 0.1, 0], additive: true });
    if (Math.random() < 0.35) this.carSmoke(x, y + 1, z, true);
  }

  explosion(x, y, z, scale = 1) {
    for (let k = 0; k < 40; k++) {
      const a = Math.random() * 6.28, e = Math.random() * 1.2, s = (2 + Math.random() * 7) * scale;
      this.spawn({ x, y: y + 0.5, z, vx: Math.cos(a) * Math.cos(e) * s, vy: Math.sin(e) * s + 2, vz: Math.sin(a) * Math.cos(e) * s, life: 0.5 + Math.random() * 0.6, size: (0.8 + Math.random() * 0.8) * scale, size1: (2.4 + Math.random()) * scale, col: [12, 5, 1.2, 1], col1: [3, 0.6, 0.1, 0], additive: true, drag: 3.2 });
    }
    for (let k = 0; k < 26; k++) {
      const a = Math.random() * 6.28, s = (1 + Math.random() * 3) * scale;
      // Smoke lit from inside: starts warm and glowing, cools to dark grey.
      this.spawn({ x: x + Math.cos(a) * 0.8, y: y + 1 + Math.random() * 2, z: z + Math.sin(a) * 0.8, vx: Math.cos(a) * s, vy: 2 + Math.random() * 3, vz: Math.sin(a) * s, life: 3 + Math.random() * 2, size: 1.2 * scale, size1: 5 * scale, col: [2.2, 0.9, 0.35, 0.85], col1: [0.08, 0.08, 0.08, 0], kind: PK.SMOKE, drag: 0.9 });
    }
    this.sparks(x, y + 0.5, z, 0, 1, 0, 30, [9, 5, 1.5]);
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * 6.28;
      this.spawn({ x, y: y + 0.6, z, vx: Math.cos(a) * 9, vy: 6 + Math.random() * 6, vz: Math.sin(a) * 9, life: 1.4, size: 0.12, col: [0.1, 0.1, 0.1, 1], col1: [0.1, 0.1, 0.1, 1], grav: 14, drag: 0.5 });
    }
  }

  splash(x, y, z) {
    for (let k = 0; k < 6; k++) this.spawn({ x, y, z, vx: (Math.random() - 0.5) * 1.6, vy: 1.6 + Math.random() * 1.5, vz: (Math.random() - 0.5) * 1.6, life: 0.4, size: 0.05, col: [0.7, 0.8, 0.9, 0.7], grav: 9 });
  }

  /** Falling rain streaks around the camera. */
  rain(cx, cy, cz, amount, dt) {
    const n = Math.floor(amount * 900 * dt);
    for (let k = 0; k < n; k++) {
      const x = cx + (Math.random() - 0.5) * 50, z = cz + (Math.random() - 0.5) * 50;
      this.spawn({ x, y: cy + 8 + Math.random() * 10, z, vx: 1.5, vy: -22, vz: 0.6, life: 0.9, size: 0.012, stretch: 0.45, col: [0.55, 0.6, 0.7, 0.32], kind: PK.STREAK });
    }
  }
}
