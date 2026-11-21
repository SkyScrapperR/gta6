// Arcade car physics and the vehicle system. A car is a bicycle-model body on the ground plane:
// throttle/brake/reverse, speed-sensitive steering, lateral grip that lets go under the handbrake
// (drift with skid marks and tyre smoke), mass-based collisions with the city, props and other cars,
// visual body roll and pitch, damage stages (smoke -> fire -> explosion -> burnt wreck), lights,
// sirens and the door animation used for entering, exiting and carjacking.

import { VEHICLES, VB, buildVehicle, doorHinge } from './vehicle-model.js';
import { m4compose, m4mul, clamp, damp, wrapAngle, lerp, hex } from '../core/math.js';

let nextId = 1;

export class Vehicle {
  constructor(sys, type, x, z, yaw, opts = {}) {
    const d = VEHICLES[type];
    this.id = nextId++;
    this.sys = sys;
    this.type = type;
    this.def = d;
    this.x = x;
    this.z = z;
    this.y = sys.city.groundAt(x, z);
    this.yaw = yaw;
    this.speed = 0;
    this.vlat = 0;
    this.yawRate = 0;
    this.steer = 0;
    this.throttle = 0;
    this.brake = 0;
    this.handbrake = false;
    this.paint = hex(opts.color ?? d.colors[Math.floor((opts.colorSeed ?? Math.random()) * d.colors.length) % d.colors.length]);
    this.health = opts.health ?? 1000;
    this.maxHealth = 1000;
    this.burning = 0;
    this.wrecked = false;
    this.wreckTimer = 0;
    this.parked = !!opts.parked;
    this.driver = opts.driver ?? null; // 'player' | ai controller | ped
    this.ai = null;
    this.mission = opts.mission ?? null;
    this.police = !!d.police;
    this.siren = false;
    this.horn = false;
    this.lightsOn = false;
    this.braking = false;
    this.doors = [0, 0];
    this.doorTarget = [0, 0];
    this.wheelSpin = 0;
    this.roll = 0;
    this.pitch = 0;
    this.susp = 0;
    this.bones = new Float32Array(16 * 16);
    this.model = new Float32Array(16);
    this.skidTimer = 0;
    this.lastImpact = 0;
    this.radius = d.wid / 2;
    this.halfLen = d.len / 2 - d.wid / 2 + 0.1;
    this.passenger = null;
    this.sirenPhase = Math.random() * 10;
  }

  get forward() {
    return [Math.sin(this.yaw), Math.cos(this.yaw)];
  }

  get right() {
    const f = this.forward;
    return [-f[1], f[0]];
  }

  /** The two collision circle centres (front and rear). */
  circles() {
    const f = this.forward;
    return [[this.x + f[0] * this.halfLen, this.z + f[1] * this.halfLen], [this.x - f[0] * this.halfLen, this.z - f[1] * this.halfLen]];
  }

  /** Where someone stands to use the driver's door (right-hand drive: +X side of the body). */
  doorPoint(side = 0) {
    const f = this.forward, r = this.right;
    const s = side === 0 ? -1 : 1; // body +X is the car's right = -left
    const dz = this.def.cabin[0] - 0.6;
    return [this.x + f[0] * dz - r[0] * s * (this.def.wid / 2 + 0.7), this.z + f[1] * dz - r[1] * s * (this.def.wid / 2 + 0.7)];
  }

  /** Seat position in world space (driver). */
  seatPoint() {
    const f = this.forward, r = this.right;
    return [this.x + f[0] * -0.25 + r[0] * 0.38, this.z + f[1] * -0.25 + r[1] * 0.38];
  }

  damage(amount, source = null) {
    if (this.wrecked) return;
    this.health -= amount;
    if (source) this.lastDamager = source;
    if (this.health <= 0) this.explode();
  }

  explode() {
    if (this.wrecked) return;
    this.wrecked = true;
    this.health = 0;
    this.burning = 0;
    this.speed *= 0.3;
    this.siren = false;
    this.sys.onExplode?.(this);
  }

