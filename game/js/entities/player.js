// Kai on foot: camera-relative WASD movement with acceleration, sprint with a stamina bar, jump hop,
// kerb stepping, circle collision against the city, health/armor and the animation state the
// renderer reads. Vehicle entry/exit and combat hook in from their own systems.

import { clamp, damp, dampAngle, wrapAngle } from '../core/math.js';
import { buildCharacter, Animator, LOOKS } from './character-model.js';
import { m4compose } from '../core/math.js';
import { CarEntry } from './car-entry.js';

export class Player {
  constructor(gl, city) {
    this.city = city;
    this.mesh = buildCharacter(gl, LOOKS.kai);
    this.anim = new Animator(1.0);
    this.x = 0;
    this.y = 0;
    this.z = 0;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.yaw = 0;
    this.speed = 0;
    this.phase = 0;
    this.air = false;
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 0;
    this.stamina = 1;
    this.sprintLock = false;
    this.vehicle = null;
    this.seat = 0; // 0..1 blend into the seated pose
    this.transition = null; // car door enter/exit sequence
    this.aim = 0;
    this.aimPitch = 0;
    this.punch = 0;
    this.punchSide = 0;
    this.hitT = 0;
    this.dead = 0;
    this.cuffed = 0;
    this.recoil = 0;
    this.radius = 0.35;
    this.visible = true;
    this.safeTimer = 0;
    this.t = 0;
    this.model = new Float32Array(16);
  }

  place(x, z, yaw = 0) {
    this.x = x;
    this.z = z;
    this.y = this.city.groundAt(x, z);
    this.yaw = yaw;
    this.vx = this.vz = this.vy = 0;
    this.dead = 0;
    this.cuffed = 0;
  }

  get alive() {
    return this.dead === 0 && this.cuffed === 0;
  }

  /** Damage with armor absorbing first. Returns true if this killed the player. */
  damage(amount, fromX = null, fromZ = null) {
    if (!this.alive || this.god) return false;
    const absorbed = Math.min(this.armor, amount * 0.7);
    this.armor -= absorbed;
    this.health -= amount - absorbed;
    this.hitT = 1;
    if (fromX !== null) this.lastHitFrom = [fromX, fromZ];
    if (this.health <= 0) {
      this.health = 0;
      this.dead = 0.001;
      return true;
    }
    return false;
  }

  /** Movement on foot. input: Input; camYaw: camera heading; aiming: boolean. */
  updateFoot(dt, input, camYaw, aiming, controlsOn = true) {
    this.t += dt;
    if (this.dead > 0) {
      this.dead = Math.min(1.5, this.dead + dt * 1.4);
      this.vx = this.vz = 0;
      return;
    }
    if (this.cuffed > 0) {
      this.cuffed = Math.min(1, this.cuffed + dt * 2);
      return;
    }
    const f = controlsOn ? input.axis('KeyS', 'KeyW') : 0;
    const s = controlsOn ? input.axis('KeyA', 'KeyD') : 0;
    const fwd = [Math.sin(camYaw), Math.cos(camYaw)];
    const right = [-fwd[1], fwd[0]];
    let dx = fwd[0] * f + right[0] * s;
    let dz = fwd[1] * f + right[1] * s;
    const len = Math.hypot(dx, dz);
    if (len > 1) { dx /= len; dz /= len; }
    const wantsSprint = controlsOn && input.isDown('ShiftLeft') && len > 0.1 && !aiming;
    if (this.stamina <= 0.02) this.sprintLock = true;
    if (this.sprintLock && this.stamina > 0.3) this.sprintLock = false;
    const sprint = wantsSprint && !this.sprintLock;
    this.stamina = clamp(this.stamina + (sprint ? -0.22 : 0.16) * dt, 0, 1);
    const top = aiming ? 2.2 : sprint ? 7.2 : 3.6;
    const ax = dx * top, az = dz * top;
    const accel = this.air ? 2 : 10;
    this.vx = damp(this.vx, ax, accel, dt);
    this.vz = damp(this.vz, az, accel, dt);
    // Body faces movement, or the camera while aiming.
    if (aiming) this.yaw = dampAngle(this.yaw, camYaw, 18, dt);
    else if (len > 0.1) this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 10, dt);
    // Jump.
    if (controlsOn && input.pressed('Space') && !this.air) {
      this.vy = 4.6;
      this.air = true;
    }
    this.integrate(dt);
  }

  integrate(dt) {
    let nx = this.x + this.vx * dt;
    let nz = this.z + this.vz * dt;
    const ground = this.city.groundAt(nx, nz);
    // Step up kerbs (<= 0.45 m); higher ledges block like walls.
    if (!this.air && ground - this.y > 0.45) {
      nx = this.x;
      nz = this.z;
    }
    const r = this.city.col.resolveCircle(nx, nz, this.radius, this.y, 1.8);
    this.x = r.x;
    this.z = r.z;
    const g = this.city.groundAt(this.x, this.z);
    if (this.air) {
      this.vy -= 13 * dt;
      this.y += this.vy * dt;
      if (this.y <= g) {
        this.y = g;
        this.vy = 0;
        this.air = false;
      }
    } else {
      // Fall off ledges (pier edges, beach slope) smoothly, snap up kerbs.
      if (g < this.y - 0.5) {
        this.air = true;
        this.vy = 0;
      } else this.y = damp(this.y, g, 20, dt);
    }
    const sp = Math.hypot(this.vx, this.vz);
    this.speed = sp;
    this.phase += dt * (sp < 4 ? 2.1 + sp * 1.55 : 3.4 + sp * 0.95);
  }

  updateAnim(dt) {
    this.hitT = Math.max(0, this.hitT - dt * 3.5);
    this.punch = this.punch > 0 ? this.punch + dt * 3.6 : 0;
    if (this.punch > 1) this.punch = 0;
    this.recoil = Math.max(0, this.recoil - dt * 8);
    this.anim.pose({
      t: this.t,
      speed: this.vehicle ? 0 : this.speed,
      phase: this.phase,
      air: this.air && !this.vehicle,
      aim: this.aim,
      aimPitch: this.aimPitch,
      twoHanded: this.twoHanded,
      recoil: this.recoil,
      punch: this.punch,
      punchSide: this.punchSide,
      hit: this.hitT,
      dead: this.dead,
      seated: this.seat,
      steer: this.steerPose ?? 0,
      handsUp: this.cuffed,
      talk: this.talk ?? 0,
    });
  }

  /** World matrix for the character root. */
  matrix() {
    m4compose(this.x, this.y, this.z, this.yaw, 0, 0, 1, 1, 1, this.model);
    return this.model;
  }

  queue(renderer, night, cine = false) {
    if (!this.visible) return;
    if (cine) {
      renderer.draw(this.mesh, { model: this.vehicle ? CarEntry.seatMatrix(this.vehicle) : this.matrix(), bones: this.anim.bones, rim: [1, 0.8, 0.55, 0.28 + night * 0.2] });
      return;
    }
    renderer.draw(this.mesh, {
      model: this.vehicle ? CarEntry.seatMatrix(this.vehicle) : this.matrix(),
      bones: this.anim.bones,
      rim: [0.35, 0.95, 0.9, 0.06 + night * 0.22],
    });
  }

  /** Point the character so the camera can follow (used after spawns). */
  faceDirection(yaw) {
    this.yaw = wrapAngle(yaw);
  }
}
