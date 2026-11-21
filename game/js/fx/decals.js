// Decals: bullet holes on walls and cars, scorch marks under explosions and tyre skid marks while
// drifting. A ring buffer of oriented quads in one dynamic buffer, drawn after opaque geometry with a
// small depth offset so they hug the surface.

import { createProgram } from '../engine/gl.js';
import { GLSL_HEADER } from '../engine/shaders/common.js';

const VS = `${GLSL_HEADER}
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
layout(location=2) in vec4 aCol;
uniform mat4 uViewProj;
out vec2 vUv;
out vec4 vCol;
void main() { vUv = aUv; vCol = aCol; gl_Position = uViewProj * vec4(aPos, 1.0); gl_Position.z -= 0.0004 * gl_Position.w; }
`;
const FS = `${GLSL_HEADER}
in vec2 vUv;
in vec4 vCol;
uniform float uLight;
out vec4 fragColor;
void main() {
  float a;
  if (vUv.x > 1.5) a = smoothstep(1.0, 0.6, abs(vUv.y));           // skid strip
  else { float r = length(vUv); a = smoothstep(1.0, 0.25, r); }      // round mark
  fragColor = vec4(vCol.rgb * uLight, vCol.a * a);
}
`;

const MAX = 900;
const FLOATS = 9;

export class Decals {
  constructor(gl) {
    this.gl = gl;
    this.prog = createProgram(gl, VS, FS, 'decals');
    this.data = new Float32Array(MAX * 4 * FLOATS);
    this.head = 0;
    this.count = 0;
    this.dirty = false;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, FLOATS * 4, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, FLOATS * 4, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 4, gl.FLOAT, false, FLOATS * 4, 20);
    const idx = new Uint32Array(MAX * 6);
    for (let i = 0; i < MAX; i++) idx.set([i * 4, i * 4 + 1, i * 4 + 2, i * 4, i * 4 + 2, i * 4 + 3], i * 6);
    const ibo = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, idx, gl.STATIC_DRAW);
    gl.bindVertexArray(null);
  }

  /** Quad centred at p on a surface with normal n, size s, colour c (rgba), skid = stretched along dir. */
  add(p, n, s, c, dir = null, len = 0) {
    let t;
    if (Math.abs(n[1]) > 0.9) t = dir ? [dir[0], 0, dir[1]] : [1, 0, 0];
    else t = [-n[2], 0, n[0]];
    const tl = Math.hypot(t[0], t[1], t[2]) || 1;
    t = [t[0] / tl, t[1] / tl, t[2] / tl];
    const b = [n[1] * t[2] - n[2] * t[1], n[2] * t[0] - n[0] * t[2], n[0] * t[1] - n[1] * t[0]];
    const hu = dir ? len / 2 : s, hv = s;
    const o = this.head * 4 * FLOATS;
    const off = 0.015;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
    for (let k = 0; k < 4; k++) {
      const [u, v] = corners[k];
      const q = o + k * FLOATS;
      this.data[q] = p[0] + n[0] * off + t[0] * u * hu + b[0] * v * hv;
      this.data[q + 1] = p[1] + n[1] * off + t[1] * u * hu + b[1] * v * hv;
      this.data[q + 2] = p[2] + n[2] * off + t[2] * u * hu + b[2] * v * hv;
      this.data[q + 3] = dir ? 2 + u : u;
      this.data[q + 4] = v;
      this.data.set(c, q + 5);
    }
    this.head = (this.head + 1) % MAX;
    this.count = Math.min(MAX, this.count + 1);
    this.dirty = true;
  }

  bulletHole(p, n) {
    this.add(p, n, 0.07, [0.05, 0.045, 0.04, 0.9]);
  }

  scorch(x, y, z) {
    this.add([x, y, z], [0, 1, 0], 3.2, [0.02, 0.02, 0.02, 0.85]);
  }

  skid(x, z, y, dx, dz) {
    this.add([x, y + 0.005, z], [0, 1, 0], 0.13, [0.03, 0.03, 0.03, 0.55], [dx, dz], 0.5);
  }

  draw(renderer) {
    if (!this.count) return;
    const gl = this.gl;
    if (this.dirty) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data);
      this.dirty = false;
    }
    gl.useProgram(this.prog.program);
    gl.uniformMatrix4fv(this.prog.u('uViewProj'), false, renderer.camera.viewProj);
    const env = renderer.env;
    gl.uniform1f(this.prog.u('uLight'), 0.3 + (env.hemiSky[1] + env.sunColor[1] * 0.3));
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.count * 6, gl.UNSIGNED_INT, 0);
  }
}