  /** Physics step. Inputs: throttle -1..1 (S reverses), steer -1..1 (positive = right), handbrake. */
  step(dt) {
    const d = this.def;
    const col = this.sys.city.col;
    if (this.wrecked) {
      this.throttle = 0;
      this.handbrake = true;
    }
    // Parked cars stay put until something hits them.
    if (this.parked && !this.driver && Math.abs(this.speed) < 0.05 && Math.abs(this.vlat) < 0.05) {
      this.speed = 0;
      this.vlat = 0;
      this.updateVisual(dt);
      return;
    }
    const thr = this.throttle;
    const fwdSpeed = this.speed;
    let accel = 0;
    this.braking = false;
    if (thr > 0) {
      if (fwdSpeed < -0.5) { accel = 22; this.braking = true; }
      else accel = thr * d.accel * (1 - clamp(fwdSpeed / d.top, 0, 1) ** 2);
    } else if (thr < 0) {
      if (fwdSpeed > 0.5) { accel = -22; this.braking = true; }
      else accel = thr * d.accel * 0.55 * (fwdSpeed > -12 ? 1 : 0);
    }
    if (this.brake > 0) {
      accel = -Math.sign(fwdSpeed) * 24 * this.brake;
      this.braking = true;
    }
    if (this.handbrake) {
      accel -= Math.sign(fwdSpeed) * Math.min(Math.abs(fwdSpeed) / dt, 7);
      this.braking = true;
    }
    // Rolling resistance and drag.
    accel -= fwdSpeed * 0.09 + Math.sign(fwdSpeed) * 0.4 * (thr === 0 ? 1 : 0) + fwdSpeed * Math.abs(fwdSpeed) * 0.0012;
    this.speed += accel * dt;
    if (thr === 0 && this.brake === 0 && Math.abs(this.speed) < 0.3) this.speed = 0;
    // Steering: less lock at speed.
    const maxSteer = d.steer / (1 + Math.abs(this.speed) * 0.045);
    this.steerAngle = damp(this.steerAngle ?? 0, this.steer * maxSteer, 8, dt);
    const wheelbase = d.axle[0] - d.axle[1];
    const targetRate = (this.speed * Math.tan(this.steerAngle)) / wheelbase;
    const grip = this.handbrake ? 1.4 : d.grip;
    this.yawRate = damp(this.yawRate, targetRate * (this.handbrake ? 1.35 : 1), grip, dt);
    this.yaw = wrapAngle(this.yaw + this.yawRate * dt);
    // Lateral slip: centrifugal push, damped by tyre grip.
    this.vlat += -this.yawRate * this.speed * (this.handbrake ? 0.55 : 0.12) * dt;
    this.vlat *= Math.exp(-grip * dt);
    const slip = Math.abs(this.vlat);
    this.drifting = slip > 2.2 && Math.abs(this.speed) > 6;
    // Integrate.
    const f = this.forward, r = this.right;
    let nx = this.x + (f[0] * this.speed + r[0] * this.vlat) * dt;
    let nz = this.z + (f[1] * this.speed + r[1] * this.vlat) * dt;
    // World collision with two circles.
    let impact = 0;
    for (const sgn of [1, -1]) {
      const cx = nx + f[0] * this.halfLen * sgn, cz = nz + f[1] * this.halfLen * sgn;
      const res = col.resolveCircle(cx, cz, this.radius, this.y, 1.4, null);
      if (res.hit) {
        if (res.item?.data.breakable && Math.abs(this.speed) > 4) {
          this.sys.onPropHit?.(res.item.data.prop, this);
          this.speed *= 0.82;
          continue;
        }
        const nxp = res.x - cx, nzp = res.z - cz;
        nx += nxp;
        nz += nzp;
        const vn = (f[0] * this.speed + r[0] * this.vlat) * res.nx + (f[1] * this.speed + r[1] * this.vlat) * res.nz;
        if (vn < 0) {
          impact = Math.max(impact, -vn);
          // Remove the velocity into the wall, keep a little bounce.
          const vx = f[0] * this.speed + r[0] * this.vlat - res.nx * vn * 1.25;
          const vz = f[1] * this.speed + r[1] * this.vlat - res.nz * vn * 1.25;
          this.speed = vx * f[0] + vz * f[1];
          this.vlat = vx * r[0] + vz * r[1];
        }
      }
    }
    this.x = nx;
    this.z = nz;
    if (impact > 3) this.onImpact(impact, null);
    // Ground height and sea.
    const g = this.sys.city.groundAt(this.x, this.z);
    this.y = damp(this.y, g, 12, dt);
    if (this.y < -1.2 && !this.wrecked) this.damage(2000);
    // Visual body motion.
    this.updateVisual(dt, accel);
  }

