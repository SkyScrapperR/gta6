// Pedestrians. They walk the sidewalk loop around each block, cross at zebra crossings, stop to idle,
// look at their phones or chat in pairs, flee from gunfire and explosions, dive away from speeding
// cars, get knocked down when hit and drop cash when they die (non-graphic: they just lie still).
// The same Ped class also carries cops, gang members and story characters with scripted brains.

import { Animator } from './animator.js';
import { CarEntry } from './car-entry.js';
import { LOOKS, randomLook } from './looks.js';
import { clamp, damp, dampAngle, makeRng, m4compose } from '../core/math.js';
import { PITCH, GRID } from '../world/layout.js';

let pedId = 1;

export class Ped {
  constructor(sys, meshKey, x, z, opts = {}) {
    this.id = pedId++;
    this.sys = sys;
    this.meshKey = meshKey;
    this.x = x;
    this.z = z;
    this.y = sys.world.city.groundAt(x, z);
    this.yaw = opts.yaw ?? 0;
    this.vx = 0;
    this.vz = 0;
    this.speed = 0;
    this.phase = Math.random() * 6;
    this.t = Math.random() * 10;
    this.state = opts.state ?? 'walk';
    this.stateT = 0;
    this.health = opts.health ?? 40;
    this.maxHealth = this.health;
    this.dead = 0;
    this.down = 0;
    this.hitT = 0;
    this.aim = 0;
    this.punch = 0;
    this.talk = 0;
    this.phone = 0;
    this.handsUp = 0;
    this.kind = opts.kind ?? 'civ'; // civ | cop | gang | story
    this.walkSpeed = opts.walkSpeed ?? 1.15 + Math.random() * 0.45;
    this.ring = null;
    this.s = 0;
    this.dir = 1;
    this.anim = new Animator(opts.height ?? 1);
    this.model = new Float32Array(16);
    this.brain = null; // police / gang / story controller
    this.radius = 0.32;
    this.cash = opts.cash ?? Math.floor(5 + Math.random() * 40);
  }

  get alive() {
    return this.dead === 0;
  }

  damage(amount, fromX, fromZ, source = null) {
    if (this.dead) return false;
    this.health -= amount;
    this.hitT = 1;
    if (fromX !== undefined) this.threat = [fromX, fromZ];
    if (this.health <= 0) {
      this.dead = 0.001;
      this.state = 'dead';
      this.sys.onPedKilled?.(this, source);
      return true;
    }
    if (this.kind === 'civ') this.flee(fromX ?? this.x, fromZ ?? this.z);
    this.brain?.onHurt?.(this, source);
    return false;
  }

  flee(fx, fz, time = 8) {
    if (this.dead || this.kind !== 'civ' || this.state === 'scripted') return;
    this.threat = [fx, fz];
    this.state = 'flee';
    this.stateT = time;
    this.talk = 0;
    this.phone = 0;
  }

  knockDown(fromX, fromZ, impact) {
    if (this.dead) return;
    this.damage(impact, fromX, fromZ, 'vehicle');
    if (!this.dead) {
      this.state = 'down';
      this.stateT = 2.4;
    }
    this.vx = (this.x - fromX) * 2;
    this.vz = (this.z - fromZ) * 2;
  }

