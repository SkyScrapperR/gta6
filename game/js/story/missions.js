// Story missions. Each mission is an async script driven by the game loop through small helpers:
// waitFor(condition), cutscene(shots), objective(text), watch(failCheck). Missions start at glowing
// marker cylinders shown on the map, objectives always mirror the real state, failures can be
// retried from the marker, a pass shows MISSION PASSED with the payout and autosaves, and standing
// on a marker when a mission ends never starts the next one — the player has to step off first.
// The six mission scripts themselves live in mission-scripts.js and are installed onto this class.

import { Cutscene } from './cutscene-camera.js';
import { Dialogue } from './dialogue.js';
import { saveGame } from '../save.js';
import { makeRng } from '../core/math.js';

class Abort extends Error {}

export const MISSIONS = [
  { id: 'homecoming', title: 'Homecoming', pay: 500 },
  { id: 'yellow', title: 'Yellow Fever', pay: 1500 },
  { id: 'collections', title: 'Collections', pay: 2000 },
  { id: 'wheelman', title: 'Wheelman', pay: 5000 },
  { id: 'lowtide', title: 'Low Tide', pay: 8000 },
  { id: 'orchid', title: 'Orchid Falls', pay: 15000 },
];

export class MissionSystem {
  constructor(world) {
    this.w = world;
    this.passed = 0;
    this.active = null;
    this.waiters = [];
    this.watchers = [];
    this.spawned = [];
    this.target = null;
    this.targetEnt = null;
    this.armed = true;
    this.rng = makeRng(31337);
    this.safehouseUnlocked = false;
    this.counter = null;
    world.dialogue = new Dialogue(world);
  }

  get passedCount() {
    return this.passed;
  }

  reset() {
    this.abort();
    this.passed = 0;
    this.safehouseUnlocked = false;
    this.armed = true;
  }

  serialize() {
    return { passed: this.passed, safehouse: this.safehouseUnlocked };
  }

  deserialize(d) {
    this.passed = d.passed ?? 0;
    this.safehouseUnlocked = !!d.safehouse || this.passed > 0;
    if (this.passed >= 2) this.w.pickups.spawn('weapon', ...this.w.city.anchors.safehouse.pickup, 36, { weapon: 'pistol', respawn: 120 });
  }

  startNewGame() {
    this.run(0);
  }

  /** Where the marker of mission n stands. */
  markerOf(n) {
    const a = this.w.city.anchors;
    switch (MISSIONS[n]?.id) {
      case 'yellow': case 'collections': case 'lowtide': return a.garage.front;
      case 'wheelman': return a.dex.front;
      case 'orchid': return a.tower.front;
      default: return null;
    }
  }

  // ------------------------------------------------------------ script helpers
  waitFor(cond) {
    return new Promise((res, rej) => this.waiters.push({ cond, res, rej }));
  }

  wait(seconds) {
    const end = this.w.time + seconds;
    return this.waitFor(() => this.w.time >= end);
  }

  watch(fn) {
    this.watchers.push(fn);
  }

  /** Set the current objective. A new objective (not just a counter update) ticks off the previous one. */
  objective(text, sub = null) {
    const stem = (t) => (t ?? '').replace(/[\d/%]+|\[[ x]\]|█|░/g, '').trim();
    if (this.objText && stem(this.objText) !== stem(text)) this.done.push(this.objText.replace(/ *\[[ x]\]/g, ''));
    this.objText = text;
    this.objSub = sub;
    this.w.notes.push({ slot: 'objective', text, sub, duration: Infinity, key: 'obj', priority: 3 });
  }

  /** What the HUD tracker shows: mission title, finished objectives (ticked) and the live one. */
  tracker() {
    if (!this.active || !this.objText) return null;
    const n = MISSIONS.indexOf(this.active);
    return { title: `${n + 1}/6  ${this.active.title.toUpperCase()}`, done: this.done.slice(-3), current: this.objText, sub: this.objSub };
  }