  onImpact(speed, other) {
    if (speed > this.lastImpact) this.lastImpact = speed;
    const dmg = Math.max(0, speed - 4) * 14 * (other ? 1 : 0.8);
    this.damage(dmg, other);
    this.sys.onCrash?.(this, speed, other);
  }

  updateVisual(dt, accel = 0) {
    const d = this.def;
    this.wheelSpin += (this.speed / d.wheel) * dt;
    const latG = this.yawRate * this.speed;
    this.roll = damp(this.roll, clamp(-latG * 0.012, -0.09, 0.09), 6, dt);
    this.pitch = damp(this.pitch, clamp(-accel * 0.006, -0.06, 0.06), 6, dt);
    for (let k = 0; k < 2; k++) this.doors[k] = damp(this.doors[k], this.doorTarget[k], 9, dt);
    if (this.health < 350 && !this.wrecked) this.burning += dt;
    if (this.burning > 9) this.explode();
    this.sirenPhase += dt;
    this.compose();
  }

  compose() {
    const d = this.def;
    m4compose(this.x, this.y, this.z, this.yaw, 0, 0, 1, 1, 1, this.model);
    const body = m4compose(0, this.susp, 0, 0, this.pitch, this.roll);
    this.bones.set(body, VB.BODY * 16);
    const W = d.wid / 2 - (d.truck ? 0.25 : 0.14);
    const st = (this.steerAngle ?? 0);
    const wheels = [[VB.FL, W, d.axle[0], st], [VB.FR, -W, d.axle[0], st], [VB.RL, W, d.axle[1], 0], [VB.RR, -W, d.axle[1], 0]];
    for (const [bone, x, z, s] of wheels) this.bones.set(m4compose(x, d.wheel, z, s, this.wheelSpin, 0), bone * 16);
    if (!d.truck) {
      const [hl, hr] = doorHinge(this.type);
      this.bones.set(m4mul(body, m4compose(hl[0], hl[1], hl[2], -1.1 * this.doors[0])), VB.DOOR_L * 16);
      this.bones.set(m4mul(body, m4compose(hr[0], hr[1], hr[2], 1.1 * this.doors[1])), VB.DOOR_R * 16);
    }
  }

  carLights(night) {
    const head = this.wrecked ? 0 : this.lightsOn || night > 0.3 || this.police ? 1 : 0;
    const brake = this.braking && !this.wrecked ? 1 : 0;
    let r = 0, b = 0;
    if (this.siren && !this.wrecked) {
      const t = this.sirenPhase * 6;
      r = Math.sin(t) > 0 ? 1 : 0.1;
      b = Math.sin(t) > 0 ? 0.1 : 1;
      if (Math.sin(t * 3.1) > 0.6) r = b = 1;
    }
    return [head, brake, r, b];
  }
}

export class VehicleSystem {
  constructor(gl, city) {
    this.gl = gl;
    this.city = city;
    this.list = [];
    this.meshes = {};
    for (const t of Object.keys(VEHICLES)) this.meshes[t] = buildVehicle(gl, t);
  }

  spawn(type, x, z, yaw, opts = {}) {
    const v = new Vehicle(this, type, x, z, yaw, opts);
    this.list.push(v);
    return v;
  }

