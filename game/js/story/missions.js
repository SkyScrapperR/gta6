// Story missions. Each mission is an async script driven by the game loop through small helpers:
// waitFor(condition), cutscene(shots), objective(text), watch(failCheck). Missions start at glowing
// marker cylinders shown on the map, objectives always mirror the real state, failures can be
// retried from the marker, a pass shows MISSION PASSED with the payout and autosaves, and standing
// on a marker when a mission ends never starts the next one — the player has to step off first.

import { POINTS } from '../world/layout.js';
import { GangBrain } from '../ai/combat-ai.js';
import { LaneDriver } from '../ai/traffic.js';
import { Cutscene, twoShot, openSide, sweep } from './cutscene-camera.js';
import { Dialogue } from './dialogue.js';
import { saveGame } from '../save.js';
import { makeRng, dampAngle } from '../core/math.js';

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

  objective(text, sub = null) {
    this.objText = text;
    this.w.notes.push({ slot: 'objective', text, sub, duration: Infinity, key: 'obj', priority: 3 });
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

  // ------------------------------------------------------------ shared scenes
  linShots(lin, lines, extra = []) {
    const w = this.w;
    const kai = w.player;
    // Frame from the street side: the open bay, lifted cars and the neon sign sit behind the pair.
    const sides = [1, -1].map((sd) => [sd, twoShot({ ...kai }, { ...lin }, sd).pos[2]]);
    const side = sides[0][1] < sides[1][1] ? sides[0][0] : sides[1][0];
    void openSide;
    return [
      { dur: 3, lines: lines.slice(0, 2), cam: (k) => { const s = twoShot(kai, lin, side, 3.6 - k * 0.4, 1.55, -0.2); return { ...s, fov: 42 }; } },
      { dur: 3, lines: lines.slice(2), cam: (k) => { const s = twoShot(kai, lin, side, 2.6, 1.6, 0.6 + k * 0.2); return { ...s, fov: 38 }; } },
      ...extra,
    ];
  }

  /** Put Kai and Mama Lin face to face inside the garage bay. */
  stageGarage() {
    const w = this.w;
    const g = w.city.anchors.garage;
    const lin = this.story('lin', g.cutLin[0], g.cutLin[1]);
    const p = w.player;
    if (p.vehicle) { p.vehicle.driver = null; p.vehicle = null; p.seat = 0; w.entry.seq = null; }
    p.place(g.cutKai[0], g.cutKai[1], 0);
    p.vx = p.vz = 0;
    p.speed = 0;
    lin.yaw = Math.atan2(p.x - lin.x, p.z - lin.z);
    p.yaw = Math.atan2(lin.x - p.x, lin.z - p.z);
    return lin;
  }

  // ------------------------------------------------------------ 1. Homecoming
  async homecoming() {
    const w = this.w;
    const a = w.city.anchors;
    w.env.hour = 17.55;
    const car = this.car('merpati', POINTS.homecomingCar[0], 1005.3, -Math.PI / 2, { color: '#2a5a8a' });
    const p = w.player;
    p.place(POINTS.ferryPier[0], POINTS.ferryPier[1], Math.PI);
    const tower = a.tower.top;
    await this.cutscene([
      { dur: 6.5, lines: [['kai', 'Five years. Selara Bay still smells like salt and diesel.', 3.4]], cam: sweep([300, 140, 1300], [470, 30, 1160], [600, 40, 500], [450, 4, 1120], 55) },
      { dur: 5, lines: [['kai', "Ferry's late, sun's going down, and the Orchid's lit up like it owns the sky.", 4]], cam: sweep([451.6, 2.1, 1109.5], [451.2, 2.3, 1108], [tower[0], tower[1] - 90, tower[2]], [tower[0], tower[1] - 110, tower[2]], 50), setup: () => { p.place(450, 1104, Math.PI); } },
      { dur: 6, lines: [['lin', 'Kai? You actually came back. Good. Your aunt is not getting any younger.', 3.6], ['lin', "The blue Merpati by the boardwalk is yours. Drive it to the garage. Don't scratch it.", 4]], cam: (k) => ({ pos: [452 + k, 1.9, 1108 + k * 2], target: [450, 1.5, 1095], fov: 45 }), setup: () => { p.place(450, 1100, Math.PI); } },
    ], { kai: p });
    p.place(450, 1076, Math.PI);
    w.camCtl.face(Math.PI);
    this.objective('Get in the Merpati', 'Walk to the blue car on the coast road · F to enter');
    this.targetEnt = car;
    this.help('WASD to move, Shift to sprint, mouse to look.\nPress F next to a car to get in.');
    this.watch(() => (car.wrecked ? 'The Merpati was destroyed.' : null));
    await this.waitFor(() => p.vehicle === car);
    this.targetEnt = null;
    this.target = a.garage.bay;
    this.targetR = 3.5;
    this.objective("Drive to Lin's Garage", 'Follow the pink GPS line · W/S drive · A/D steer · Space handbrake');
    await this.waitFor(() => this.near(a.garage.bay, 5, car) && this.slow());
    car.throttle = 0;
    car.handbrake = true;
    this.target = null;
    w.env.hour = Math.max(w.env.hour, 17.7);
    const lin = this.stageGarage();
    await this.cutscene(this.linShots(lin, [
      ['lin', 'Look at you. Taller. Still terrible at parking.'],
      ['kai', "Missed you too, Mama Lin. The Orchid sign's new."],
      ['lin', "Viktor Raza's people put it up. They own half the coast now. Rent, protection, the docks."],
      ['lin', 'The old place in Bukit Asri is yours again. Get some sleep. Tomorrow, you work.'],
    ]), { lin, kai: p });
    this.safehouseUnlocked = true;
    this.help('Safehouse unlocked in Bukit Asri. Step on the teal SAVE marker there to save your game.', 7);
  }

  // ------------------------------------------------------------ 2. Yellow Fever
  async yellow() {
    const w = this.w;
    const a = w.city.anchors;
    const p = w.player;
    const lin = this.stageGarage();
    await this.cutscene(this.linShots(lin, [
      ['lin', "Viktor's nephew Rendy parks a yellow Vesper GT outside Bank Samudra like the street is his."],
      ['kai', 'And you want it here.'],
      ['lin', 'In one piece. Rendy cries, Viktor notices, and we learn who answers his phone.'],
    ]), { lin, kai: p });
    this.w.peds.remove(lin);
    const g = a.bank.getaway;
    const car = this.car('vesper', g[0], g[1], Math.PI / 2, { color: '#f2c41a' });
    const rendy = this.story('rendy', g[0] - 1, g[1] - 3.2, 0);
    rendy.phone = 0.001;
    this.targetEnt = car;
    this.objective("Steal Rendy's yellow Vesper GT", 'Downtown, outside Bank Samudra');
    this.watch(() => (car.wrecked ? 'The Vesper was destroyed.' : null));
    await this.waitFor(() => p.vehicle === car);
    w.wanted.setStars(Math.max(1, w.wanted.stars));
    rendy.state = 'scripted';
    rendy.kind = 'civ';
    rendy.flee(p.x, p.z, 12);
    w.dialogue.say([['rendy', 'Hey! HEY! That is my car! Uncle Viktor is going to kill you!', 3]]);
    this.targetEnt = null;
    this.target = a.garage.bay;
    this.targetR = 3.5;
    this.watch(() => (car.health < car.maxHealth * 0.25 ? 'The Vesper is too damaged.' : null));
    this.tick = () => {
      const pct = Math.round((100 * car.health) / car.maxHealth);
      const obj = w.wanted.stars > 0 ? 'Lose the cops, then deliver the Vesper' : "Deliver the Vesper to Lin's Garage";
      const sub = `Car condition ${pct}% (keep it above 25%) · Kilat Respray clears your stars for $100`;
      if (obj !== this.objText || this.lastSub !== sub) { this.lastSub = sub; this.objective(obj, sub); }
    };
    await this.waitFor(() => this.near(a.garage.bay, 5, car) && this.slow() && w.wanted.stars === 0);
    this.tick = null;
    car.handbrake = true;
    const lin2 = this.stageGarage();
    await this.cutscene(this.linShots(lin2, [
      ['lin', 'Not a scratch. Almost.'],
      ['lin', 'There is a Kobra 9 under the floorboard at your safehouse. For emergencies.'],
      ['kai', 'Everything in this town is an emergency.'],
    ]), { lin: lin2, kai: p });
    this.w.vehicles.remove(car);
    w.pickups.spawn('weapon', ...a.safehouse.pickup, 36, { weapon: 'pistol', respawn: 120 });
    this.help('A Kobra 9 pistol is waiting at your safehouse.\nRight mouse to aim, left mouse to shoot, R to reload.', 8);
  }

  // ------------------------------------------------------------ 3. Collections
  async collections() {
    const w = this.w;
    const a = w.city.anchors;
    const p = w.player;
    const lin = this.stageGarage();
    await this.cutscene(this.linShots(lin, [
      ['lin', 'Kedai Orchid. Nice coffee, terrible landlords. Viktor sends four men to collect every Friday.'],
      ['kai', 'Today is Friday.'],
      ['lin', 'Bring back the bag. The owners will need it more than Viktor does.'],
    ]), { lin, kai: p });
    this.w.peds.remove(lin);
    this.target = a.cafe.front;
    this.targetR = 4;
    this.objective('Go to Kedai Orchid', 'The café in Kota Lama');
    await this.waitFor(() => this.near(a.cafe.front, 55));
    const f = a.cafe.fightArea;
    const guards = [];
    for (let k = 0; k < 4; k++) {
      const g = this.story('gang', f[0] - 6 + k * 4, f[1] + (k % 2) * 2, 0, { kind: 'gang', health: 70 });
      g.kind = 'gang';
      g.target = true;
      g.weapon = k % 2 ? 'pistol' : 'fists';
      g.brain = new GangBrain(w, { weapon: k % 2 ? 'pistol' : 'pistol', accuracy: 0.22, alertRadius: 30, home: [g.x, g.z] });
      guards.push(g);
    }
    this.target = null;
    w.missionNoCops = true;
    this.tick = () => {
      const down = guards.filter((g) => g.dead).length;
      const t = `Defeat the Orchid enforcers ${down}/4`;
      if (t !== this.objText) this.objective(t, 'Fists or a gun — they fight back');
    };
    await this.waitFor(() => guards.every((g) => g.dead));
    this.tick = null;
    w.missionNoCops = false;
    const last = guards[guards.length - 1];
    let taken = false;
    const bag = w.pickups.spawn('bag', last.x, last.z, 0, { onTake: () => { taken = true; } });
    this.track(bag);
    this.target = [last.x, last.z];
    this.targetR = 1.5;
    this.objective('Grab the cash bag');
    await this.waitFor(() => taken);
    this.target = a.garage.bay;
    this.targetR = 3.5;
    this.objective("Bring the cash to Lin's Garage");
    await this.waitFor(() => this.near(a.garage.bay, 5) && this.slow());
  }

  // ------------------------------------------------------------ 4. Wheelman
  async wheelman() {
    const w = this.w;
    const a = w.city.anchors;
    const p = w.player;
    const dexDoor = a.dex.door;
    const dex = this.story('dex', dexDoor[0], dexDoor[1] + 0.5, Math.PI, { health: 150 });
    dex.headphones = true;
    w.dialogue.actors = { dex };
    await this.say([
      ['dex', "Kai Santoso. Lin said you'd show up looking dramatic. Nailed it.", 3.2],
      ['dex', "Bank Samudra's vault logs say Viktor launders through account 9. I need fifteen seconds at their terminal.", 4.2],
      ['dex', 'Get us a car. Something that runs.', 2.4],
    ]);
    if (!p.vehicle) {
      this.objective('Get a car', 'Any car will do · F to steal one');
      await this.waitFor(() => !!p.vehicle && !p.vehicle.wrecked);
    }
    let car = p.vehicle;
    this.targetEnt = dex;
    this.objective('Pick up Dex', "Stop next to Dex outside his apartment");
    await this.waitFor(() => p.vehicle && this.near([dex.x, dex.z], 9, true) && Math.abs(p.vehicle.speed) < 2);
    car = p.vehicle;
    // Dex walks to the passenger door and gets in.
    await this.waitFor(() => {
      const dp = car.doorPoint(1);
      car.doorTarget[0] = 1;
      return dex.moveTo(1 / 60, dp[0], dp[1], 3.5, false) < 0.7;
    });
    dex.hidden = true;
    car.doorTarget[0] = 0;
    car.passenger = dex;
    this.targetEnt = null;
    this.watch(() => (car.wrecked && car.passenger === dex ? "The car blew up with Dex inside." : null));
    this.watch(() => (dex.dead ? 'Dex is down.' : null));
    w.dialogue.say([['dex', 'Bank Samudra. Kota Lama. Park out front and keep the engine running.', 3]]);
    const g = a.bank.getaway;
    this.target = g;
    this.targetR = 4;
    this.objective('Drive to Bank Samudra');
    await this.waitFor(() => this.near(g, 7, car) && Math.abs(car.speed) < 2);
    this.target = null;
    // Dex goes in.
    dex.hidden = false;
    const dp = car.doorPoint(1);
    dex.x = dp[0]; dex.z = dp[1];
    car.passenger = null;
    const bankDoor = a.bank.door;
    let t = 15;
    this.tick = (dt) => {
      t -= dt;
      if (!dex.hidden) {
        if (dex.moveTo(dt, bankDoor[0], bankDoor[1], 3.6, false) < 1.2) dex.hidden = true;
      }
      const label = `Wait for Dex: ${Math.max(0, Math.ceil(t))}`;
      if (label !== this.objText) this.objective(label, 'Stay with the car');
    };
    this.watch(() => (Math.hypot(p.x - g[0], p.z - g[1]) > 45 ? 'You left Dex behind.' : null));
    await this.waitFor(() => t <= 0);
    this.tick = null;
    this.watchers.pop();
    w.wanted.setStars(3);
    w.notes.push({ slot: 'help', text: 'The bank alarm is ringing. Three stars!', duration: 4, key: 'help' });
    // Dex runs back out and jumps in.
    dex.hidden = false;
    dex.x = bankDoor[0]; dex.z = bankDoor[1];
    w.dialogue.say([['dex', 'Got it! Alarm, alarm, very loud alarm! DRIVE!', 2.6]]);
    car = p.vehicle ?? car;
    this.targetEnt = dex;
    this.objective('Wait for Dex to get in');
    await this.waitFor(() => {
      const c = p.vehicle;
      if (!c) return false;
      const d = c.doorPoint(1);
      return dex.moveTo(1 / 50, d[0], d[1], 5.5, false) < 0.9;
    });
    car = p.vehicle;
    dex.hidden = true;
    car.passenger = dex;
    this.targetEnt = null;
    this.watch(() => (car.wrecked && car.passenger === dex ? 'The car blew up with Dex inside.' : null));
    this.objective('Lose the cops', 'Break line of sight and leave the search area');
    await this.waitFor(() => w.wanted.stars === 0);
    this.target = a.dex.front;
    this.targetR = 4;
    this.objective("Drop Dex at his apartment");
    await this.waitFor(() => p.vehicle && this.near(a.dex.front, 8, true) && Math.abs(p.vehicle.speed) < 2);
    const c2 = p.vehicle;
    c2.passenger = null;
    dex.hidden = false;
    const d2 = c2.doorPoint(1);
    dex.x = d2[0]; dex.z = d2[1];
    await this.say([['dex', "Account 9 is Viktor's whole empire in a spreadsheet. Give me a week.", 3.2], ['kai', 'You have two days.', 1.8]]);
  }

  // ------------------------------------------------------------ 5. Low Tide
  async lowtide() {
    const w = this.w;
    const a = w.city.anchors;
    const p = w.player;
    const lin = this.stageGarage();
    w.env.hour = 22.4;
    await this.cutscene(this.linShots(lin, [
      ['lin', "Dex found it. Orchid Freight, Pier 9. A Bison truck full of guns leaves at dawn."],
      ['lin', 'Six guards. There is a Wasp on my workbench. Use it, then bring it back clean.'],
      ['kai', "Low tide. Let's make some noise."],
    ]), { lin, kai: p });
    this.w.peds.remove(lin);
    let got = !!w.arsenal.owned.smg;
    if (!got) {
      const g = a.garage;
      const pk = w.pickups.spawn('weapon', g.inside[0], g.inside[1] + 6, 120, { weapon: 'smg', onTake: () => { got = true; } });
      this.track(pk);
      this.target = [g.inside[0], g.inside[1] + 6];
      this.targetR = 1.2;
      this.objective('Grab the Wasp SMG from the workbench');
      await this.waitFor(() => got);
    }
    const fr = a.freight;
    this.target = fr.entrance;
    this.targetR = 5;
    this.objective('Go to Orchid Freight', 'Pier 9 Docks');
    await this.waitFor(() => this.near(fr.entrance, 75));
    this.target = null;
    const truck = this.car('bison', fr.truck[0], fr.truck[1], Math.PI / 2, { color: '#3a2a4a', health: 900 });
    truck.mission.locked = true;
    truck.target = true;
    const guards = fr.guardSpots.map(([x, z], k) => {
      const g = this.story('gang', x, z, 0, { kind: 'gang', health: 90 });
      g.kind = 'gang';
      g.target = true;
      g.weapon = k % 3 === 0 ? 'smg' : 'pistol';
      g.brain = new GangBrain(w, { weapon: g.weapon, accuracy: 0.24, alertRadius: 40, home: [x, z] });
      return g;
    });
    w.missionNoCops = true;
    this.tick = () => {
      const down = guards.filter((g) => g.dead).length;
      const t = `Defeat the guards ${down}/6 · Destroy the Bison ${truck.wrecked ? '✔' : '✘'}`;
      if (t !== this.objText) this.objective(t, 'Shoot the truck until it explodes');
      if (guards.some((g) => g.brain.state !== 'guard')) for (const g of guards) g.brain.alert();
    };
    await this.waitFor(() => guards.every((g) => g.dead) && truck.wrecked);
    this.tick = null;
    w.missionNoCops = false;
    w.wanted.setStars(2);
    const safe = [fr.entrance[0] - 260, fr.entrance[1]];
    this.target = safe;
    this.objective('Escape the docks', 'Get away from Pier 9');
    await this.waitFor(() => Math.hypot(p.x - fr.entrance[0], p.z - fr.entrance[1]) > 220);
  }

  // ------------------------------------------------------------ 6. Orchid Falls
  async orchid() {
    const w = this.w;
    const a = w.city.anchors;
    const p = w.player;
    w.env.hour = Math.max(19.2, Math.min(w.env.hour, 23));
    const cs = a.tower.carStart;
    const car = this.car('vesper', cs[0], cs[1], Math.PI / 2, { color: '#111114', health: 1600 });
    car.mission.locked = true;
    const viktor = this.story('viktor', cs[0] - 2, cs[1] - 3, Math.PI, { health: 200 });
    p.place(a.tower.front[0], a.tower.front[1], Math.PI / 2);
    await this.cutscene([
      { dur: 4, lines: [['viktor', 'Kai Santoso. You should have stayed on the ferry.', 3]], cam: (k) => { const s = twoShot(p, viktor, openSide(w, p, viktor), 4 - k * 0.6, 1.6); return { ...s, fov: 40 }; } },
      { dur: 4, lines: [['kai', "Account 9 is all over the news, Viktor. The Orchid's wilting."], ['viktor', 'Then I will plant it somewhere else.', 2.6]], cam: (k) => { const s = twoShot(viktor, p, openSide(w, viktor, p), 2.8, 1.6, k * 0.3); return { ...s, fov: 36 }; } },
    ], { viktor, kai: p });
    // Viktor drives to the escape boat at the east pier.
    viktor.hidden = true;
    car.driver = 'npc';
    car.parked = false;
    car.target = true;
    const roads = w.city.roads;
    const from = roads.nearestNode(car.x, car.z);
    const ai = new LaneDriver(car, roads, this.rng, from, roads.nodes[from.links[0]]);
    ai.cruise = 23;
    ai.planNext = function planNext() {
      const goal = [1000, 700];
      const via = this.to;
      let best = null, bd = Infinity;
      for (const id of via.links) {
        const n = this.roads.nodes[id];
        if (n === this.from && via.links.length > 1) continue;
        const d = Math.hypot(n.x - goal[0], n.z - goal[1]);
        if (d < bd) { bd = d; best = n; }
      }
      const c = this.roads.turnCurve(this.from, via, best);
      for (let k = 1; k <= 4; k++) {
        const u = k / 4, uu = 1 - u;
        this.wps.push({ x: uu * uu * c.p0[0] + 2 * uu * u * c.p1[0] + u * u * c.p2[0], z: uu * uu * c.p0[1] + 2 * uu * u * c.p1[1] + u * u * c.p2[1], kind: 'turn' });
      }
      this.from = via;
      this.to = best;
      this.buildLane();
    };
    car.ai = ai;
    this.targetEnt = car;
    const pierEnd = POINTS.eastPierEnd;
    let onPier = false;
    this.tick = (dt) => {
      const d = Math.hypot(car.x - pierEnd[0], car.z - pierEnd[1]);
      if (!car.wrecked && car.health > 300) {
        if (Math.hypot(car.x - 1000, car.z - 700) < 25 || onPier) {
          // Final run onto the pier.
          onPier = true;
          car.ai = null;
          const err = Math.atan2(pierEnd[0] - car.x, pierEnd[1] - car.z) - car.yaw;
          car.steer = Math.max(-1, Math.min(1, Math.atan2(Math.sin(err), Math.cos(err)) * 2));
          car.throttle = 0.8;
          car.brake = 0;
        } else ai.update(dt, w);
      }
      const label = `Wreck Viktor's car before he reaches his boat`;
      const sub = `Viktor to the boat: ${Math.round(d)} m · Car ${Math.max(0, Math.round((100 * car.health) / car.maxHealth))}%`;
      if (label !== this.objText || sub !== this.lastSub) { this.lastSub = sub; this.objective(label, sub); }
    };
    w.wanted.setStars(0);
    w.missionNoCops = true;
    this.watch(() => (Math.hypot(car.x - pierEnd[0], car.z - pierEnd[1]) < 10 && !car.wrecked && car.health > 300 ? 'Viktor escaped by boat.' : null));
    this.help('Ram him, shoot him, stop him. Drive-by: left mouse while driving.', 6);
    await this.waitFor(() => car.wrecked || car.health <= 300);
    this.tick = null;
    car.ai = null;
    car.driver = null;
    car.throttle = 0;
    car.brake = 1;
    car.target = false;
    this.targetEnt = null;
    // He bails out as a boss.
    const dp = car.doorPoint(0);
    viktor.x = dp[0]; viktor.z = dp[1];
    viktor.hidden = false;
    viktor.kind = 'gang';
    viktor.target = true;
    viktor.health = viktor.maxHealth = 200;
    viktor.weapon = 'smg';
    viktor.brain = new GangBrain(w, { weapon: 'smg', accuracy: 0.32, aggro: true, alerted: true });
    w.dialogue.say([['viktor', 'You want the Orchid? Come and take it!', 2.6]]);
    this.tick = () => {
      const t = `Defeat Viktor Raza  ${'█'.repeat(Math.max(0, Math.ceil((viktor.health / 200) * 10)))}${'░'.repeat(10 - Math.max(0, Math.ceil((viktor.health / 200) * 10)))}`;
      if (t !== this.objText) this.objective(t, 'Boss: 200 HP');
    };
    await this.waitFor(() => viktor.dead > 0);
    this.tick = null;
    w.missionNoCops = false;
    await this.wait(1.5);
    // Sunrise ending on the pier.
    w.env.hour = 6.15;
    w.wanted.clear();
    p.place(1120, 690, Math.PI / 2);
    await this.cutscene([
      { dur: 6, lines: [['lin', "It's over, Kai. Dex already sent account 9 to every newsroom on the coast.", 3.6], ['kai', 'The Orchid falls at sunrise. Fitting.', 2.6]], cam: sweep([1110, 2.2, 700], [1114, 3, 698], [1160, 4, 690], [1200, 8, 688], 45) },
      { dur: 6, lines: [['dex', 'Breakfast is on me. Well, on Viktor.', 2.6], ['lin', 'Come home. The garage needs a mechanic who can actually park.', 3.4]], cam: (k) => ({ pos: [1132 - k * 4, 1.7, 697], target: [1120, 1.5, 690], fov: 40 }) },
    ], { kai: p });
    this.w.app?.credits?.();
  }
}
