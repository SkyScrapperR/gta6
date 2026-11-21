// Sea surface: a tessellated grid with summed directional waves in the vertex shader, fresnel sky
// reflection, sun glints, night light shimmer and foam where the water meets the shore (depth from
// the known beach slope and sea walls). Drawn in the transparent pass so the sand shows through.

import { createProgram } from './gl.js';
import { GLSL_HEADER, GLSL_NOISE, GLSL_SKY, GLSL_FOG } from './shaders/common.js';

const VS = `${GLSL_HEADER}
layout(location=0) in vec2 aXZ;
uniform mat4 uViewProj;
uniform float uTime;
uniform float uLevel;
out vec3 vWorld;
out vec3 vNormal;
vec3 wave(vec2 p, vec2 dir, float amp, float len, float speed, inout vec3 n) {
  float k = 6.2831 / len;
  float ph = dot(dir, p) * k + uTime * speed;
  float h = amp * sin(ph);
  float d = amp * k * cos(ph);
  n.x -= dir.x * d;
  n.z -= dir.y * d;
  return vec3(0.0, h, 0.0);
}
void main() {
  vec2 p = aXZ;
  vec3 n = vec3(0.0, 1.0, 0.0);
  float y = uLevel;
  y += wave(p, normalize(vec2(0.3, 1.0)), 0.16, 21.0, 1.1, n).y;
  y += wave(p, normalize(vec2(-0.8, 0.6)), 0.09, 11.0, 1.7, n).y;
  y += wave(p, normalize(vec2(0.9, 0.2)), 0.05, 6.0, 2.3, n).y;
  vWorld = vec3(p.x, y, p.y);
  vNormal = normalize(n);
  gl_Position = uViewProj * vec4(vWorld, 1.0);
}
`;

const FS = `${GLSL_HEADER}
${GLSL_NOISE}
${GLSL_SKY}
${GLSL_FOG}
in vec3 vWorld;
in vec3 vNormal;
uniform vec3 uCamPos;
uniform float uTime;
uniform vec3 uHemiSky;
uniform vec4 uLPos[8];
uniform vec4 uLCol[8];
uniform int uLCount;
out vec4 fragColor;
// Approximate water depth from the island's shape: beach slope in the south, walls elsewhere.
float depthAt(vec2 p) {
  float d = 30.0;
  if (p.y > 1010.0 && p.x > -30.0 && p.x < 1030.0) d = max(0.0, (p.y - 1050.0) * 0.06);
  float wall = min(min(abs(p.x + 30.5), abs(p.y + 30.5)), abs(p.x - 1030.5));
  if (p.x > -31.0 && p.x < 1031.0 && p.y > -31.0 && p.y < 1012.0) d = 0.0;
  d = min(d, 0.6 + wall * 0.4);
  return d;
}
void main() {
  vec3 V = safeNormalize(uCamPos - vWorld);
  vec2 ripple = vec2(fbm(vWorld.xz * 0.35 + uTime * 0.25), fbm(vWorld.xz * 0.35 - uTime * 0.2 + 7.0)) - 0.5;
  vec3 n = safeNormalize(vNormal + vec3(ripple.x, 0.0, ripple.y) * 0.35);
  float fres = 0.03 + 0.97 * pow(1.0 - max(dot(n, V), 0.0), 5.0);
  vec3 R = reflect(-V, n);
  vec3 sky = skyColor(vec3(R.x, max(R.y, 0.02), R.z));
  float depth = depthAt(vWorld.xz);
  vec3 deep = mix(vec3(0.02, 0.12, 0.16), vec3(0.006, 0.02, 0.04), uNight) ;
  vec3 shallow = mix(vec3(0.12, 0.45, 0.45), vec3(0.02, 0.05, 0.07), uNight);
  vec3 body = mix(shallow, deep, clamp(depth / 6.0, 0.0, 1.0)) * (uHemiSky * 1.6 + 0.15);
  vec3 col = mix(body, sky, clamp(fres * 1.1, 0.0, 0.9));
  vec3 L = safeNormalize(uSunDir);
  vec3 H = safeNormalize(L + V);
  col += uSunColor * pow(max(dot(n, H), 0.0), 220.0) * 3.0;
  // Light shimmer on the water at night (lamps along the promenade, neon).
  for (int i = 0; i < 8; i++) {
    if (i >= uLCount) break;
    vec3 dl = uLPos[i].xyz - vWorld;
    float d = length(dl);
    vec3 h = safeNormalize(dl / max(d, 1e-3) + V);
    col += uLCol[i].rgb * pow(max(dot(n, h), 0.0), 60.0) * 6.0 / (1.0 + d * d * 0.004);
  }
  // Shore foam.
  float foamBand = 1.0 - sstep(0.0, 0.9, depth);
  float foam = foamBand * sstep(0.45, 0.75, fbm(vWorld.xz * 0.6 + vec2(uTime * 0.3, -uTime * 0.4)) + foamBand * 0.3);
  col = mix(col, vec3(0.9, 0.95, 0.95) * (uHemiSky * 1.5 + uSunColor * 0.3 + 0.05), clamp(foam, 0.0, 1.0) * 0.85);
  float alpha = clamp(0.55 + depth * 0.25 + fres * 0.4 + foam, 0.0, 1.0);
  col = applyFog(col, vWorld, uCamPos, -V);
  if (any(isnan(col))) col = vec3(0.0);
  fragColor = vec4(max(col, vec3(0.0)), alpha);
}
`;

