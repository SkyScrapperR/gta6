// In-engine cutscenes: a list of shots, each with a camera move and dialogue lines, letterbox bars,
// portrait cards and Space to skip. Camera helpers build 3/4 medium two-shots where both faces are
// visible (actors are cheated a little towards the lens), keep the pair on the thirds, prefer the
// side whose background is open street and sky, and validate every position against the city so the
// camera never sits inside geometry.

import { lerp, clamp } from '../core/math.js';

export class Cutscene {
  constructor(world, { shots, onEnd, onStart, actors = {} }) {
    this.world = world;
    this.shots = shots;
    this.onEnd = onEnd;
    this.onStart = onStart;
    this.actors = actors;
    this.i = -1;
    this.t = 0;
    this.done = false;
  }

  start() {
    const w = this.world;
    w.cutscene = this;
    w.cinematic = { cam: null, portrait: null, skipHint: true };
    w.controlsOn = false;
    w.dialogue.actors = this.actors;
    if (w.hud) w.hud.cineT = 0;
    this.onStart?.();
    this.nextShot();
  }

  nextShot() {
    this.i++;
    this.t = 0;
    const s = this.shots[this.i];
    if (!s) return this.end();
    s.setup?.();
    if (s.lines?.length) this.world.dialogue.say(s.lines);
    this.dur = Math.max(s.dur ?? 3, (s.lines ?? []).reduce((a, l) => a + (l[2] ?? Math.max(2.2, l[1].length * 0.055)), 0) + 0.4);
  }

  skip() {
    if (this.done) return;
    this.world.dialogue.clear();
    this.end();
  }

  end() {
    if (this.done) return;
    this.done = true;
    const w = this.world;
    w.cinematic = null;
    w.cutscene = null;
    w.controlsOn = true;
    w.dialogue.actors = {};
    for (const a of Object.values(this.actors)) if (a) a.talk = 0;
    this.onEnd?.();
  }

  update(dt) {
    if (this.done) return;
    const s = this.shots[this.i];
    if (!s) return;
    this.t += dt;
    const k = clamp(this.t / this.dur, 0, 1);
    const c = s.cam(k, this.t);
    const pos = validateCamera(this.world, c.pos, c.target);
    this.world.cinematic.cam = { pos, target: c.target, fov: c.fov ?? 42, smooth: c.smooth ?? 0 };
    s.update?.(dt, k);
    if (this.t >= this.dur) this.nextShot();
  }
}

/** Push a camera position out of solid geometry (towards its target) and above the ground. */
export function validateCamera(w, pos, target) {
  const p = pos.slice();
  const g = w.city.groundAt(p[0], p[2]);
  if (p[1] < g + 0.4) p[1] = g + 0.4;
  for (let iter = 0; iter < 12; iter++) {
    let inside = false;
    w.city.col.query(p[0] - 0.3, p[2] - 0.3, p[0] + 0.3, p[2] + 0.3, (it) => {
      if (it.type !== 'box' || it.data.ghost) return;
      if (p[0] > it.x0 - 0.25 && p[0] < it.x1 + 0.25 && p[2] > it.z0 - 0.25 && p[2] < it.z1 + 0.25 && p[1] < it.top + 0.2 && p[1] > it.y0) inside = true;
    });
    if (!inside) break;
    for (let k = 0; k < 3; k++) p[k] = lerp(p[k], target[k], 0.12);
  }
  return p;
}

/**
 * A 3/4 medium two-shot of actors a and b. side picks which side of their line the camera sits on.
 * Returns {pos, target} and cheats both actors' yaw towards the camera so both faces read.
 */
export function twoShot(a, b, side = 1, dist = 3.4, height = 1.55, drift = 0) {
  const ux = b.x - a.x, uz = b.z - a.z;
  const l = Math.hypot(ux, uz) || 1;
  const nx = (-uz / l) * side, nz = (ux / l) * side;
  const mx = (a.x + b.x) / 2, mz = (a.z + b.z) / 2;
  const pos = [mx + nx * dist + (ux / l) * (0.35 + drift), (a.y + b.y) / 2 + height, mz + nz * dist + (uz / l) * (0.35 + drift)];
  const target = [mx + (ux / l) * 0.15, (a.y + b.y) / 2 + 1.4, mz + (uz / l) * 0.15];
  const cheat = (ch, other) => {
    const toOther = Math.atan2(other.x - ch.x, other.z - ch.z);
    const toCam = Math.atan2(pos[0] - ch.x, pos[2] - ch.z);
    let d = toCam - toOther;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    ch.yaw = toOther + d * 0.42;
  };
  cheat(a, b);
  cheat(b, a);
  return { pos, target };
}

/** Pick the side for a two-shot whose view direction looks down the open street (farther free distance). */
export function openSide(w, a, b) {
  let best = 1, bd = -1;
  for (const side of [1, -1]) {
    const s = twoShot({ ...a }, { ...b }, side);
    const dx = s.target[0] - s.pos[0], dz = s.target[2] - s.pos[2];
    const l = Math.hypot(dx, dz) || 1;
    const hit = w.city.col.raycast(s.target[0], 1.6, s.target[2], dx / l, 0, dz / l, 200, (it) => it.type === 'box');
    const d = hit ? hit.t : 200;
    if (d > bd) { bd = d; best = side; }
  }
  return best;
}

/** A sweeping establishing move between two camera positions looking at moving targets. */
export function sweep(from, to, lookFrom, lookTo, fov = 50) {
  return (k) => {
    const e = k * k * (3 - 2 * k);
    return {
      pos: from.map((v, i) => lerp(v, to[i], e)),
      target: lookFrom.map((v, i) => lerp(v, lookTo[i], e)),
      fov,
    };
  };
}
