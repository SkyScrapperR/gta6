// Ambient traffic. Cars follow left-hand lanes of the road graph, turn through junctions on curves
// between entry and exit points, stop for red lights, brake for cars, people and the player ahead,
// honk when blocked, back out when stuck, and a deadlock breaker keeps junctions moving. Cars spawn
// and despawn in a ring outside the view; the population adapts to frame rate.

import { bezier } from '../world/roads.js';
import { clamp, wrapAngle, makeRng } from '../core/math.js';

const TYPES = [['merpati', 5], ['kancil', 4], ['taxi', 3], ['bajak', 2], ['vesper', 1], ['bison', 1]];

function pickType(rng) {
  const total = TYPES.reduce((s, t) => s + t[1], 0);
  let r = rng() * total;
  for (const [t, w] of TYPES) if ((r -= w) <= 0) return t;
  return 'merpati';
}

/** Drives one vehicle along the road graph. Also used by police in cruise mode. */
export class LaneDriver {
  constructor(v, roads, rng, from, to) {
    this.v = v;
    this.roads = roads;
    this.rng = rng;
    this.from = from;
    this.to = to;
    this.wps = [];
    this.cruise = rng.range(10.5, 14);
    this.blocked = 0;
    this.reverseT = 0;
    this.ghostT = 0;
    this.waitJunction = 0;
    this.buildLane();
  }

  buildLane() {
    const lane = this.roads.laneOf(this.from, this.to);
    this.wps.push({ x: lane.end[0], z: lane.end[1], kind: 'stop', node: this.to, axis: lane.dir[0] !== 0 ? 'x' : 'z' });
  }

  /** Choose the next junction exit and append the turn curve + next lane. */
  planNext() {
    const via = this.to;
    const opts = via.links.map((id) => this.roads.nodes[id]).filter((n) => n !== this.from);
    const next = opts.length ? this.rng.pick(opts) : this.from;
    const c = this.roads.turnCurve(this.from, via, next);
    for (let k = 1; k <= 5; k++) {
      const p = bezier(c, k / 5);
      this.wps.push({ x: p[0], z: p[1], kind: 'turn' });
    }
    this.from = via;
    this.to = next;
    this.buildLane();
  }

  /** Distance and relative speed of the nearest obstacle ahead in our path. */
  scanAhead(world) {
    const v = this.v;
    const f = v.forward;
    const range = 7 + Math.max(0, v.speed) * 1.3;
    let best = Infinity;
    const check = (x, z, r) => {
      const dx = x - v.x, dz = z - v.z;
      const along = dx * f[0] + dz * f[1];
      if (along < 0 || along > range) return;
      const lat = Math.abs(dx * -f[1] + dz * f[0]);
      if (lat > 1.6 + r) return;
      best = Math.min(best, along - r - v.def.len / 2);
    };
    for (const o of world.vehicles.list) if (o !== v && Math.abs(o.x - v.x) < 40 && Math.abs(o.z - v.z) < 40) check(o.x, o.z, o.def.len / 2);
    for (const p of world.peds?.list ?? []) if (!p.dead && Math.abs(p.x - v.x) < 25 && Math.abs(p.z - v.z) < 25) check(p.x, p.z, 0.4);
    const pl = world.player;
    if (pl && !pl.vehicle) check(pl.x, pl.z, 0.4);
    return best;
  }

  update(dt, world) {
    const v = this.v;
    if (v.wrecked) { v.throttle = 0; v.brake = 1; return; }
    if (this.wps.length < 7) this.planNext();
    // Pop reached waypoints.
    while (this.wps.length) {
      const w = this.wps[0];
      const d = Math.hypot(w.x - v.x, w.z - v.z);
      const f = v.forward;
      const behind = (w.x - v.x) * f[0] + (w.z - v.z) * f[1] < 0 && d < 8;
      if (d < 3.2 || behind) this.wps.shift();
      else break;
    }
    // Lookahead target.
    const look = 5 + Math.max(0, v.speed) * 0.45;
    let tgt = this.wps[0];
    for (const w of this.wps) {
      tgt = w;
      if (Math.hypot(w.x - v.x, w.z - v.z) > look) break;
    }
    const want = Math.atan2(tgt.x - v.x, tgt.z - v.z);
    const err = wrapAngle(want - v.yaw);
    let target = this.cruise;
    const turn = this.wps.find((w) => w.kind === 'turn');
    if (turn) {
      const dt2 = Math.hypot(turn.x - v.x, turn.z - v.z);
      if (dt2 < 40) target = Math.min(target, 6.5 + Math.max(0, dt2 - 8) * 0.5);
    }
    // Traffic light at the next stop line.
    const stop = this.wps.find((w) => w.kind === 'stop');
    if (stop && this.ghostT <= 0) {
      const ds = Math.hypot(stop.x - v.x, stop.z - v.z);
      const sig = this.roads.signal(stop.node, stop.axis);
      if (sig !== 'green' && ds < 32 && ds > 1.0 && stop === this.wps[0]) {
        target = Math.min(target, Math.max(0, (ds - 2.5) * 0.7));
        if (ds < 6) this.waitJunction += dt;
      } else this.waitJunction = 0;
    }
    // Obstacles.
    const obst = this.ghostT > 0 ? Infinity : this.scanAhead(world);
    if (obst < Infinity) {
      target = Math.min(target, Math.max(0, (obst - 2.5) * 0.9));
      if (obst < 4.5) this.blocked += dt;
    } else this.blocked = Math.max(0, this.blocked - dt * 2);
    v.horn = this.blocked > 2.5 && this.blocked < 3.2;
    if (this.blocked > 6 && this.reverseT <= 0) {
      this.reverseT = 1.6;
      this.blocked = 0;
    }
    if (this.waitJunction > 30 || (this.blocked > 4 && v.speed < 0.5 && obst > 3)) {
      // Deadlock breaker: creep through, ignoring others briefly.
      this.ghostT = 2.5;
      this.waitJunction = 0;
    }
    this.ghostT -= dt;
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      v.throttle = -0.7;
      v.brake = 0;
      v.steer = clamp(-err * 2, -1, 1);
      return;
    }
    v.steer = clamp(err * 2.2, -1, 1);
    const ds = target - v.speed;
    v.brake = ds < -2 ? clamp(-ds * 0.25, 0, 1) : 0;
    v.throttle = ds > 0 ? clamp(ds * 0.35, 0, 1) : 0;
    v.handbrake = false;
    if (target < 0.3 && v.speed < 0.6) { v.brake = 1; v.throttle = 0; }
  }
}

