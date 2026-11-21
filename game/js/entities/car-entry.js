// Entering, exiting and carjacking: a short scripted sequence per use. Walk to the driver's door,
// the door swings open, an NPC driver is dragged out and flees, the character slides into the
// seated pose, the door shuts. Exiting plays it backwards. Seated characters ride on the car body.

import { lerp, damp, dampAngle, m4compose, m4mul } from '../core/math.js';

export class CarEntry {
  constructor() {
    this.seq = null;
  }

  get busy() {
    return this.seq !== null;
  }

  enter(ch, v, onJack = null) {
    if (this.seq) return false;
    // Use whichever front door is closer (side 0 = driver, right-hand drive).
    const d0 = v.doorPoint(0), d1 = v.doorPoint(1);
    const side = Math.hypot(d1[0] - ch.x, d1[1] - ch.z) < Math.hypot(d0[0] - ch.x, d0[1] - ch.z) - 0.5 ? 1 : 0;
    this.seq = { kind: 'enter', ch, v, phase: 'walk', t: 0, onJack, jacked: false, side };
    return true;
  }

  exit(ch, v) {
    if (this.seq) return false;
    this.seq = { kind: 'exit', ch, v, phase: 'open', t: 0, side: 0 };
    return true;
  }

  /** Character-local seat transform: rides the car body. */
  static seatMatrix(v) {
    const d = v.def;
    const y0 = d.wheel * 0.9 + d.h / 2 + d.h / 2;
    const seat = m4compose(-0.38, y0 - 0.86 + v.susp + (d.truck ? 0.5 : 0), -0.2 + (d.truck ? 1.9 : 0), 0, 0, 0);
    return m4mul(v.model, m4mul(v.bones.subarray(0, 16), seat));
  }

  update(dt) {
    const s = this.seq;
    if (!s) return null;
    const { ch, v } = s;
    s.t += dt;
    const door = v.doorPoint(s.side);
    const di = s.side === 0 ? 1 : 0; // door bone index for that side
    const seat = v.seatPoint();
    if (s.kind === 'enter') {
      if (s.phase === 'walk') {
        // Auto-walk to the door.
        const dx = door[0] - ch.x, dz = door[1] - ch.z;
        const d = Math.hypot(dx, dz);
        if (d > 0.25 && s.t < 1.2) {
          const sp = Math.min(4.2, d / dt);
          ch.vx = (dx / d) * sp;
          ch.vz = (dz / d) * sp;
          ch.yaw = dampAngle(ch.yaw, Math.atan2(dx, dz), 14, dt);
          ch.integrate(dt);
        } else {
          ch.vx = ch.vz = 0;
          ch.speed = 0;
          s.phase = 'open';
          s.t = 0;
        }
      } else if (s.phase === 'open') {
        v.doorTarget[di] = 1;
        ch.yaw = dampAngle(ch.yaw, v.yaw + (s.side === 0 ? Math.PI / 2 : -Math.PI / 2), 10, dt);
        if (s.t > 0.35) {
          if (v.driver && v.driver !== 'player' && !s.jacked) {
            s.jacked = true;
            s.onJack?.(v);
            s.phase = 'jack';
          } else s.phase = 'in';
          s.t = 0;
        }
      } else if (s.phase === 'jack') {
        ch.punch = ch.punch || 0.01;
        if (s.t > 0.55) { s.phase = 'in'; s.t = 0; }
      } else if (s.phase === 'in') {
        const k = Math.min(1, s.t / 0.45);
        ch.x = lerp(door[0], seat[0], k);
        ch.z = lerp(door[1], seat[1], k);
        ch.y = lerp(ch.y, v.y + 0.2, k * 0.5);
        ch.yaw = dampAngle(ch.yaw, v.yaw, 12, dt);
        ch.seat = k;
        if (k >= 1) {
          v.driver = 'player';
          v.parked = false;
          ch.vehicle = v;
          s.phase = 'close';
          s.t = 0;
        }
      } else if (s.phase === 'close') {
        v.doorTarget[di] = 0;
        if (s.t > 0.3) {
          this.seq = null;
          return 'entered';
        }
      }
    } else {
      if (s.phase === 'open') {
        v.doorTarget[di] = 1;
        v.throttle = 0;
        v.handbrake = true;
        if (s.t > 0.3) { s.phase = 'out'; s.t = 0; }
      } else if (s.phase === 'out') {
        const k = Math.min(1, s.t / 0.4);
        ch.seat = 1 - k;
        ch.x = lerp(seat[0], door[0], k);
        ch.z = lerp(seat[1], door[1], k);
        ch.yaw = v.yaw;
        if (k >= 1) {
          ch.vehicle = null;
          v.driver = null;
          v.handbrake = false;
          ch.y = ch.city.groundAt(ch.x, ch.z);
          s.phase = 'close';
          s.t = 0;
        }
      } else if (s.phase === 'close') {
        v.doorTarget[di] = 0;
        if (s.t > 0.25) {
          this.seq = null;
          return 'exited';
        }
      }
    }
    void damp;
    return null;
  }
}
