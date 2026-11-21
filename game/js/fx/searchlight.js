// The helicopter's visible searchlight beam: an additive cone from the lamp to the lit spot on the
// ground, brighter at night. The light itself is a real spot light in the renderer's forward list.

import { createProgram } from '../engine/gl.js';
import { GLSL_HEADER } from '../engine/shaders/common.js';

const BEAM_VS = `${GLSL_HEADER}
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform vec3 uFrom;
uniform vec3 uTo;
uniform float uRadius;
out float vT;
out vec3 vN;
out vec3 vW;
void main() {
  vec3 d = uTo - uFrom;
  vec3 f = normalize(d);
  vec3 s = normalize(cross(f, abs(f.y) > 0.9 ? vec3(1, 0, 0) : vec3(0, 1, 0)));
  vec3 u = cross(s, f);
  float r = mix(0.7, uRadius, aPos.y);
  vec3 p = uFrom + d * aPos.y + (s * aPos.x + u * aPos.z) * r;
  vT = aPos.y;
  vN = s * aPos.x + u * aPos.z;
  vW = p;
  gl_Position = uViewProj * vec4(p, 1.0);
}
`;
const BEAM_FS = `${GLSL_HEADER}
in float vT;
in vec3 vN;
in vec3 vW;
uniform float uStrength;
uniform vec3 uCamPos;
out vec4 fragColor;
void main() {
  // Soft volume: brightest where the view looks through the middle of the shaft, fading to nothing
  // at its silhouette, and dimmer towards the ground.
  float facing = abs(dot(normalize(vN), normalize(uCamPos - vW)));
  float a = (1.0 - vT * 0.7) * 0.06 * uStrength * facing;
  fragColor = vec4(vec3(1.0, 0.97, 0.88) * a, 1.0);
}
`;

export class Searchlight {
  constructor(gl) {
    this.beam = createProgram(gl, BEAM_VS, BEAM_FS, 'beam');
    const pts = [];
    const N = 20;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      pts.push(Math.cos(a), 0, Math.sin(a), Math.cos(a), 1, Math.sin(a));
    }
    this.beamCount = N * 6;
    const idx = [];
    for (let i = 0; i < N; i++) idx.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
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
  }

  /** Queue the beam from `from` to the ground spot `s`, `l` metres long. */
  queue(renderer, from, s, l) {
    renderer.addTransparent((gl) => {
      const p = this.beam;
      gl.useProgram(p.program);
      gl.uniformMatrix4fv(p.u('uViewProj'), false, renderer.camera.viewProj);
      gl.uniform3fv(p.u('uFrom'), from);
      gl.uniform3fv(p.u('uCamPos'), renderer.camera.pos);
      gl.uniform3fv(p.u('uTo'), s);
      // The visible shaft is the bright core of the spot (narrower than its full light cone).
      gl.uniform1f(p.u('uRadius'), Math.min(3.2, l * 0.07));
      // The scene is HDR before exposure, so the beam must be far brighter by day to read as haze at all.
      gl.uniform1f(p.u('uStrength'), 3.0 + (1 - renderer.env.night) * 6);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(this.vao);
      gl.drawElements(gl.TRIANGLES, this.beamCount, gl.UNSIGNED_SHORT, 0);
      gl.enable(gl.CULL_FACE);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    });
  }
}