export class TrafficSystem {
  constructor(world) {
    this.world = world;
    this.rng = makeRng(4242);
    this.target = 30;
    this.cars = [];
    this.spawnT = 0;
  }

  /** Is a point probably on screen? (cheap: within frustum and near) */
  visible(x, z) {
    const cam = this.world.camera;
    return cam.frustum.sphereVisible(x, 1, z, 3) && Math.hypot(x - cam.pos[0], z - cam.pos[2]) < 260;
  }

  /** Spawn one car on a random lane in a ring around the player. */
  spawnOne(minD = 90, maxD = 220, allowVisible = false, forceType = null) {
    const w = this.world;
    const roads = w.city.roads;
    const px = w.player.x, pz = w.player.z;
    for (let tries = 0; tries < 12; tries++) {
      const a = roads.nodes[Math.floor(this.rng() * roads.nodes.length)];
      if (!a.links.length) continue;
      const b = roads.nodes[this.rng.pick(a.links)];
      const lane = roads.laneOf(a, b);
      const t = this.rng.range(0.15, 0.85);
      const x = lane.start[0] + (lane.end[0] - lane.start[0]) * t;
      const z = lane.start[1] + (lane.end[1] - lane.start[1]) * t;
      const d = Math.hypot(x - px, z - pz);
      if (d < minD || d > maxD) continue;
      if (!allowVisible && this.visible(x, z)) continue;
      if (w.vehicles.list.some((o) => Math.hypot(o.x - x, o.z - z) < 9)) continue;
      const type = forceType ?? pickType(this.rng);
      const v = w.vehicles.spawn(type, x, z, Math.atan2(lane.dir[0], lane.dir[1]), { colorSeed: this.rng() });
      v.speed = 8;
      v.driver = 'npc';
      v.ai = new LaneDriver(v, roads, this.rng, a, b);
      v.npcLook = Math.floor(this.rng() * 1000);
      this.cars.push(v);
      return v;
    }
    return null;
  }

  /** Fill the streets around the player at once (title screen, new game). */
  prefill(n, near = 40, far = 200) {
    for (let k = 0; k < n; k++) this.spawnOne(near, far, true);
  }

  update(dt) {
    const w = this.world;
    // Adapt the population to frame rate.
    const fps = w.fps ?? 60;
    if (fps < 24) this.target = Math.max(12, this.target - dt * 4);
    else if (fps > 40) this.target = Math.min(this.maxCars ?? 30, this.target + dt * 2);
    this.cars = this.cars.filter((v) => w.vehicles.list.includes(v));
    for (const v of this.cars) {
      if (v.driver === 'npc' && v.ai) v.ai.update(dt, w);
      else if (!v.driver) { v.throttle = 0; v.brake = 0.5; }
    }
    // Despawn far, unseen, ambient cars.
    for (const v of this.cars) {
      if (v.mission || v.driver === 'player' || v.pursuit) continue;
      const d = Math.hypot(v.x - w.player.x, v.z - w.player.z);
      if (d > 270 && !this.visible(v.x, v.z)) w.vehicles.remove(v);
      else if (v.wrecked && v.wreckTimer > 40 && !this.visible(v.x, v.z)) w.vehicles.remove(v);
    }
    this.spawnT -= dt;
    const ambient = this.cars.filter((v) => !v.pursuit && w.vehicles.list.includes(v)).length;
    if (this.spawnT <= 0 && ambient < this.target) {
      this.spawnT = 0.25;
      this.spawnOne();
    }
  }
}
