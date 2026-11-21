// Gang combat AI (Black Orchid enforcers and guards). Each fighter picks a real cover point — the
// corner of a container, wall or parked car on the far side from the player — runs to it, crouches
// in, peeks out sideways to fire short bursts with imperfect accuracy, strafes, and changes cover
// when flanked or hurt. Bosses (Viktor) use the same brain with more health and aggression.

import { clamp, damp, dampAngle } from '../core/math.js';

export class GangBrain {
  constructor(world, opts = {}) {
    this.world = world;
    this.weapon = opts.weapon ?? 'pistol';
    this.accuracy = opts.accuracy ?? 0.3;
    this.aggro = opts.aggro ?? false;
    this.home = opts.home ?? null; // guard post
    this.alertRadius = opts.alertRadius ?? 45;
    this.state = opts.alerted ? 'seek' : 'guard';
    this.cover = null;
    this.t = 0;
    this.peekT = 0;
    this.burst = 0;
    this.fireT = 0.6 + Math.random();
    this.coverT = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
  }

  /** Candidate cover points near (x,z): box corners and car ends, offset away from the threat. */
  findCover(c, px, pz) {
    const w = this.world;
    let best = null, bs = Infinity;
    const consider = (x, z, bx, bz) => {
      const d = Math.hypot(x - c.x, z - c.z);
      if (d > 26) return;
      // Cover must have the obstacle between it and the player.
      const toP = [px - x, pz - z];
      const toB = [bx - x, bz - z];
      const lp = Math.hypot(...toP) || 1, lb = Math.hypot(...toB) || 1;
      const block = (toP[0] * toB[0] + toP[1] * toB[1]) / (lp * lb);
      if (block < 0.35) return;
      const pd = lp;
      const score = d * 1.0 + Math.abs(pd - 18) * 0.5 - block * 6 + (w.gangCoverTaken?.has(`${x | 0},${z | 0}`) ? 50 : 0);
      if (score < bs) { bs = score; best = [x, z]; }
    };
    w.city.col.query(c.x - 26, c.z - 26, c.x + 26, c.z + 26, (it) => {
      if (it.type !== 'box' || it.top < 1.0 || it.data.ghost) return;
      const cx = (it.x0 + it.x1) / 2, cz = (it.z0 + it.z1) / 2;
      for (const [x, z] of [[it.x0 - 0.8, it.z0 - 0.8], [it.x1 + 0.8, it.z0 - 0.8], [it.x0 - 0.8, it.z1 + 0.8], [it.x1 + 0.8, it.z1 + 0.8]]) consider(x, z, cx, cz);
    });
    for (const v of w.vehicles.list) {
      if (Math.hypot(v.x - c.x, v.z - c.z) > 26) continue;
      const f = v.forward;
      for (const s of [1, -1]) consider(v.x + f[0] * s * (v.def.len / 2 + 0.7), v.z + f[1] * s * (v.def.len / 2 + 0.7), v.x, v.z);
    }
    return best;
  }

