// Wanted level and police response. Crimes raise a heat score that maps to 0-5 stars. Police only
// learn the player's position through line of sight (ray casts from officers, cars and the
// helicopter); while unseen the stars flash, a search area shows on the minimap, and after a time
// that grows with the level the stars clear. Patrol cars route over the road graph, switch to direct
// pursuit and ram when close, drop officers who arrest (1 star) or shoot (2+ stars), and those
// officers run back and re-board when the player drives away. Kilat Respray clears it all.

import { LaneDriver } from './traffic.js';
import { clamp, wrapAngle, damp, dampAngle, makeRng } from '../core/math.js';

const STAR_HEAT = [0, 1, 4, 9, 16, 26];

export class WantedSystem {
  constructor(world) {
    this.world = world;
    this.heat = 0;
    this.stars = 0;
    this.seen = false;
    this.unseenT = 0;
    this.lastKnown = [0, 0];
    this.flash = false;
    this.cooldown = 0;
  }

  starsFor(h) {
    let s = 0;
    for (let k = 1; k <= 5; k++) if (h >= STAR_HEAT[k]) s = k;
    return s;
  }

  /** Report a crime. needWitness: only counts if an officer can see the player. */
  crime(amount, needWitness = false) {
    if (this.world.missionNoCops) return;
    if (needWitness && !this.witnessed()) return;
    this.heat += amount;
    const s = Math.max(this.stars, this.starsFor(this.heat));
    this.setStars(s);
    this.reveal();
  }

  setStars(n) {
    n = clamp(Math.round(n), 0, 5);
    if (n > this.stars) {
      this.heat = Math.max(this.heat, STAR_HEAT[n]);
      this.world.onStarsRaised?.(n);
      this.reveal();
    }
    this.stars = n;
    if (n === 0) this.heat = 0;
  }

  addStars(n) {
    this.setStars(Math.min(5, this.stars + n));
  }

  clear() {
    this.stars = 0;
    this.heat = 0;
    this.unseenT = 0;
    this.seen = false;
    this.world.police?.standDown();
  }

  reveal() {
    const p = this.world.player;
    this.lastKnown = [p.x, p.z];
    this.unseenT = 0;
    this.seen = true;
  }

  /** Is any officer (car, foot, helicopter) able to see the player right now? */
  witnessed() {
    const w = this.world;
    const p = w.player;
    const py = p.y + 1.4;
    const col = w.city.col;
    for (const v of w.vehicles.list) {
      if (!v.police || v.wrecked || !v.driver || v.driver === 'player') continue;
      const d = Math.hypot(v.x - p.x, v.z - p.z);
      if (d < 85 && col.lineClear(v.x, v.y + 1.4, v.z, p.x, py, p.z)) return true;
    }
    for (const c of w.peds?.list ?? []) {
      if (c.kind !== 'cop' || c.dead || c.hidden) continue;
      const d = Math.hypot(c.x - p.x, c.z - p.z);
      if (d < 70 && col.lineClear(c.x, c.y + 1.6, c.z, p.x, py, p.z)) return true;
    }
    const heli = w.heli;
    if (heli && heli.active && !heli.down) {
      const d = Math.hypot(heli.x - p.x, heli.z - p.z);
      if (d < 120 && col.lineClear(heli.x, heli.y - 1, heli.z, p.x, py, p.z)) return true;
    }
    return false;
  }

  /** Seconds unseen before the stars clear. */
  get clearTime() {
    return 7 + this.stars * 5;
  }

  get searchRadius() {
    return 45 + this.stars * 18;
  }

  update(dt) {
    if (this.stars === 0) {
      this.seen = false;
      this.flash = false;
      return;
    }
    this.cooldown -= dt;
    if (this.cooldown <= 0) {
      this.cooldown = 0.25;
      this.seen = this.witnessed();
      if (this.seen) this.reveal();
    }
    if (!this.seen) {
      this.unseenT += dt;
      // Leaving the search area speeds up losing them.
      const p = this.world.player;
      if (Math.hypot(p.x - this.lastKnown[0], p.z - this.lastKnown[1]) > this.searchRadius) this.unseenT += dt;
      if (this.unseenT > this.clearTime) {
        this.world.onWantedLost?.(this.stars);
        this.clear();
      }
    }
    this.flash = !this.seen;
  }
}

/** Drives a police car: road-graph routing towards the target, then direct pursuit and ramming. */
class PursuitDriver extends LaneDriver {
  constructor(v, roads, rng, from, to, police) {
    super(v, roads, rng, from, to);
    this.police = police;
    this.cruise = 25;
    this.mode = 'route';
    this.stuckT = 0;
  }

