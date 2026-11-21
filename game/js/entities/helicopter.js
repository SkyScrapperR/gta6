// Rajawali, the police helicopter. Joins at 3 stars, flies in from afar, orbits the player's last
// known position with a searchlight (a real spot light on the ground plus a visible additive beam),
// spots the player for the wanted system, fires bursts at 4+ stars, and can be shot down: it smokes,
// spirals, crashes and explodes (one more star). It leaves when the heat drops below 3 stars.

import { buildHelicopter, VB } from './vehicle-model.js';
import { createProgram } from '../engine/gl.js';
import { GLSL_HEADER } from '../engine/shaders/common.js';
import { m4compose, m4mul, damp, dampAngle, clamp } from '../core/math.js';

const BEAM_VS = `${GLSL_HEADER}
layout(location=0) in vec3 aPos;
uniform mat4 uViewProj;
uniform vec3 uFrom;
uniform vec3 uTo;
uniform float uRadius;
out float vT;
out vec2 vR;
void main() {
  vec3 d = uTo - uFrom;
  vec3 f = normalize(d);
  vec3 s = normalize(cross(f, abs(f.y) > 0.9 ? vec3(1, 0, 0) : vec3(0, 1, 0)));
  vec3 u = cross(s, f);
  float r = mix(0.25, uRadius, aPos.y);
  vec3 p = uFrom + d * aPos.y + (s * aPos.x + u * aPos.z) * r;
  vT = aPos.y;
  vR = aPos.xz;
  gl_Position = uViewProj * vec4(p, 1.0);
}
`;
const BEAM_FS = `${GLSL_HEADER}
in float vT;
in vec2 vR;
uniform float uStrength;
out vec4 fragColor;
void main() {
  float a = (1.0 - vT * 0.75) * 0.06 * uStrength;
  fragColor = vec4(vec3(1.0, 0.97, 0.88) * a, 1.0);
}
`;

export class Helicopter {
  constructor(world) {
    this.w = world;
    this.mesh = buildHelicopter(world.gl);
    this.active = false;
    this.down = false;
    this.x = 0; this.y = 60; this.z = 0;
    this.vx = 0; this.vz = 0;
    this.yaw = 0;
    this.health = 600;
    this.rotor = 0;
    this.orbit = 0;
    this.fireT = 2;
    this.bones = new Float32Array(16 * 16);
    this.model = new Float32Array(16);
    this.beam = createProgram(world.gl, BEAM_VS, BEAM_FS, 'beam');
    const gl = world.gl;
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
    this.spot = [0, 0, 0];
  }

  spawnNear(x, z) {
    this.active = true;
    this.down = false;
    this.leaving = false;
    this.health = 600;
    this.x = x - 120; this.z = z - 160; this.y = 55;
    this.spot = [x, 0, z];
  }

  /** Bullet test: a sphere around the fuselage. */
  hitTest(ox, oy, oz, dx, dy, dz, maxT) {
    if (!this.active || this.down) return null;
    const fx = ox - this.x, fy = oy - (this.y + 1.5), fz = oz - this.z;
    const b = fx * dx + fy * dy + fz * dz;
    const c = fx * fx + fy * fy + fz * fz - 2.6 * 2.6;
    const disc = b * b - c;
    if (disc < 0) return null;
    const t = -b - Math.sqrt(disc);
    return t > 0 && t < maxT ? t : null;
  }

  damage(n) {
    if (this.down) return;
    this.health -= n;
    if (this.health <= 0) {
      this.down = true;
      this.spin = 0;
      this.w.wanted.addStars(1);
      this.w.notes.push({ slot: 'toast', text: 'Rajawali down!', color: '#ffb347', duration: 3 });
    }
  }

