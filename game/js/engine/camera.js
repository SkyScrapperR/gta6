// Perspective camera: eye, target, fov; builds view/projection matrices and its frustum.

import { m4lookAt, m4perspective, m4mul, m4invert, v3norm, v3sub } from '../core/math.js';
import { Frustum } from './frustum.js';

export class Camera {
  constructor() {
    this.pos = [0, 10, -20];
    this.target = [0, 0, 0];
    this.up = [0, 1, 0];
    this.fov = (60 * Math.PI) / 180;
    this.near = 0.25;
    this.far = 1600;
    this.aspect = 16 / 9;
    this.view = new Float32Array(16);
    this.proj = new Float32Array(16);
    this.viewProj = new Float32Array(16);
    this.invViewProj = new Float32Array(16);
    this.frustum = new Frustum();
    this.shake = 0;
    this.shakeT = 0;
  }

  get forward() {
    return v3norm(v3sub(this.target, this.pos));
  }

  /** Yaw of the view direction on the ground plane (0 = +Z). */
  get heading() {
    const f = this.forward;
    return Math.atan2(f[0], f[2]);
  }

  addShake(amount) {
    this.shake = Math.min(1.5, this.shake + amount);
  }

  update(dt) {
    let eye = this.pos;
    if (this.shake > 0.001) {
      this.shakeT += dt * 40;
      const s = this.shake * this.shake * 0.35;
      eye = [eye[0] + Math.sin(this.shakeT * 1.1) * s, eye[1] + Math.sin(this.shakeT * 1.7 + 1) * s, eye[2] + Math.sin(this.shakeT * 1.3 + 2) * s];
      this.shake = Math.max(0, this.shake - dt * 1.8);
    }
    m4lookAt(eye, this.target, this.up, this.view);
    m4perspective(this.fov, this.aspect, this.near, this.far, this.proj);
    m4mul(this.proj, this.view, this.viewProj);
    m4invert(this.viewProj, this.invViewProj);
    this.frustum.setFromMatrix(this.viewProj);
    this.eye = eye;
  }
}