  /** Steer towards a point at speed; returns distance left. */
  moveTo(dt, tx, tz, speed, collide = true) {
    const dx = tx - this.x, dz = tz - this.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      this.vx = damp(this.vx, (dx / d) * speed, 8, dt);
      this.vz = damp(this.vz, (dz / d) * speed, 8, dt);
      this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 9, dt);
    }
    this.integrate(dt, collide);
    return d;
  }

  integrate(dt, collide = true) {
    let nx = this.x + this.vx * dt, nz = this.z + this.vz * dt;
    if (collide) {
      const r = this.sys.world.city.col.resolveCircle(nx, nz, this.radius, this.y, 1.7);
      // Slide around building corners instead of snagging: nudge along the wall tangent.
      if (r.hit && Math.hypot(this.vx, this.vz) > 0.5) {
        const tx = -r.nz, tz = r.nx;
        const s = Math.sign(this.vx * tx + this.vz * tz) || 1;
        nx = r.x + tx * s * 0.6 * dt;
        nz = r.z + tz * s * 0.6 * dt;
      } else {
        nx = r.x;
        nz = r.z;
      }
    }
    this.x = nx;
    this.z = nz;
    this.y = damp(this.y, this.sys.world.city.groundAt(this.x, this.z), 15, dt);
    this.speed = Math.hypot(this.vx, this.vz);
    this.phase += dt * (this.speed < 4 ? 2.1 + this.speed * 1.55 : 3.4 + this.speed * 0.95);
  }

  /** Point on the current sidewalk ring at arc length s. */
  ringPoint(s) {
    const r = this.ring;
    const w = r.x1 - r.x0, h = r.z1 - r.z0;
    const per = 2 * (w + h);
    s = ((s % per) + per) % per;
    if (s < w) return [r.x0 + s, r.z0];
    if (s < w + h) return [r.x1, r.z0 + (s - w)];
    if (s < 2 * w + h) return [r.x1 - (s - w - h), r.z1];
    return [r.x0, r.z1 - (s - 2 * w - h)];
  }

  update(dt) {
    this.t += dt;
    this.stateT -= dt;
    this.hitT = Math.max(0, this.hitT - dt * 3);
    if (this.punch > 0) { this.punch += dt * 3.2; if (this.punch > 1) this.punch = 0; }
    if (this.dead) {
      this.dead = Math.min(1.5, this.dead + dt * 1.6);
      this.vx = damp(this.vx, 0, 5, dt);
      this.vz = damp(this.vz, 0, 5, dt);
      this.integrate(dt, false);
      this.speed = 0;
      return;
    }
    if (this.brain) {
      this.brain.update(dt, this);
      return;
    }
    const sys = this.sys;
    switch (this.state) {
      case 'walk': {
        if (!this.ring) { this.state = 'idle'; break; }
        const w = this.ring.x1 - this.ring.x0, h = this.ring.z1 - this.ring.z0;
        const per = 2 * (w + h);
        const prevS = this.s;
        this.s = (this.s + this.dir * this.walkSpeed * dt + per) % per;
        const tp = this.ringPoint(this.s + this.dir * 1.5);
        this.moveTo(dt, tp[0], tp[1], this.walkSpeed);
        // Pull back onto the loop if pushed off it.
        const cp = this.ringPoint(this.s);
        if (Math.hypot(cp[0] - this.x, cp[1] - this.z) > 3) this.s = this.nearestS();
        // Corners: maybe cross the road at the zebra.
        const corners = [0, w, w + h, 2 * w + h];
        for (const c of corners) {
          const crossed = this.dir > 0 ? prevS < c && this.s >= c : prevS > c && this.s <= c;
          if (crossed && Math.random() < 0.3) this.tryCross(c === 0 ? 0 : c === w ? 1 : c === w + h ? 2 : 3);
        }
        if (this.stateT < -8 && Math.random() < dt * 0.08) {
          this.state = 'idle';
          this.stateT = 2 + Math.random() * 5;
          this.phone = Math.random() < 0.5 ? 0.001 : 0;
        }
        break;
      }
      case 'idle':
      case 'chat': {
        this.vx = damp(this.vx, 0, 6, dt);
        this.vz = damp(this.vz, 0, 6, dt);
        this.integrate(dt);
        if (this.phone > 0) this.phone = Math.min(1, this.phone + dt * 2);
        if (this.state === 'chat') {
          this.talk = 0.6 + 0.4 * Math.sin(this.t * 0.7 + this.id);
          if (this.partner) this.yaw = dampAngle(this.yaw, Math.atan2(this.partner.x - this.x, this.partner.z - this.z), 5, dt);
        }
        if (this.stateT <= 0 && this.state === 'idle') {
          this.state = 'walk';
          this.phone = 0;
          this.stateT = 0;
          if (Math.random() < 0.5) this.dir = -this.dir;
        }
        break;
      }
      case 'cross': {
        const d = this.moveTo(dt, this.crossTo[0], this.crossTo[1], this.walkSpeed * 1.15, false);
        if (d < 0.5) {
          this.ring = this.crossRing;
          this.s = this.nearestS();
          this.state = 'walk';
        }
        break;
      }
      case 'flee': {
        if (!this.threat) this.threat = [this.x - this.vx - 0.1, this.z - this.vz];
        const [fx, fz] = this.threat;
        let dx = this.x - fx, dz = this.z - fz;
        const d = Math.hypot(dx, dz) || 1;
        dx /= d; dz /= d;
        this.vx = damp(this.vx, dx * 5.6, 5, dt);
        this.vz = damp(this.vz, dz * 5.6, 5, dt);
        this.yaw = dampAngle(this.yaw, Math.atan2(this.vx, this.vz), 10, dt);
        this.integrate(dt);
        if (this.stateT <= 0) {
          this.ring = sys.ringNear(this.x, this.z);
          this.s = this.ring ? this.nearestS() : 0;
          this.state = this.ring ? 'walk' : 'idle';
          this.stateT = 3;
        }
        break;
      }
      case 'dive': {
        this.vx = damp(this.vx, 0, 2.5, dt);
        this.vz = damp(this.vz, 0, 2.5, dt);
        this.integrate(dt);
        this.down = Math.max(this.down, Math.min(0.6, (0.9 - this.stateT) * 2));
        if (this.stateT <= 0) { this.state = 'flee'; this.stateT = 4; this.down = 0; }
        break;
      }
      case 'down': {
        this.vx = damp(this.vx, 0, 4, dt);
        this.vz = damp(this.vz, 0, 4, dt);
        this.integrate(dt);
        this.down = this.stateT > 0.6 ? Math.min(1, this.down + dt * 3) : Math.max(0, this.down - dt * 2);
        if (this.stateT <= 0) { this.down = 0; this.flee(this.x - this.vx, this.z - this.vz, 6); }
        break;
      }
      case 'scripted':
        this.vx = damp(this.vx, 0, 6, dt);
        this.vz = damp(this.vz, 0, 6, dt);
        this.integrate(dt);
        break;
      default:
        break;
    }
  }

  nearestS() {
    const r = this.ring;
    const w = r.x1 - r.x0, h = r.z1 - r.z0;
    const cx = clamp(this.x, r.x0, r.x1), cz = clamp(this.z, r.z0, r.z1);
    const dl = [Math.abs(cz - r.z0), Math.abs(this.x - r.x1), Math.abs(cz - r.z1), Math.abs(this.x - r.x0)];
    const m = Math.min(...dl);
    if (m === dl[0]) return cx - r.x0;
    if (m === dl[1]) return w + (cz - r.z0);
    if (m === dl[2]) return w + h + (r.x1 - cx);
    return 2 * w + h + (r.z1 - cz);
  }

  /** At corner c (0 NW, 1 NE, 2 SE, 3 SW) cross to the neighbouring block's sidewalk. */
  tryCross(c) {
    const r = this.ring;
    const opts = [];
    const add = (di, dj, tx, tz) => {
      const nr = this.sys.ringAt(r.i + di, r.j + dj);
      if (nr) opts.push([nr, tx, tz]);
    };
    const X = [r.x0, r.x1, r.x1, r.x0][c], Z = [r.z0, r.z0, r.z1, r.z1][c];
    const gap = 2 * (r.x0 - r.i * PITCH);
    if (c === 0) { add(0, -1, X, Z - gap); add(-1, 0, X - gap, Z); }
    if (c === 1) { add(0, -1, X, Z - gap); add(1, 0, X + gap, Z); }
    if (c === 2) { add(0, 1, X, Z + gap); add(1, 0, X + gap, Z); }
    if (c === 3) { add(0, 1, X, Z + gap); add(-1, 0, X - gap, Z); }
    if (!opts.length) return;
    const [nr, tx, tz] = opts[Math.floor(Math.random() * opts.length)];
    // Use the zebra a few metres in from the corner.
    const along = Math.abs(tx - X) > 0.1 ? 0 : 1;
    const shift = along ? (c === 0 || c === 3 ? 1.5 : -1.5) : (c < 2 ? 1.5 : -1.5);
    this.crossFrom = along ? [X + shift, Z] : [X, Z + shift];
    this.crossTo = along ? [tx + shift, tz] : [tx, tz + shift];
    this.crossRing = nr;
    this.state = 'cross';
  }

  pose() {
    this.anim.pose({
      t: this.t, speed: this.speed, phase: this.phase, aim: this.aim, aimPitch: this.aimPitch ?? 0, twoHanded: this.twoHanded,
      punch: this.punch, punchSide: this.punchSide, hit: this.hitT, dead: Math.max(this.dead, this.down * 0.8),
      talk: this.talk, phone: this.phone, handsUp: this.handsUp, seated: this.seated ?? 0,
    });
  }
}