  update(dt) {
    const w = this.w;
    const stars = w.wanted.stars;
    if (!this.active) {
      if (stars >= 3 && !w.missionNoCops) this.spawnNear(w.player.x, w.player.z);
      return;
    }
    this.rotor += dt * (this.down ? 14 : 28);
    if (this.down) {
      // Spiral down, then crash and explode.
      this.spin += dt * 3.5;
      this.yaw += dt * this.spin;
      this.y -= dt * (6 + this.spin * 2);
      this.x += Math.sin(this.yaw) * dt * 8;
      this.z += Math.cos(this.yaw) * dt * 8;
      if (Math.random() < dt * 30) w.fx.particles.carSmoke(this.x, this.y + 1, this.z, true);
      if (Math.random() < dt * 20) w.fx.particles.fire(this.x, this.y + 1.5, this.z, 1);
      const g = w.city.groundAt(this.x, this.z);
      if (this.y <= g + 1) {
        w.explosionFx(this.x, g + 1, this.z, 1.8);
        for (const q of w.peds.list) if (Math.hypot(q.x - this.x, q.z - this.z) < 8) q.damage(150, this.x, this.z, 'player');
        this.active = false;
      }
      this.compose();
      return;
    }
    if (stars < 3) this.leaving = true;
    const p = w.player;
    const tgt = w.wanted.seen ? [p.x, p.z] : w.wanted.lastKnown;
    let gx, gz, gy;
    if (this.leaving) {
      gx = this.x + (this.x - p.x); gz = this.z + (this.z - p.z); gy = 90;
      if (Math.hypot(this.x - p.x, this.z - p.z) > 400) { this.active = false; return; }
    } else {
      this.orbit += dt * 0.25;
      gx = tgt[0] + Math.cos(this.orbit) * 26;
      gz = tgt[1] + Math.sin(this.orbit) * 26;
      gy = 30;
    }
    const dx = gx - this.x, dz = gz - this.z;
    const d = Math.hypot(dx, dz) || 1;
    const sp = Math.min(32, d * 0.8);
    this.vx = damp(this.vx, (dx / d) * sp, 1.2, dt);
    this.vz = damp(this.vz, (dz / d) * sp, 1.2, dt);
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.y = damp(this.y, gy, 0.6, dt);
    this.yaw = dampAngle(this.yaw, Math.atan2(tgt[0] - this.x, tgt[1] - this.z), 1.5, dt);
    // Searchlight sweeps around the target, locks on when the player is seen.
    const sweep = w.wanted.seen ? 0 : 6;
    this.spot = [damp(this.spot[0], tgt[0] + Math.sin(w.time * 0.9) * sweep, 3, dt), 0, damp(this.spot[2], tgt[1] + Math.cos(w.time * 0.7) * sweep, 3, dt)];
    this.spot[1] = w.city.groundAt(this.spot[0], this.spot[2]);
    // Bursts at 4+ stars.
    if (stars >= 4 && w.wanted.seen && p.alive) {
      this.fireT -= dt;
      if (this.fireT <= 0) {
        this.fireT = 0.12;
        this.burst = (this.burst ?? 0) + 1;
        if (this.burst > 6) { this.burst = 0; this.fireT = 2.5; }
        const ch = { x: this.x, y: this.y - 1, z: this.z, kind: 'cop', vehicleRef: null, anim: { pose() {}, handMatrix: () => m4compose(0, 0, 0) }, model: m4compose(this.x, this.y - 1, this.z, 0), t: 0 };
        w.combat.npcFire(ch, 'smg', p, 0.15);
      }
    }
    this.compose();
  }

  compose() {
    const tilt = clamp(Math.hypot(this.vx, this.vz) * 0.012, 0, 0.25);
    m4compose(this.x, this.y, this.z, this.yaw, tilt, this.down ? Math.sin(this.spin) * 0.3 : 0, 1, 1, 1, this.model);
    for (let i = 0; i < 16; i++) this.bones.set(m4compose(0, 0, 0), i * 16);
    this.bones.set(m4compose(0, 2.75, 0.2, this.rotor), VB.ROTOR * 16);
    this.bones.set(m4compose(0.25, 2.5, -6.2, 0, this.rotor * 1.7, 0), VB.TAIL * 16);
    void m4mul;
  }

  queue(renderer) {
    if (!this.active) return;
    renderer.draw(this.mesh, { model: this.model, bones: this.bones, paint: null, carLights: [1, 0, Math.sin(this.rotor * 0.3) > 0 ? 1 : 0, Math.sin(this.rotor * 0.3) > 0 ? 0 : 1], damage: this.down ? 0.6 : 0 });
    if (this.down) return;
    const from = [this.x, this.y + 0.5, this.z + 0];
    const s = this.spot;
    const dx = s[0] - from[0], dy = s[1] - from[1], dz = s[2] - from[2];
    const l = Math.hypot(dx, dy, dz) || 1;
    const k = 0.6 + renderer.env.night * 1.4;
    renderer.light(from, l + 20, [14 * k, 13 * k, 11 * k], [dx / l, dy / l, dz / l], 0.985);
    renderer.light([s[0], s[1] + 3, s[2]], 9, [2.5 * k, 2.4 * k, 2.1 * k]);
    renderer.addTransparent((gl) => {
      const p = this.beam;
      gl.useProgram(p.program);
      gl.uniformMatrix4fv(p.u('uViewProj'), false, renderer.camera.viewProj);
      gl.uniform3fv(p.u('uFrom'), from);
      gl.uniform3fv(p.u('uTo'), s);
      gl.uniform1f(p.u('uRadius'), l * Math.tan(Math.acos(0.985)));
      gl.uniform1f(p.u('uStrength'), 0.4 + renderer.env.night * 1.6);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.disable(gl.CULL_FACE);
      gl.bindVertexArray(this.vao);
      gl.drawElements(gl.TRIANGLES, this.beamCount, gl.UNSIGNED_SHORT, 0);
      gl.enable(gl.CULL_FACE);
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    });
  }
}