export class Water {
  constructor(gl, level) {
    this.gl = gl;
    this.level = level;
    this.prog = createProgram(gl, VS, FS, 'water');
    // Dense grid near the island, coarse far out.
    const pts = [];
    const idx = [];
    const ring = (x0, z0, x1, z1, step) => {
      const nx = Math.round((x1 - x0) / step), nz = Math.round((z1 - z0) / step);
      const base = pts.length / 2;
      for (let j = 0; j <= nz; j++) for (let i = 0; i <= nx; i++) pts.push(x0 + i * step, z0 + j * step);
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const a = base + j * (nx + 1) + i;
        idx.push(a, a + nx + 1, a + 1, a + 1, a + nx + 1, a + nx + 2);
      }
    };
    ring(-160, -160, 1240, 1240, 7);
    ring(-1600, -1600, 2800, -160, 80);
    ring(-1600, 1240, 2800, 2800, 80);
    ring(-1600, -160, -160, 1240, 80);
    ring(1240, -160, 2800, 1240, 80);
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const vb = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 8, 0);
    const ib = gl.createBuffer();
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint32Array(idx), gl.STATIC_DRAW);
    gl.bindVertexArray(null);
    this.vao = vao;
    this.count = idx.length;
  }

  /** Wave height at a point (CPU copy of the vertex shader, for boats and splashes). */
  heightAt(x, z, t) {
    const w = (dx, dz, amp, len, speed) => {
      const l = Math.hypot(dx, dz);
      return amp * Math.sin(((dx / l) * x + (dz / l) * z) * (6.2831 / len) + t * speed);
    };
    return this.level + w(0.3, 1, 0.16, 21, 1.1) + w(-0.8, 0.6, 0.09, 11, 1.7) + w(0.9, 0.2, 0.05, 6, 2.3);
  }

  draw(renderer) {
    const gl = this.gl, p = this.prog;
    gl.useProgram(p.program);
    renderer.setEnvUniforms(p);
    gl.uniformMatrix4fv(p.u('uViewProj'), false, renderer.camera.viewProj);
    gl.uniform1f(p.u('uLevel'), this.level);
    gl.uniform3fv(p.u('uHemiSky'), renderer.env.hemiSky);
    const n = Math.min(8, renderer.stats.lights ?? 0);
    gl.uniform4fv(p.u('uLPos'), renderer.lightPos.subarray(0, 32));
    gl.uniform4fv(p.u('uLCol'), renderer.lightCol.subarray(0, 32));
    gl.uniform1i(p.u('uLCount'), n);
    gl.bindVertexArray(this.vao);
    gl.drawElements(gl.TRIANGLES, this.count, gl.UNSIGNED_INT, 0);
  }
}