  update(dt, c) {
    const w = this.world;
    const p = w.player;
    this.t += dt;
    if (!p.alive) { c.aim = 0; c.vx = damp(c.vx, 0, 5, dt); c.vz = damp(c.vz, 0, 5, dt); c.integrate(dt); return; }
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    const canSee = d < 60 && w.city.col.lineClear(c.x, c.y + 1.5, c.z, p.x, p.y + 1.2, p.z);
    if (this.state === 'guard') {
      c.aim = 0;
      if (this.home) c.moveTo(dt, this.home[0], this.home[1], Math.hypot(this.home[0] - c.x, this.home[1] - c.z) > 1 ? 1.4 : 0);
      else { c.vx = damp(c.vx, 0, 5, dt); c.vz = damp(c.vz, 0, 5, dt); c.integrate(dt); }
      if ((d < this.alertRadius && canSee) || d < 12 || this.aggro) this.alert();
      return;
    }
    // Melee range fallback.
    if (d < 1.8 && Math.random() < dt * 1.2) {
      c.punch = 0.001;
      c.punchSide = Math.random() < 0.5 ? 0 : 1;
      w.combat.melee(c, 10);
    }
    if (this.state === 'seek') {
      this.cover = this.findCover(c, p.x, p.z);
      if (this.cover) {
        w.gangCoverTaken?.add(`${this.cover[0] | 0},${this.cover[1] | 0}`);
        this.state = 'move';
      } else this.state = 'fight';
    }
    if (this.state === 'move') {
      c.aim = 0;
      const dd = c.moveTo(dt, this.cover[0], this.cover[1], 5.2);
      if (dd < 0.6 || this.t > 6) { this.state = 'cover'; this.coverT = 0; this.t = 0; }
      return;
    }
    if (this.state === 'cover') {
      this.coverT += dt;
      // Crouched behind cover; peek out periodically.
      c.vx = damp(c.vx, 0, 8, dt);
      c.vz = damp(c.vz, 0, 8, dt);
      c.integrate(dt);
      c.aim = 0;
      c.yaw = dampAngle(c.yaw, Math.atan2(p.x - c.x, p.z - c.z), 6, dt);
      this.peekT -= dt;
      if (this.peekT <= 0) {
        this.state = 'peek';
        this.t = 0;
        this.burst = this.weapon === 'smg' ? 4 + Math.floor(Math.random() * 4) : 1 + Math.floor(Math.random() * 3);
        const f = [Math.sin(c.yaw), Math.cos(c.yaw)];
        this.peekTo = [c.x - f[1] * this.strafe * 1.3, c.z + f[0] * this.strafe * 1.3];
      }
      // Flanked (the player can see us from close by) or cover too far now: move.
      if (this.coverT > 9 || (d < 7 && canSee)) { this.state = 'seek'; this.strafe = -this.strafe; }
      return;
    }
    if (this.state === 'peek' || this.state === 'fight') {
      if (this.state === 'peek') c.moveTo(dt, this.peekTo[0], this.peekTo[1], 2.2);
      else {
        // No cover: strafe sideways while shooting.
        const fx = (p.x - c.x) / (d || 1), fz = (p.z - c.z) / (d || 1);
        const want = d > 22 ? 3.5 : d < 8 ? -2 : 0;
        c.vx = damp(c.vx, fx * want - fz * this.strafe * 1.8, 4, dt);
        c.vz = damp(c.vz, fz * want + fx * this.strafe * 1.8, 4, dt);
        c.integrate(dt);
        if (Math.random() < dt * 0.4) this.strafe = -this.strafe;
        if (Math.random() < dt * 0.15) this.state = 'seek';
      }
      c.aim = 1;
      c.twoHanded = this.weapon !== 'pistol';
      c.weapon = this.weapon;
      c.yaw = dampAngle(c.yaw, Math.atan2(p.x - c.x, p.z - c.z), 12, dt);
      this.fireT -= dt;
      if (this.fireT <= 0 && canSee && this.t > 0.35) {
        w.combat.npcFire(c, this.weapon, p, this.accuracy);
        this.burst--;
        this.fireT = this.weapon === 'smg' ? 0.12 : this.weapon === 'shotgun' ? 1.0 : 0.45 + Math.random() * 0.3;
        if (this.burst <= 0 && this.state === 'peek') {
          this.state = 'cover';
          this.peekT = 1.0 + Math.random() * 1.6;
          this.fireT = 0.4;
          if (this.cover) c.x = clamp(c.x, this.cover[0] - 2, this.cover[0] + 2);
        }
      }
      if (this.state === 'peek' && this.t > 3) { this.state = 'cover'; this.peekT = 1; }
    }
  }

  alert() {
    if (this.state === 'guard') {
      this.state = 'seek';
      this.world.emit('gangAlert');
    }
  }

  onHurt() {
    this.alert();
    if (this.state === 'cover' && Math.random() < 0.4) this.state = 'seek';
  }
}