export class PedSystem {
  constructor(world) {
    this.world = world;
    this.gl = world.gl;
    this.list = [];
    this.meshes = new Map();
    this.rng = makeRng(777);
    this.civLooks = [];
    for (let k = 0; k < 16; k++) this.civLooks.push(randomLook(this.rng));
    this.target = 50;
    this.spawnT = 0;
  }

  meshFor(key) {
    let m = this.meshes.get(key);
    if (!m) {
      const look = key.startsWith('civ') ? this.civLooks[Number(key.slice(3)) % this.civLooks.length] : LOOKS[key];
      m = this.world.models.character(key, look);
      this.meshes.set(key, m);
    }
    return m;
  }

  ringAt(i, j) {
    if (i < 0 || j < 0 || i >= GRID || j >= GRID) return null;
    return this.world.city.pedRings[j * GRID + i] ?? null;
  }

  ringNear(x, z) {
    const i = clamp(Math.floor(x / PITCH), 0, GRID - 1), j = clamp(Math.floor(z / PITCH), 0, GRID - 1);
    return this.ringAt(i, j);
  }

  spawn(meshKey, x, z, opts = {}) {
    const look = meshKey.startsWith('civ') ? this.civLooks[Number(meshKey.slice(3)) % 16] : LOOKS[meshKey];
    const p = new Ped(this, meshKey, x, z, { height: look?.height ?? 1, ...opts });
    this.meshFor(meshKey);
    this.list.push(p);
    return p;
  }

