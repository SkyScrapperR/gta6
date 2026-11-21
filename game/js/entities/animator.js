// Character rig and procedural animation. Eleven bones (hips, chest, head, two-part arms and legs)
// with fixed joint offsets; the Animator turns a pose state — walk/run cycle, jump, aim, punch combo,
// hit reaction, fall-and-lie death, seated driving, talking gestures, hands up — into bone matrices.
// Pure math: no rendering imports, so gameplay code can animate characters without the engine.

import { m4compose, m4mul, lerp, clamp } from '../core/math.js';

export const BONE = { HIPS: 0, CHEST: 1, HEAD: 2, UARM_L: 3, FARM_L: 4, UARM_R: 5, FARM_R: 6, THIGH_L: 7, SHIN_L: 8, THIGH_R: 9, SHIN_R: 10 };
const PARENT = [-1, 0, 1, 1, 3, 1, 5, 0, 7, 0, 9];

/** Joint offsets from the parent joint (metres, before scaling by height). */
const OFFSET = [
  [0, 0.95, 0], // hips from feet origin
  [0, 0.1, 0], // chest base from hips
  [0, 0.6, 0], // head base (neck top) from chest base
  [0.19, 0.44, 0], // left shoulder
  [0, -0.29, 0], // left elbow
  [-0.19, 0.44, 0], // right shoulder
  [0, -0.29, 0], // right elbow
  [0.1, -0.04, 0], // left hip joint
  [0, -0.43, 0], // left knee
  [-0.1, -0.04, 0], // right hip joint
  [0, -0.43, 0], // right knee
];


/**
 * Procedural animator: turns a pose state into bone matrices (character-local).
 * state: { t, speed (m/s), phase, air, aim (0..1), punch (0..1 progress, side), hit (0..1), dead (0..1),
 *          seated (0..1), talk (0..1), crouch, lean, steer, heightScale }
 */
export class Animator {
  constructor(height = 1) {
    this.height = height;
    this.bones = new Float32Array(16 * 16);
    this.world = Array.from({ length: 11 }, () => new Float32Array(16));
    this.rot = Array.from({ length: 11 }, () => [0, 0, 0]);
    this.root = [0, 0, 0];
  }

