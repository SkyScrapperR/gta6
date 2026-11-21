// Glowing light-cylinder markers: mission starts (with a floating icon ring), drop-off zones, the
// safehouse SAVE point, shop counters and the waypoint beam. Additive, animated, depth-tested.

import { createProgram } from '../engine/gl.js';
import { GLSL_HEADER } from '../engine/shaders/common.js';

const VS = `${GLSL_HEADER}
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform vec4 uMarker; // x, y, z, radius
uniform float uHeight;
out vec3 vLocal;
void main() {
  vLocal = aPos;
  vec3 p = uMarker.xyz + vec3(aPos.x * uMarker.w, aPos.y * uHeight, aPos.z * uMarker.w);
  gl_Position = uViewProj * vec4(p, 1.0);
}
`;
const FS = `${GLSL_HEADER}
in vec3 vLocal;
uniform vec3 uColor;
uniform float uTime;
uniform float uFill;
out vec4 fragColor;
void main() {
  float h = clamp(vLocal.y, 0.0, 1.0);
  float a;
  if (uFill > 0.5) {
    // Floor disc: bright rim, soft centre, rotating dashes.
    float r = length(vLocal.xz);
    float ang = atan(vLocal.z, vLocal.x);
    a = smoothstep(1.0, 0.92, r) * (0.25 + 0.75 * smoothstep(0.75, 0.95, r));
    a *= 0.7 + 0.3 * step(0.5, fract(ang * 2.0 + uTime * 0.6));
  } else {
    a = pow(1.0 - h, 1.6) * (0.55 + 0.25 * sin(uTime * 3.0 - h * 8.0));
  }
  fragColor = vec4(uColor * a * 2.2, 1.0);
}
`;

export class Markers {
  constructor(gl) {
    this.gl = gl;
    this.prog = createProgram(gl, VS, FS, 'markers');
    const pts = [];
    const idx = [];
    const N = 28;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      pts.push(Math.cos(a), 0, Math.sin(a), Math.cos(a), 1, Math.sin(a));
    }
    for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
    // Floor disc.
    const c0 = pts.length / 3;
    pts.push(0, 0.02, 0);
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      pts.push(Math.cos(a), 0.02, Math.sin(a));
    }
    this.discStart = idx.length;
    for (let i = 0; i < N; i++) idx.push(c0, c0 + 1 + i, c0 + 2 + i);
    this.discCount = idx.length - this.discStart;
    this.cylCount = this.discStart;
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 12, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.list = [];
  }

  /** Markers to draw this frame: { x, y, z, r, h, color } */
  begin() {
    this.list.length = 0;
  }

  add(x, y, z, r, h, color) {
    this.list.push({ x, y, z, r, h, color });
  }

  draw(renderer) {
    if (!this.list.length) return;
    const gl = this.gl, p = this.prog;
    gl.useProgram(p.program);
    gl.uniformMatrix4fv(p.u('uViewProj'), false, renderer.camera.viewProj);
    gl.uniform1f(p.u('uTime'), renderer.time);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.disable(gl.CULL_FACE);
    gl.bindVertexArray(this.vao);
    for (const m of this.list) {
      gl.uniform4f(p.u('uMarker'), m.x, m.y, m.z, m.r);
      gl.uniform1f(p.u('uHeight'), m.h);
      gl.uniform3fv(p.u('uColor'), m.color);
      gl.uniform1f(p.u('uFill'), 0);
      gl.drawElements(gl.TRIANGLES, this.cylCount, gl.UNSIGNED_SHORT, 0);
      gl.uniform1f(p.u('uFill'), 1);
      gl.drawElements(gl.TRIANGLES, this.discCount, gl.UNSIGNED_SHORT, this.discStart * 2);
    }
    gl.enable(gl.CULL_FACE);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  }
}