  help(text, duration = 6) {
    this.w.notes.push({ slot: 'help', text, duration, key: 'help' });
  }

  say(lines) {
    return new Promise((res) => this.w.dialogue.say(lines, res));
  }

  cutscene(shots, actors = {}) {
    return new Promise((res) => new Cutscene(this.w, { shots, actors, onEnd: res }).start());
  }

  track(e) {
    this.spawned.push(e);
    return e;
  }

  story(key, x, z, yaw = 0, opts = {}) {
    const p = this.w.peds.spawn(key, x, z, { kind: 'story', state: 'scripted', yaw, health: opts.health ?? 100, ...opts });
    p.keep = true;
    return this.track(p);
  }

  car(type, x, z, yaw, opts = {}) {
    const v = this.w.vehicles.spawn(type, x, z, yaw, { parked: true, ...opts });
    v.mission = { id: this.active?.id };
    return this.track(v);
  }

  near(p, r, inCar = null) {
    const pl = this.w.player;
    if (inCar === true && !pl.vehicle) return false;
    if (inCar && inCar !== true && pl.vehicle !== inCar) return false;
    return Math.hypot(pl.x - p[0], pl.z - p[1]) < r;
  }

  slow() {
    const v = this.w.player.vehicle;
    return !v || Math.abs(v.speed) < 4;
  }

  // ------------------------------------------------------------ flow
  async run(n) {
    const def = MISSIONS[n];
    if (!def || this.active) return;
    this.active = def;
    this.done = [];
    this.objText = null;
    this.armed = false;
    this.w.notes.push({ slot: 'banner', text: def.title.toUpperCase(), color: '#ffd23a', sub: `Mission ${n + 1} of 6`, priority: 4, duration: 2.6 });
    this.watch(() => (this.w.player.dead > 0 ? 'You flatlined.' : this.w.player.cuffed > 0 ? 'You got cuffed.' : null));
    try {
      await this[def.id]();
      this.pass(n);
    } catch (e) {
      if (!(e instanceof Abort)) console.error(e);
      if (this.failReason) this.showFail(this.failReason);
      this.cleanup();
    }
  }

  fail(reason) {
    if (!this.active || this.failReason) return;
    this.failReason = reason;
    for (const w of this.waiters) w.rej(new Abort());
    this.waiters = [];
    this.w.cutscene?.skip();
  }

  abort() {
    if (!this.active) return;
    this.failReason = null;
    for (const w of this.waiters) w.rej(new Abort());
    this.waiters = [];
    this.cleanup();
  }

  showFail(reason) {
    this.w.notes.push({ slot: 'banner', text: 'MISSION FAILED', color: '#ff5a5a', sub: reason, priority: 6, duration: 4 });
    this.w.audio?.sting('failed');
  }

  pass(n) {
    const def = MISSIONS[n];
    this.passed = Math.max(this.passed, n + 1);
    this.w.addMoney(def.pay);
    this.w.stats.missions = this.passed;
    this.w.notes.push({ slot: 'banner', text: 'MISSION PASSED', color: '#ffd23a', sub: `$${def.pay.toLocaleString('en-US')}`, priority: 7, duration: 4.5 });
    this.w.audio?.sting('passed');
    this.w.music?.sting?.('passed');
    this.cleanup(true);
    saveGame(this.w);
    this.w.notes.push({ slot: 'toast', text: 'Autosaved', color: '#2ff3e0', duration: 2 });
    if (this.passed < MISSIONS.length && n < 5) this.help(`New mission available: ${MISSIONS[this.passed].title}. Look for the yellow marker on the map.`, 7);
  }

