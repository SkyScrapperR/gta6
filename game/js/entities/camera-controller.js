// Camera rigs. On foot: mouse-orbit third person that tightens over the right shoulder while aiming
// (the hero sits left of centre). In a car: a lagging chase camera whose FOV widens with speed,
// free-look that re-centres after 1.5 s. Cinematic: externally placed shots. All rigs ray-cast
// against the city so the camera never ends up inside a wall.

import { clamp, damp, dampAngle, lerp, wrapAngle } from '../core/math.js';

export class CameraController {
  constructor(camera, col) {
    this.cam = camera;
    this.col = col;
    this.mode = 'foot';
    this.yaw = 0;
    this.pitch = -0.12;
    this.dist = 4.4;
    this.aimBlend = 0;
    this.lookOffset = 0;
    this.lookPitch = 0;
    this.lookIdle = 0;
    this.carYaw = 0;
    this.fov = 60;
    this.shot = null;
    this.pos = [0, 5, 0];
    this.target = [0, 0, 0];
  }

  /** Forward direction on the ground plane (unit) for camera-relative movement. */
  get forward() {
    return [Math.sin(this.yaw), Math.cos(this.yaw)];
  }

  collide(px, py, pz, cx, cy, cz) {
    const dx = cx - px, dy = cy - py, dz = cz - pz;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-3) return [cx, cy, cz];
    const hit = this.col.raycast(px, py, pz, dx / len, dy / len, dz / len, len + 0.3, (it) => it.type === 'box' && !it.data.ghost && it.data.kind !== 'fence');
    if (hit) {
      const t = Math.max(0.35, hit.t - 0.35);
      return [px + (dx / len) * t, py + (dy / len) * t, pz + (dz / len) * t];
    }
    return [cx, cy, cz];
  }

  /** On-foot rig around a character at (x, y, z). aim 0..1. */
  updateFoot(dt, look, x, y, z, aim) {
    this.mode = 'foot';
    this.yaw = wrapAngle(this.yaw - look[0]);
    this.pitch = clamp(this.pitch - look[1], -1.2, 0.85);
    this.aimBlend = damp(this.aimBlend, aim, 12, dt);
    const a = this.aimBlend;
    const dist = lerp(4.6, 2.3, a);
    const side = lerp(0.35, 0.62, a);
    const height = lerp(1.75, 1.6, a);
    const fwd = [Math.sin(this.yaw), Math.cos(this.yaw)];
    const right = [-fwd[1], fwd[0]];
    const pivot = [x + right[0] * side, y + height, z + right[1] * side];
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const want = [pivot[0] - fwd[0] * cp * dist, pivot[1] - sp * dist, pivot[2] - fwd[1] * cp * dist];
    const p = this.collide(x, y + height, z, want[0], Math.max(want[1], y + 0.4), want[2]);
    this.pos = p;
    this.target = [pivot[0] + fwd[0] * cp * 20, pivot[1] + sp * 20, pivot[2] + fwd[1] * cp * 20];
    this.fov = damp(this.fov, lerp(62, 48, a), 10, dt);
    this.apply();
  }

  /** Chase rig behind a vehicle. */
  updateCar(dt, look, veh) {
    if (this.mode !== 'car') {
      this.carYaw = veh.yaw;
      this.mode = 'car';
    }
    const speed = Math.abs(veh.speed);
    if (Math.abs(look[0]) + Math.abs(look[1]) > 0.0005) {
      this.lookOffset = wrapAngle(this.lookOffset - look[0]);
      this.lookPitch = clamp(this.lookPitch - look[1], -0.5, 0.6);
      this.lookIdle = 0;
    } else {
      this.lookIdle += dt;
      if (this.lookIdle > 1.5 && !this.holdLook) {
        this.lookOffset = dampAngle(this.lookOffset, 0, 3, dt);
        this.lookPitch = damp(this.lookPitch, 0, 3, dt);
      }
    }
    // Follow the direction of travel when reversing slowly the camera still looks ahead of the car.
    const heading = veh.speed < -2 ? veh.yaw : veh.yaw;
    this.carYaw = dampAngle(this.carYaw, heading, lerp(3.5, 6, clamp(speed / 30, 0, 1)), dt);
    const yaw = this.carYaw + this.lookOffset;
    this.yaw = yaw;
    const big = veh.def?.size ?? 1;
    const dist = (6.4 + clamp(speed / 40, 0, 1) * 2.2) * big;
    const height = (2.2 + this.lookPitch * 3) * big;
    const fwd = [Math.sin(yaw), Math.cos(yaw)];
    const piv = [veh.x, veh.y + 1.3 * big, veh.z];
    const want = [piv[0] - fwd[0] * dist, piv[1] + height - 1.0, piv[2] - fwd[1] * dist];
    const p = this.collide(piv[0], piv[1], piv[2], want[0], want[1], want[2]);
    this.pos = [damp(this.pos[0], p[0], 14, dt), damp(this.pos[1], p[1], 10, dt), damp(this.pos[2], p[2], 14, dt)];
    if (Math.hypot(this.pos[0] - p[0], this.pos[2] - p[2]) > 12) this.pos = p;
    this.target = [piv[0] + fwd[0] * 6, piv[1] + 0.2 - this.lookPitch * 2, piv[2] + fwd[1] * 6];
    this.fov = damp(this.fov, 60 + clamp(speed / 45, 0, 1) * 16, 4, dt);
    this.apply();
  }

  /** Externally directed shot (cutscenes, title flythrough). */
  updateShot(dt, pos, target, fov = 50, smooth = 0) {
    this.mode = 'cinematic';
    if (smooth > 0) {
      this.pos = this.pos.map((v, i) => damp(v, pos[i], smooth, dt));
      this.target = this.target.map((v, i) => damp(v, target[i], smooth, dt));
    } else {
      this.pos = pos.slice();
      this.target = target.slice();
    }
    this.fov = fov;
    this.apply();
  }

  apply() {
    this.cam.pos = this.pos;
    this.cam.target = this.target;
    this.cam.fov = (this.fov * Math.PI) / 180;
  }

  /** Point the on-foot rig in a direction (after exiting a car or respawning). */
  face(yaw) {
    this.yaw = yaw;
    this.pitch = -0.12;
  }
}