  remove(p) {
    const i = this.list.indexOf(p);
    if (i >= 0) this.list.splice(i, 1);
  }

  /** Spawn ambient walkers on a random sidewalk ring near the player. */
  spawnAmbient(minD = 35, maxD = 140, allowVisible = false) {
    const w = this.world;
    for (let tries = 0; tries < 10; tries++) {
      const ang = this.rng() * Math.PI * 2, dist = this.rng.range(minD, maxD);
      const x = w.player.x + Math.cos(ang) * dist, z = w.player.z + Math.sin(ang) * dist;
      const ring = this.ringNear(x, z);
      if (!ring) continue;
      const p0 = new Ped(this, 'civ0', x, z);
      p0.ring = ring;
      p0.s = p0.nearestS();
      const pt = p0.ringPoint(p0.s);
      if (!allowVisible && w.camera.frustum.sphereVisible(pt[0], 1, pt[1], 1) && Math.hypot(pt[0] - w.camera.pos[0], pt[1] - w.camera.pos[2]) < 90) continue;
      const key = `civ${Math.floor(this.rng() * 16)}`;
      const p = this.spawn(key, pt[0], pt[1]);
      p.ring = ring;
      p.s = p0.s;
      p.dir = this.rng.chance(0.5) ? 1 : -1;
      const roll = this.rng();
      if (roll < 0.12) {
        // A chatting pair.
        p.state = 'chat';
        p.stateT = 1e9;
        const q = this.spawn(`civ${Math.floor(this.rng() * 16)}`, pt[0] + 1.1, pt[1] + 0.4, { state: 'chat' });
        q.stateT = 1e9;
        q.ring = ring;
        p.partner = q;
        q.partner = p;
        q.yaw = Math.atan2(p.x - q.x, p.z - q.z);
      } else if (roll < 0.25) {
        p.state = 'idle';
        p.stateT = 4 + this.rng() * 8;
        p.phone = 0.001;
      }
      return p;
    }
    return null;
  }

