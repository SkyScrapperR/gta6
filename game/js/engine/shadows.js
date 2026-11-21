// Directional shadow map fitted to the camera: an orthographic box centred ahead of the viewer,
// snapped to whole texels so edges do not shimmer while moving.

import { m4lookAt, m4ortho, m4mul, v3add, v3scale } from '../core/math.js';
import { createShadowTarget, deleteTarget } from './gl.js';

export class ShadowMap {
  constructor(gl, size) {
    this.gl = gl;
    this.size = 0;
    this.target = null;
    this.radius = 85;
    this.viewProj = new Float32Array(16);
    this.view = new Float32Array(16);
    this.proj = new Float32Array(16);
    this.center = [0, 0, 0];
    this.resize(size);
  }

  resize(size) {
    if (size === this.size) return;
    deleteTarget(this.gl, this.target);
    this.size = size;
    this.target = size > 0 ? createShadowTarget(this.gl, size) : createShadowTarget(this.gl, 1);
  }

  get enabled() {
    return this.size > 1;
  }

  /** Fit the light frustum around the area the camera looks at. */
  fit(camera, lightDir) {
    const f = camera.forward;
    const flat = Math.hypot(f[0], f[2]) || 1;
    const ahead = this.radius * 0.55;
    const c = [camera.pos[0] + (f[0] / flat) * ahead, 0, camera.pos[2] + (f[2] / flat) * ahead];
    // Texel snapping in light space keeps the shadow edges stable.
    const texel = (this.radius * 2) / Math.max(this.size, 1);
    const eye = v3add(c, v3scale(lightDir, 400));
    m4lookAt(eye, c, [0, 1, 0], this.view);
    const sx = this.view[0] * c[0] + this.view[4] * c[1] + this.view[8] * c[2];
    const sy = this.view[1] * c[0] + this.view[5] * c[1] + this.view[9] * c[2];
    const dx = Math.round(sx / texel) * texel - sx;
    const dy = Math.round(sy / texel) * texel - sy;
    this.view[12] += dx;
    this.view[13] += dy;
    m4ortho(-this.radius, this.radius, -this.radius, this.radius, 200, 700, this.proj);
    m4mul(this.proj, this.view, this.viewProj);
    this.center = c;
  }
}