  planNext() {
    const goal = this.police.targetPoint();
    const via = this.to;
    let best = null, bd = Infinity;
    for (const id of via.links) {
      const n = this.roads.nodes[id];
      if (n === this.from && via.links.length > 1) continue;
      const d = Math.hypot(n.x - goal[0], n.z - goal[1]);
      if (d < bd) { bd = d; best = n; }
    }
    const next = best ?? this.from;
    const c = this.roads.turnCurve(this.from, via, next);
    for (let k = 1; k <= 4; k++) {
      const u = k / 4, uu = 1 - u;
      this.wps.push({ x: uu * uu * c.p0[0] + 2 * uu * u * c.p1[0] + u * u * c.p2[0], z: uu * uu * c.p0[1] + 2 * uu * u * c.p1[1] + u * u * c.p2[1], kind: 'turn' });
    }
    this.from = via;
    this.to = next;
    this.buildLane();
  }

  update(dt, world) {
    const v = this.v;
    if (v.wrecked) return;
    v.siren = world.wanted.stars > 0;
    const goal = this.police.targetPoint();
    const p = world.player;
    const d = Math.hypot(goal[0] - v.x, goal[1] - v.z);
    const close = d < 55 && world.wanted.seen;
    if (close) {
      // Direct pursuit: aim slightly ahead of a moving target, ram at speed.
      let tx = goal[0], tz = goal[1];
      if (p.vehicle) {
        const pv = p.vehicle;
        const lead = clamp(d / 25, 0, 1.2);
        tx += pv.forward[0] * pv.speed * lead;
        tz += pv.forward[1] * pv.speed * lead;
      }
      const err = wrapAngle(Math.atan2(tx - v.x, tz - v.z) - v.yaw);
      v.steer = clamp(err * 2.5, -1, 1);
      const onFoot = !p.vehicle || Math.abs(p.vehicle.speed) < 3;
      const want = onFoot && d < 16 ? 0 : clamp(d * 0.8, 8, 30);
      const ds = want - v.speed;
      v.throttle = ds > 0 ? clamp(ds * 0.4, 0, 1) : 0;
      v.brake = ds < -2 ? 1 : 0;
      v.handbrake = Math.abs(err) > 1.2 && v.speed > 12;
      if (Math.abs(err) > 2.4 && v.speed < 4) { v.throttle = -0.8; v.steer = -v.steer; }
      // Stuck against something: back out.
      if (v.speed < 1 && want > 3) this.stuckT += dt; else this.stuckT = 0;
      if (this.stuckT > 1.5) { this.reverseT = 1.2; this.stuckT = 0; }
      if (this.reverseT > 0) { this.reverseT -= dt; v.throttle = -0.8; v.steer = -v.steer; v.brake = 0; }
      this.mode = 'pursue';
      this.wps.length = 0;
      return;
    }
    if (this.mode === 'pursue') {
      // Rejoin the road network.
      this.mode = 'route';
      const a = this.roads.nearestNode(v.x, v.z);
      const b = this.roads.nodes[a.links.reduce((best, id) => {
        const n = this.roads.nodes[id];
        return Math.hypot(n.x - goal[0], n.z - goal[1]) < Math.hypot(this.roads.nodes[best].x - goal[0], this.roads.nodes[best].z - goal[1]) ? id : best;
      }, a.links[0])];
      this.from = a;
      this.to = b;
      this.wps.length = 0;
      this.buildLane();
    }
    // Routed driving ignores lights, keeps the obstacle logic.
    const saved = this.roads.signal;
    this.roads.signal = () => 'green';
    super.update(dt, world);
    this.roads.signal = saved;
  }
}

/** Officer on foot. */
export class CopBrain {
  constructor(police, car) {
    this.police = police;
    this.car = car;
    this.state = 'deploy';
    this.t = 0;
    this.fireT = 1 + Math.random();
    this.arrestT = 0;
    this.strafe = Math.random() < 0.5 ? 1 : -1;
  }