  prefill(n) {
    for (let k = 0; k < n; k++) this.spawnAmbient(8, 110, true);
  }

  /** Make every civilian within radius run from a point. */
  panic(x, z, radius) {
    for (const p of this.list) if (p.kind === 'civ' && Math.hypot(p.x - x, p.z - z) < radius) p.flee(x, z, 7 + Math.random() * 4);
  }

  update(dt) {
    const w = this.world;
    const fps = w.fps ?? 60;
    if (fps < 24) this.target = Math.max(20, this.target - dt * 5);
    else if (fps > 40) this.target = Math.min(this.maxPeds ?? 50, this.target + dt * 3);
    for (const p of this.list) {
      p.update(dt);
      // Cars: dive away from speeding ones, get knocked down by those that hit.
      if (!p.dead && p.state !== 'scripted' && !p.hidden) {
        for (const v of w.vehicles.list) {
          const sp = Math.abs(v.speed);
          if (sp < 2.5 || Math.abs(v.x - p.x) > 12 || Math.abs(v.z - p.z) > 12) continue;
          const f = v.forward;
          const dx = p.x - v.x, dz = p.z - v.z;
          const along = dx * f[0] + dz * f[1];
          const lat = Math.abs(dx * -f[1] + dz * f[0]);
          if (along > -v.def.len / 2 && along < v.def.len / 2 + 0.3 && lat < v.def.wid / 2 + 0.3) {
            p.knockDown(v.x, v.z, sp * 4.5);
            w.onPedHitByCar?.(p, v);
          } else if (sp > 8 && along > 0 && along < 9 && lat < 2.2 && p.kind === 'civ' && p.state !== 'dive' && p.state !== 'down') {
            const side = dx * -f[1] + dz * f[0] > 0 ? 1 : -1;
            p.state = 'dive';
            p.stateT = 0.9;
            p.vx = -f[1] * side * 6;
            p.vz = f[0] * side * 6;
            p.yaw = Math.atan2(p.vx, p.vz);
          }
        }
      }
    }
    // Despawn far ambient walkers and old bodies.
    for (const p of [...this.list]) {
      if (p.kind !== 'civ' || p.keep) continue;
      const d = Math.hypot(p.x - w.player.x, p.z - w.player.z);
      if (d > 175 || (p.dead && p.dead >= 1.5 && d > 60)) this.remove(p);
    }
    this.spawnT -= dt;
    const civs = this.list.filter((p) => p.kind === 'civ').length;
    if (this.spawnT <= 0 && civs < this.target) {
      this.spawnT = 0.15;
      this.spawnAmbient();
    }
  }

  queue(renderer, night, camX, camZ) {
    for (const p of this.list) {
      if (p.hidden) continue;
      if (Math.abs(p.x - camX) > 160 || Math.abs(p.z - camZ) > 160) continue;
      p.pose();
      m4compose(p.x, p.y, p.z, p.yaw, 0, 0, 1, 1, 1, p.model);
      renderer.draw(this.meshFor(p.meshKey), { model: p.model, bones: p.anim.bones, rim: p.kind === 'story' ? [1, 0.78, 0.5, 0.22 + 0.25 * night] : undefined });
      p.drawWeapon?.(renderer);
    }
    this.queueRiders(renderer, camX, camZ);
  }

  /** Riders on the scooters in traffic: a seated civilian per scooter, sharing one seated pose. */
  queueRiders(renderer, camX, camZ) {
    if (!this.riderAnim) {
      this.riderAnim = new Animator(1);
      this.riderAnim.pose({ t: 0, seated: 1, steer: 0 });
    }
    for (const v of this.world.vehicles.list) {
      if (!v.def.scooter || v.driver !== 'npc' || v.wrecked) continue;
      if (Math.abs(v.x - camX) > 160 || Math.abs(v.z - camZ) > 160) continue;
      renderer.draw(this.meshFor(`civ${v.npcLook % 16}`), { model: CarEntry.seatMatrix(v), bones: this.riderAnim.bones });
    }
  }
}