  remove(v) {
    const i = this.list.indexOf(v);
    if (i >= 0) this.list.splice(i, 1);
  }

  /** Nearest vehicle whose driver door is within reach. */
  nearestEnterable(x, z, maxDist = 4.5) {
    let best = null, bd = maxDist;
    for (const v of this.list) {
      if (v.wrecked) continue;
      const d0 = v.doorPoint(0), d1 = v.doorPoint(1);
      const d = Math.min(Math.hypot(d0[0] - x, d0[1] - z), Math.hypot(d1[0] - x, d1[1] - z), Math.hypot(v.x - x, v.z - z) - 1.2);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  /** Car-vs-car collisions: circle pairs, mass-weighted impulses. */
  collidePairs() {
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (Math.abs(a.x - b.x) > 9 || Math.abs(a.z - b.z) > 9) continue;
        if (a.parked && b.parked && !a.driver && !b.driver) continue;
        for (const ca of a.circles()) {
          for (const cb of b.circles()) {
            const dx = ca[0] - cb[0], dz = ca[1] - cb[1];
            const dist = Math.hypot(dx, dz);
            const min = a.radius + b.radius;
            if (dist >= min || dist < 1e-4) continue;
            const nx = dx / dist, nz = dz / dist;
            const pen = min - dist;
            const ma = a.def.mass, mb = b.def.mass;
            const wa = mb / (ma + mb), wb = ma / (ma + mb);
            a.x += nx * pen * wa; a.z += nz * pen * wa;
            b.x -= nx * pen * wb; b.z -= nz * pen * wb;
            // Relative velocity along the normal.
            const fa = a.forward, ra = a.right, fb = b.forward, rb = b.right;
            const vax = fa[0] * a.speed + ra[0] * a.vlat, vaz = fa[1] * a.speed + ra[1] * a.vlat;
            const vbx = fb[0] * b.speed + rb[0] * b.vlat, vbz = fb[1] * b.speed + rb[1] * b.vlat;
            const rel = (vax - vbx) * nx + (vaz - vbz) * nz;
            if (rel >= 0) continue;
            const imp = -rel * 1.3;
            const avx = vax + nx * imp * wa, avz = vaz + nz * imp * wa;
            const bvx = vbx - nx * imp * wb, bvz = vbz - nz * imp * wb;
            a.speed = avx * fa[0] + avz * fa[1]; a.vlat = avx * ra[0] + avz * ra[1];
            b.speed = bvx * fb[0] + bvz * fb[1]; b.vlat = bvx * rb[0] + bvz * rb[1];
            if (a.parked) a.parked = false;
            if (b.parked) b.parked = false;
            a.parkedHit = b.parkedHit = true;
            if (-rel > 3) {
              a.onImpact(-rel * wa * 1.4, b);
              b.onImpact(-rel * wb * 1.4, a);
            }
          }
        }
      }
    }
  }

  update(dt) {
    for (const v of this.list) v.step(dt);
    this.collidePairs();
    for (const v of this.list) {
      // Cars knocked loose by a crash come to rest quickly and become parked again.
      if (v.parkedHit && !v.driver) {
        v.speed *= Math.exp(-3 * dt);
        v.vlat *= Math.exp(-3 * dt);
        if (Math.abs(v.speed) < 0.1 && Math.abs(v.vlat) < 0.1) { v.parked = true; v.parkedHit = false; }
      }
      if (v.wrecked) v.wreckTimer += dt;
    }
  }

  queue(renderer, night, camX, camZ) {
    for (const v of this.list) {
      if (Math.abs(v.x - camX) > 300 || Math.abs(v.z - camZ) > 300) continue;
      renderer.draw(this.meshes[v.type], {
        model: v.model,
        bones: v.bones,
        paint: v.wrecked ? [0.05, 0.045, 0.04] : v.paint,
        carLights: v.carLights(night),
        damage: v.wrecked ? 1 : clamp((700 - v.health) / 900, 0, 0.6),
      });
    }
  }
}

export { lerp };