  cleanup(keepCars = false) {
    for (const e of this.spawned) {
      if (e.mission !== undefined && e.def) {
        // Vehicles: the player may keep driving mission cars.
        if (this.w.player.vehicle === e || keepCars) { e.mission = null; continue; }
        this.w.vehicles.remove(e);
      } else if (e.ring !== undefined || e.anim) {
        this.w.peds.remove(e);
      } else if (e.kind && e.active !== undefined) {
        e.active = false;
      }
    }
    this.spawned = [];
    this.watchers = [];
    this.waiters = [];
    this.target = null;
    this.targetEnt = null;
    this.counter = null;
    this.active = null;
    this.objText = null;
    this.done = [];
    this.failReason = null;
    this.w.missionNoCops = false;
    this.w.notes.clear('objective', 'obj');
    this.w.dialogue.clear();
    this.w.gangCoverTaken.clear();
  }

  // ------------------------------------------------------------ per frame
  update(dt) {
    const w = this.w;
    w.dialogue.update(dt);
    if (this.active) {
      for (const f of this.watchers) {
        const r = f();
        if (r) { this.fail(r); break; }
      }
      for (const wt of [...this.waiters]) {
        let ok = false;
        try { ok = wt.cond(); } catch (e) { console.error(e); }
        if (ok) {
          this.waiters.splice(this.waiters.indexOf(wt), 1);
          wt.res();
        }
      }
      this.tick?.(dt);
    } else {
      // Mission markers: step on to start; must step off first after a mission ends.
      const m = this.markerOf(this.passed);
      if (m) {
        const d = Math.hypot(w.player.x - m[0], w.player.z - m[1]);
        if (d > 4) this.armed = true;
        if (this.armed && d < 1.8 && w.player.alive && !w.failState && !w.player.vehicle) this.run(this.passed);
      }
    }
    // Safehouse save point.
    if (this.safehouseUnlocked && !this.active) {
      const s = w.city.anchors.safehouse.save;
      const d = Math.hypot(w.player.x - s[0], w.player.z - s[1]);
      if (d < 1.4 && this.saveArmed && !w.player.vehicle) {
        this.saveArmed = false;
        saveGame(w);
        w.notes.push({ slot: 'toast', text: 'Game saved', color: '#2ff3e0', duration: 2.5 });
        w.audio?.chime();
      }
      if (d > 3) this.saveArmed = true;
    }
  }

  gpsTarget() {
    if (this.targetEnt && !this.targetEnt.dead) return [this.targetEnt.x, this.targetEnt.z];
    if (this.target) return this.target;
    if (!this.active) return null;
    return null;
  }

  blips() {
    const out = [];
    if (!this.active) {
      const m = this.markerOf(this.passed);
      if (m) out.push({ x: m[0], z: m[1], icon: 'mission', color: '#ffd23a', always: true });
    }
    if (this.safehouseUnlocked) {
      const s = this.w.city.anchors.safehouse.save;
      out.push({ x: s[0], z: s[1], icon: 'save', color: '#2ff3e0' });
    }
    const t = this.gpsTarget();
    if (t) out.push({ x: t[0], z: t[1], icon: 'target', color: '#ffd23a', always: true });
    for (const e of this.spawned) if (e.target && !e.dead) out.push({ x: e.x, z: e.z, dot: true, color: '#ff3a5a', size: 5, always: true });
    return out;
  }

  /** World-space markers for the renderer. */
  queueMarkers(markers) {
    const w = this.w;
    if (!this.active) {
      const m = this.markerOf(this.passed);
      if (m) markers.add(m[0], w.city.groundAt(m[0], m[1]), m[1], 1.5, 3.2, [1.0, 0.75, 0.15]);
    } else if (this.target && !this.targetEnt) {
      markers.add(this.target[0], w.city.groundAt(this.target[0], this.target[1]), this.target[1], this.targetR ?? 3, 2.2, [1.0, 0.8, 0.2]);
    }
    if (this.safehouseUnlocked) {
      const s = w.city.anchors.safehouse.save;
      markers.add(s[0], w.city.groundAt(s[0], s[1]), s[1], 1.0, 1.6, [0.2, 1.0, 0.9]);
    }
  }
}