  update(dt, c) {
    const w = this.police.world;
    const p = w.player;
    this.t += dt;
    const stars = w.wanted.stars;
    const d = Math.hypot(p.x - c.x, p.z - c.z);
    const playerDriving = p.vehicle && Math.abs(p.vehicle.speed) > 6;
    if (stars === 0 && this.state !== 'board') this.state = 'return';
    if (this.state === 'deploy') {
      c.speed = 0;
      if (this.t > 0.5) this.state = 'chase';
    } else if (this.state === 'chase') {
      if (playerDriving && d > 18 && this.car && !this.car.wrecked) { this.state = 'return'; return; }
      const tgt = w.wanted.seen ? [p.x, p.z] : w.wanted.lastKnown;
      const canSee = d < 45 && w.city.col.lineClear(c.x, c.y + 1.6, c.z, p.x, p.y + 1.2, p.z);
      if (stars >= 2 && canSee && d < 28 && d > 4) {
        // Hold position, strafe a little, shoot.
        c.aim = 1;
        c.twoHanded = false;
        c.aimPitch = 0;
        const fx = (p.x - c.x) / d, fz = (p.z - c.z) / d;
        c.vx = damp(c.vx, -fz * this.strafe * 1.2, 4, dt);
        c.vz = damp(c.vz, fx * this.strafe * 1.2, 4, dt);
        c.yaw = dampAngle(c.yaw, Math.atan2(fx, fz), 10, dt);
        c.integrate(dt);
        if (Math.random() < dt * 0.3) this.strafe = -this.strafe;
        this.fireT -= dt;
        if (this.fireT <= 0) {
          this.fireT = 0.7 + Math.random() * 0.8;
          w.combat?.npcFire(c, 'pistol', p, 0.3 + stars * 0.04);
        }
      } else {
        c.aim = 0;
        c.moveTo(dt, tgt[0], tgt[1], d < 3 ? 2.5 : 5.4);
        if (stars === 1 && d < 1.6 && !p.vehicle && p.alive) {
          this.arrestT += dt;
          c.handsUp = 0;
          if (this.arrestT > 1.1) w.onArrest?.(c);
        } else this.arrestT = Math.max(0, this.arrestT - dt);
        if (stars === 1 && d < 2.2 && p.vehicle && Math.abs(p.vehicle.speed) < 1.5) {
          this.arrestT += dt;
          if (this.arrestT > 1.6) w.onArrest?.(c);
        }
      }
    } else if (this.state === 'return') {
      c.aim = 0;
      if (!this.car || this.car.wrecked) { this.state = stars ? 'chase' : 'idle'; return; }
      const dp = this.car.doorPoint(this.seatSide ?? 0);
      const dd = c.moveTo(dt, dp[0], dp[1], 5.2);
      if (dd < 1.1) {
        // Re-board: the car takes the officer back.
        this.state = 'board';
        this.car.doorTarget[this.seatSide === 1 ? 0 : 1] = 1;
        this.t = 0;
      }
      if (!playerDriving && stars > 0 && d < 15) this.state = 'chase';
    } else if (this.state === 'board') {
      if (this.t > 0.4) {
        this.car.doorTarget[0] = this.car.doorTarget[1] = 0;
        c.hidden = true;
        this.police.reboard(c, this.car);
      }
    } else {
      c.aim = 0;
      c.vx = damp(c.vx, 0, 5, dt);
      c.vz = damp(c.vz, 0, 5, dt);
      c.integrate(dt);
    }
  }

  onHurt() {
    this.state = 'chase';
  }
}

export class PoliceSystem {
  constructor(world) {
    this.world = world;
    this.rng = makeRng(911);
    this.units = []; // police cars in pursuit
    this.spawnT = 0;
    this.patrolT = 0;
  }

  targetPoint() {
    const w = this.world;
    if (w.wanted.seen || w.wanted.stars === 0) return [w.player.x, w.player.z];
    return w.wanted.lastKnown;
  }

  /** Spawn a police car on a lane 130-200 m away and set it hunting. */
  dispatch(minD = 70, maxD = 130) {
    const w = this.world;
    const v = w.traffic.spawnOne(minD, maxD, false, 'patrol');
    if (!v) return null;
    this.enlist(v);
    return v;
  }

  enlist(v) {
    const w = this.world;
    const a = v.ai?.from ?? w.city.roads.nearestNode(v.x, v.z);
    const b = v.ai?.to ?? w.city.roads.nodes[a.links[0]];
    v.ai = new PursuitDriver(v, w.city.roads, this.rng, a, b, this);
    v.driver = 'police';
    v.pursuit = true;
    v.officers = 2;
    v.deployed = [];
    this.units.push(v);
  }

  /** Officers leave a stopped car near the player. */
  deploy(v) {
    const w = this.world;
    for (let k = 0; k < v.officers; k++) {
      const dp = v.doorPoint(k);
      const c = w.peds.spawn('cop', dp[0], dp[1], { kind: 'cop', health: 60, yaw: v.yaw, state: 'scripted' });
      c.keep = true;
      c.brain = new CopBrain(this, v);
      c.brain.seatSide = k;
      v.deployed.push(c);
      v.doorTarget[k === 0 ? 1 : 0] = 1;
    }
    v.officers = 0;
    v.driver = 'parked-police';
    v.throttle = 0;
    v.brake = 1;
    setTimeout(() => { v.doorTarget[0] = v.doorTarget[1] = 0; }, 700);
  }

  reboard(c, v) {
    const w = this.world;
    w.peds.remove(c);
    v.officers = (v.officers ?? 0) + 1;
    v.deployed = v.deployed.filter((o) => o !== c);
    if (v.deployed.length === 0 && !v.wrecked) {
      v.driver = 'police';
      v.brake = 0;
    }
  }