  pose(s) {
    const r = this.rot;
    for (const a of r) a[0] = a[1] = a[2] = 0;
    const t = s.t ?? 0;
    const speed = s.speed ?? 0;
    const ph = s.phase ?? 0;
    const run = clamp((speed - 2.2) / 3, 0, 1);
    const move = clamp(speed / 1.4, 0, 1);
    let hipY = 0, hipZ = 0;

    // Idle breathing.
    const breath = Math.sin(t * 1.6) * 0.02 * (1 - move);
    r[BONE.CHEST][0] = breath;
    r[BONE.UARM_L][2] = 0.14 + breath;
    r[BONE.UARM_R][2] = -0.14 - breath;
    r[BONE.FARM_L][0] = -0.12;
    r[BONE.FARM_R][0] = -0.12;
    r[BONE.HEAD][1] = Math.sin(t * 0.37) * 0.15 * (1 - move);

    // Walk / run cycle.
    if (move > 0.01) {
      const amp = lerp(0.45, 0.85, run) * move;
      const sw = Math.sin(ph);
      r[BONE.THIGH_L][0] = -sw * amp;
      r[BONE.THIGH_R][0] = sw * amp;
      r[BONE.SHIN_L][0] = Math.max(0, Math.cos(ph)) * lerp(0.6, 1.4, run) * move + 0.05;
      r[BONE.SHIN_R][0] = Math.max(0, -Math.cos(ph)) * lerp(0.6, 1.4, run) * move + 0.05;
      r[BONE.UARM_L][0] = sw * amp * 0.8;
      r[BONE.UARM_R][0] = -sw * amp * 0.8;
      r[BONE.FARM_L][0] = -0.2 - run * 1.0;
      r[BONE.FARM_R][0] = -0.2 - run * 1.0;
      r[BONE.CHEST][0] += run * 0.22 + 0.04 * move;
      r[BONE.CHEST][1] = sw * 0.12 * move;
      r[BONE.HIPS][1] = -sw * 0.08 * move;
      hipY = Math.abs(Math.cos(ph)) * lerp(0.03, 0.07, run) * move - 0.02 * run;
    }
    // Airborne (jump hop): knees tucked, arms up.
    if (s.air) {
      r[BONE.THIGH_L][0] = -0.6;
      r[BONE.THIGH_R][0] = -0.25;
      r[BONE.SHIN_L][0] = 0.9;
      r[BONE.SHIN_R][0] = 0.6;
      r[BONE.UARM_L][2] = 0.5;
      r[BONE.UARM_R][2] = -0.5;
    }
    // Aim: right arm (and left supporting) straight forward, torso turned slightly.
    const aim = s.aim ?? 0;
    if (aim > 0) {
      const pitch = s.aimPitch ?? 0;
      r[BONE.UARM_R][0] = lerp(r[BONE.UARM_R][0], -1.5 - pitch, aim);
      r[BONE.UARM_R][2] = lerp(r[BONE.UARM_R][2], 0.05, aim);
      r[BONE.FARM_R][0] = lerp(r[BONE.FARM_R][0], -0.05, aim);
      if (s.twoHanded) {
        r[BONE.UARM_L][0] = lerp(r[BONE.UARM_L][0], -1.25 - pitch, aim);
        r[BONE.UARM_L][2] = lerp(r[BONE.UARM_L][2], -0.55, aim);
        r[BONE.FARM_L][0] = lerp(r[BONE.FARM_L][0], -0.5, aim);
      }
      r[BONE.CHEST][1] = lerp(r[BONE.CHEST][1], 0.15, aim);
      r[BONE.HEAD][1] = lerp(r[BONE.HEAD][1], -0.12, aim);
      r[BONE.HEAD][0] = lerp(r[BONE.HEAD][0], pitch * 0.5, aim);
      if (s.recoil) r[BONE.UARM_R][0] -= s.recoil * 0.25;
    }
    // Punch combo: alternating jabs.
    if (s.punch > 0) {
      const k = Math.sin(Math.min(1, s.punch) * Math.PI);
      const [u, f] = s.punchSide ? [BONE.UARM_L, BONE.FARM_L] : [BONE.UARM_R, BONE.FARM_R];
      const [u2, f2] = s.punchSide ? [BONE.UARM_R, BONE.FARM_R] : [BONE.UARM_L, BONE.FARM_L];
      r[u][0] = lerp(-0.9, -1.55, k);
      r[f][0] = lerp(-1.6, 0.0, k);
      r[u][2] = 0;
      r[u2][0] = -0.9;
      r[f2][0] = -1.7;
      r[BONE.CHEST][1] = (s.punchSide ? 0.35 : -0.35) * k;
    }
    // Hit reaction: snap back.
    if (s.hit > 0) {
      const k = Math.sin(s.hit * Math.PI);
      r[BONE.CHEST][0] -= 0.35 * k;
      r[BONE.HEAD][0] -= 0.3 * k;
      r[BONE.UARM_L][2] += 0.4 * k;
      r[BONE.UARM_R][2] -= 0.4 * k;
    }
    // Seated (driving): thighs forward, shins down, hands on the wheel.
    const seat = s.seated ?? 0;
    if (seat > 0) {
      const st = s.steer ?? 0;
      const mix = (bn, ax, v) => (r[bn][ax] = lerp(r[bn][ax], v, seat));
      mix(BONE.THIGH_L, 0, -1.45); mix(BONE.THIGH_R, 0, -1.45);
      mix(BONE.SHIN_L, 0, 1.35); mix(BONE.SHIN_R, 0, 1.35);
      mix(BONE.UARM_L, 0, -0.95 + st * 0.2); mix(BONE.UARM_R, 0, -0.95 - st * 0.2);
      mix(BONE.UARM_L, 2, -0.15); mix(BONE.UARM_R, 2, 0.15);
      mix(BONE.FARM_L, 0, -0.55); mix(BONE.FARM_R, 0, -0.55);
      mix(BONE.CHEST, 0, -0.3); mix(BONE.CHEST, 1, 0);
      mix(BONE.HEAD, 0, 0.25);
      hipY = lerp(hipY, -0.42, seat);
      hipZ = lerp(hipZ, -0.05, seat);
    }
    // Talking gestures.
    if (s.talk > 0) {
      const g = s.talk;
      r[BONE.UARM_R][0] += (-0.5 + Math.sin(t * 3.1) * 0.25) * g;
      r[BONE.FARM_R][0] += (-0.9 + Math.sin(t * 4.3) * 0.3) * g;
      r[BONE.UARM_L][0] += (-0.3 + Math.sin(t * 2.3 + 1) * 0.2) * g;
      r[BONE.FARM_L][0] += (-0.6 + Math.sin(t * 3.7 + 2) * 0.2) * g;
      r[BONE.HEAD][0] += Math.sin(t * 5.0) * 0.06 * g;
      r[BONE.HEAD][1] += Math.sin(t * 1.3) * 0.12 * g;
    }
    // Hands up (cuffed / surrender).
    if (s.handsUp > 0) {
      const k = s.handsUp;
      r[BONE.UARM_L][0] = lerp(r[BONE.UARM_L][0], -2.8, k); r[BONE.UARM_R][0] = lerp(r[BONE.UARM_R][0], -2.8, k);
      r[BONE.FARM_L][0] = lerp(r[BONE.FARM_L][0], -0.6, k); r[BONE.FARM_R][0] = lerp(r[BONE.FARM_R][0], -0.6, k);
    }
    // Phone look (idle pedestrians).
    if (s.phone > 0) {
      r[BONE.UARM_R][0] = lerp(r[BONE.UARM_R][0], -0.5, s.phone);
      r[BONE.FARM_R][0] = lerp(r[BONE.FARM_R][0], -1.6, s.phone);
      r[BONE.HEAD][0] = lerp(r[BONE.HEAD][0], 0.4, s.phone);
    }
    // Death: fall backwards and lie still.
    let rootPitch = 0;
    const dead = s.dead ?? 0;
    if (dead > 0) {
      const k = 1 - Math.pow(1 - Math.min(1, dead), 2);
      rootPitch = -1.5 * k;
      hipY = lerp(hipY, -0.8, k);
      r[BONE.UARM_L][2] = lerp(r[BONE.UARM_L][2], 1.2, k);
      r[BONE.UARM_R][2] = lerp(r[BONE.UARM_R][2], -1.0, k);
      r[BONE.THIGH_L][0] = lerp(r[BONE.THIGH_L][0], -0.2, k);
      r[BONE.SHIN_L][0] = lerp(r[BONE.SHIN_L][0], 0.4, k);
      r[BONE.HEAD][1] = lerp(r[BONE.HEAD][1], 0.5, k);
    }
    this.root = [0, hipY, hipZ];
    this.rootPitch = rootPitch;
    this.compose();
  }

  compose() {
    const h = this.height;
    for (let i = 0; i < 11; i++) {
      const o = OFFSET[i];
      const r = this.rot[i];
      let local;
      if (i === 0) local = m4compose(o[0] * h + this.root[0], o[1] * h + this.root[1], o[2] * h + this.root[2], r[1], r[0] + (this.rootPitch ?? 0), r[2], h);
      else local = m4compose(o[0], o[1], o[2], r[1], r[0], r[2]);
      if (PARENT[i] < 0) this.world[i] = local;
      else m4mul(this.world[PARENT[i]], local, this.world[i]);
      this.bones.set(this.world[i], i * 16);
    }
  }

  /** Character-local matrix of the right hand (for weapons). */
  handMatrix() {
    return m4mul(this.world[BONE.FARM_R], m4compose(0, -0.3, 0.02, 0, Math.PI / 2, 0));
  }
}