  /** At 3+ stars: two cruisers parked across the road the player is heading for, officers beside them. */
  roadblock() {
    const w = this.world;
    const p = w.player;
    const v = p.vehicle;
    if (!v || Math.abs(v.speed) < 8) return;
    const roads = w.city.roads;
    const ahead = roads.nodeAhead(v.x, v.z, v.forward[0], v.forward[1]);
    const next = roads.nodeAhead(ahead.x + v.forward[0] * 60, ahead.z + v.forward[1] * 60, v.forward[0], v.forward[1]);
    if (!next || next === ahead) return;
    const d = Math.hypot(next.x - p.x, next.z - p.z);
    if (d < 70 || w.camera.frustum.sphereVisible(next.x, 1, next.z, 8) && d < 110) return;
    const lane = roads.laneOf(next, ahead);
    const mx = lane.start[0], mz = lane.start[1];
    const perp = Math.atan2(lane.dir[1], -lane.dir[0]);
    for (const s of [-1, 1]) {
      const c = w.vehicles.spawn('patrol', mx + Math.cos(perp + Math.PI / 2) * 0 + lane.dir[1] * s * 2.7, mz - lane.dir[0] * s * 2.7, perp + (s > 0 ? 0.25 : -0.25), { parked: true });
      c.siren = true;
      c.roadblock = true;
      c.pursuit = true;
      c.officers = 1;
      c.deployed = [];
      c.driver = 'parked-police';
      this.units.push(c);
      const cop = w.peds.spawn('cop', c.x - lane.dir[0] * 3, c.z - lane.dir[1] * 3, { kind: 'cop', health: 60, state: 'scripted' });
      cop.keep = true;
      cop.brain = new CopBrain(this, c);
      cop.brain.state = 'chase';
      c.deployed.push(cop);
    }
    w.notes.push({ slot: 'toast', text: 'Roadblock ahead!', color: '#4a8aff', duration: 2.5 });
  }

  standDown() {
    for (const v of this.units) {
      v.siren = false;
      v.pursuit = false;
    }
  }

  update(dt) {
    const w = this.world;
    const stars = w.wanted.stars;
    this.units = this.units.filter((v) => w.vehicles.list.includes(v));
    // Patrols already in traffic join a chase nearby.
    if (stars > 0) {
      for (const v of w.vehicles.list) {
        if (v.police && v.driver === 'npc' && !v.pursuit && Math.hypot(v.x - w.player.x, v.z - w.player.z) < 160) this.enlist(v);
      }
      const want = [0, 1, 2, 3, 4, 5][stars];
      const active = this.units.filter((v) => !v.wrecked && v.pursuit).length;
      this.spawnT -= dt;
      if (active < want && this.spawnT <= 0) {
        this.spawnT = 2.5;
        this.dispatch();
      }
      this.roadblockT = (this.roadblockT ?? 12) - dt;
      if (stars >= 3 && this.roadblockT <= 0 && !w.missionNoCops) {
        this.roadblockT = 28;
        this.roadblock();
      }
    } else {
      // Keep a couple of patrol cars in normal traffic.
      this.patrolT -= dt;
      const patrols = w.vehicles.list.filter((v) => v.police && v.driver === 'npc').length;
      if (patrols < 2 && this.patrolT <= 0) {
        this.patrolT = 5;
        w.traffic.spawnOne(120, 230, false, 'patrol');
      }
    }
    for (const v of this.units) {
      if (v.wrecked) continue;
      if (v.driver === 'police' && v.ai) {
        v.ai.update(dt, w);
        const p = w.player;
        const d = Math.hypot(v.x - p.x, v.z - p.z);
        const playerSlow = !p.vehicle || Math.abs(p.vehicle.speed) < 3;
        if (stars > 0 && d < 16 && playerSlow && Math.abs(v.speed) < 3 && v.officers > 0) this.deploy(v);
        if (stars === 0 && v.pursuit === false) {
          v.driver = 'npc';
          v.ai = new LaneDriver(v, w.city.roads, this.rng, w.city.roads.nearestNode(v.x, v.z), w.city.roads.nodes[w.city.roads.nearestNode(v.x, v.z).links[0]]);
        }
      } else if (v.driver === 'parked-police') {
        v.throttle = 0;
        v.brake = 1;
        if (v.deployed.length === 0) v.driver = 'police';
      }
      // Far, unseen pursuers are recycled.
      if (Math.hypot(v.x - w.player.x, v.z - w.player.z) > 320 && stars === 0) w.vehicles.remove(v);
    }
    // Officers on foot left behind with no stars walk off and vanish when far.
    for (const c of [...w.peds.list]) {
      if (c.kind === 'cop' && !c.dead && stars === 0 && Math.hypot(c.x - w.player.x, c.z - w.player.z) > 120) w.peds.remove(c);
    }
  }
}
