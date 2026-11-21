// The gameplay world: owns the city, the player, the camera rig, environment and every system,
// steps them in order each frame and queues what the renderer draws. Crime and police events are
// routed here so missions, HUD and audio can react to them.

import { Camera } from './engine/camera.js';
import { Environment } from './engine/sky.js';
import { City } from './world/city.js';
import { Player } from './entities/player.js';
import { CameraController } from './entities/camera-controller.js';
import { VehicleSystem } from './entities/vehicle.js';
import { CarEntry } from './entities/car-entry.js';
import { PedSystem } from './entities/pedestrian.js';
import { TrafficSystem } from './ai/traffic.js';
import { WantedSystem, PoliceSystem } from './ai/police.js';
import { Particles } from './fx/particles.js';
import { Decals } from './fx/decals.js';
import { FlashLights } from './fx/lights.js';
import { Combat } from './combat/weapons.js';
import { Arsenal } from './combat/arsenal.js';
import { Pickups } from './combat/pickups.js';
import { Notifications } from './ui/notifications.js';
import { Markers } from './fx/markers.js';
import { MissionSystem } from './story/missions.js';
import { OrchidTags, Shops } from './story/side-content.js';
import { POINTS } from './world/layout.js';
import { makeRng } from './core/math.js';

export class Game {
  constructor(renderer, input) {
    this.renderer = renderer;
    this.gl = renderer.gl;
    this.input = input;
    this.camera = new Camera();
    this.env = new Environment();
    this.city = new City(this.gl);
    this.time = 0;
    this.timeScale = 1;
    this.clockRate = 1 / 60; // one game minute per real second
    this.controlsOn = true;
    this.entry = new CarEntry();
    this.rng = makeRng(20261121);
    this.events = [];
    this.money = 0;
    this.stats = { kills: 0, carsStolen: 0, missions: 0, tags: 0, timePlayed: 0, shots: 0, copsKilled: 0 };
    this.fps = 60;
    this.notes = new Notifications();
    this.waypoint = null;
    this.cinematic = null;
  }

  async load(onProgress) {
    await this.city.generate(onProgress);
    this.player = new Player(this.gl, this.city);
    this.camCtl = new CameraController(this.camera, this.city.col);
    this.vehicles = new VehicleSystem(this.gl, this.city);
    this.vehicles.onCrash = (v, speed, other) => this.onCrash(v, speed, other);
    this.vehicles.onPropHit = (prop, v) => this.onPropHit(prop, v);
    this.vehicles.onExplode = (v) => this.onVehicleExplode(v);
    this.peds = new PedSystem(this);
    this.peds.onPedKilled = (p, src) => this.onPedKilled(p, src);
    this.traffic = new TrafficSystem(this);
    this.wanted = new WantedSystem(this);
    this.police = new PoliceSystem(this);
    this.fx = { particles: new Particles(this.gl), decals: new Decals(this.gl), lights: new FlashLights() };
    this.combat = new Combat(this);
    this.arsenal = new Arsenal(this);
    this.pickups = new Pickups(this);
    this.gangCoverTaken = new Set();
    this.markers = new Markers(this.gl);
    this.missions = new MissionSystem(this);
    this.tags = new OrchidTags(this);
    this.shops = new Shops(this);
    this.placeWorldPickups();
    this.spawnParkedCars();
    // Customer cars up on the lifts in Lin's Garage.
    for (const [k, l] of this.city.anchors.garage.lifts.entries()) {
      const car = this.vehicles.spawn(k ? 'kancil' : 'merpati', l[0], l[2], 0.05, { parked: true, color: k ? '#c0402a' : '#3a6a8a' });
      car.y = l[1];
      car.lifted = true;
    }
    this.player.place(POINTS.homecomingCar[0] - 3, 1009.5, Math.PI);
    this.camCtl.face(Math.PI);
  }

  /** Decide which kerbside bays hold parked cars; cars are streamed in around the player. */
  spawnParkedCars() {
    const types = ['kancil', 'merpati', 'merpati', 'taxi', 'bajak', 'kancil', 'vesper'];
    this.parkSlots = [];
    for (const p of this.city.parking) {
      if (this.rng() > 0.42) continue;
      this.parkSlots.push({ ...p, type: p.kind === 'police' ? 'patrol' : this.rng.pick(types), colorSeed: this.rng(), vehicle: null, gone: false });
    }
    this.streamT = 0;
  }

  /** Materialise parked cars within ~150 m of the camera, release untouched ones beyond ~210 m. */
  streamParked(dt, x, z) {
    this.streamT -= dt;
    if (this.streamT > 0) return;
    this.streamT = 0.4;
    for (const s of this.parkSlots) {
      const d = Math.hypot(s.x - x, s.z - z);
      if (!s.vehicle && !s.gone && d < 150) {
        s.vehicle = this.vehicles.spawn(s.type, s.x, s.z, s.yaw, { parked: true, colorSeed: s.colorSeed });
        s.vehicle.slot = s;
      } else if (s.vehicle && d > 210) {
        const v = s.vehicle;
        if (v.driver || v.mission) { s.vehicle = null; s.gone = true; continue; }
        this.vehicles.remove(v);
        s.vehicle = null;
      }
    }
  }

  /** Health and armor around the city (respawning), outside hospital, safehouse, docks and parks. */
  placeWorldPickups() {
    const a = this.city.anchors;
    const spots = [
      ['health', a.hospital.respawn[0] + 4, a.hospital.respawn[1]],
      ['armor', a.safehouse.door[0] - 6, a.safehouse.door[1] - 2],
      ['health', 355, 350], ['armor', 650, 150], ['health', 860, 620], ['armor', 150, 850], ['health', 640, 920], ['armor', 920, 300],
    ];
    for (const [k, x, z] of spots) this.pickups.spawn(k, x, z, 50, { respawn: 60 });
  }

  addMoney(n) {
    this.money = Math.max(0, this.money + n);
    this.emit('money', { amount: n });
  }

  /** Busy streets right away (new game, title screen). */
  populate(cars = 24, peds = 40) {
    this.traffic.prefill(cars);
    this.peds.prefill(peds);
  }

  // ------------------------------------------------------------ events
  emit(type, data = {}) {
    this.events.push({ type, ...data });
  }

  onCarjack(v) {
    const dp = v.doorPoint(0);
    const p = this.peds.spawn(`civ${Math.floor(this.rng() * 16)}`, dp[0], dp[1]);
    p.flee(this.player.x, this.player.z, 10);
    p.knockDown(this.player.x, this.player.z, 0);
    this.stats.carsStolen++;
    if (v.police) this.wanted.addStars(2);
    else this.wanted.crime(1.5, true);
    if (v.traffic !== undefined) v.ai = null;
    v.ai = null;
    this.emit('carjack', { v });
  }

  onCrash(v, speed, other) {
    const p = this.player;
    if (v === p.vehicle) {
      this.camera.addShake(Math.min(0.8, speed / 30));
      if (other?.police) this.wanted.crime(2);
    }
    this.emit('crash', { v, speed, x: v.x, z: v.z });
  }

  onPropHit(prop, v) {
    this.city.props.knockOver(prop, v.forward[0], v.forward[1]);
    this.emit('prop', { x: prop.x, z: prop.z });
  }

  onPedHitByCar(p, v) {
    if (v === this.player.vehicle) this.wanted.crime(p.kind === 'cop' ? 3 : 1);
  }

  onPedKilled(p, source) {
    const byPlayer = source === 'player' || (source === 'vehicle' && this.player.vehicle);
    if (byPlayer) {
      this.stats.kills++;
      if (p.kind === 'cop') { this.stats.copsKilled++; this.wanted.crime(6); }
      else if (p.kind === 'civ') this.wanted.crime(3);
    }
    if (p.cash > 0 && p.kind !== 'story') this.pickups?.spawn('cash', p.x, p.z, p.cash);
    this.emit('pedKilled', { p, source });
  }

  onVehicleExplode(v) {
    this.explosionFx(v.x, v.y + 0.8, v.z, v.def.truck ? 1.6 : 1.1);
    this.peds.panic(v.x, v.z, 45);
    if (v.lastDamager === 'player' || v === this.player.vehicle || Math.hypot(v.x - this.player.x, v.z - this.player.z) < 20) {
      this.wanted.crime(v.police ? 5 : 3);
    }
    // Blast damage around.
    for (const o of this.vehicles.list) if (o !== v && Math.hypot(o.x - v.x, o.z - v.z) < 7) o.damage(260);
    for (const q of this.peds.list) {
      const d = Math.hypot(q.x - v.x, q.z - v.z);
      if (d < 7) q.damage(120 * (1 - d / 7) + 10, v.x, v.z, v.lastDamager);
    }
    const pd = Math.hypot(this.player.x - v.x, this.player.z - v.z);
    if (pd < 8 && !this.player.vehicle) this.player.damage(70 * (1 - pd / 8), v.x, v.z);
    if (this.player.vehicle === v) this.player.damage(200);
    this.camera.addShake(Math.max(0, 1.2 - pd / 40));
  }

  /** Fireball, smoke lit from inside, sparks, debris, scorch, light flash, shake and a moment of slow motion. */
  explosionFx(x, y, z, scale = 1) {
    this.fx.particles.explosion(x, y, z, scale);
    this.fx.decals.scorch(x, this.city.groundAt(x, z), z);
    this.fx.lights.add(x, y + 2, z, [40, 18, 6], 40 * scale, 1.2);
    this.emit('explosion', { x, y, z, scale });
    const pd = Math.hypot(this.player.x - x, this.player.z - z);
    if (pd < 30) this.slowMo = Math.max(this.slowMo ?? 0, 0.6 * (1 - pd / 30));
  }

  onArrest() {
    if (!this.player.alive) return;
    this.player.cuffed = 0.001;
    if (this.player.vehicle) { this.player.vehicle.driver = null; this.player.vehicle = null; this.player.seat = 0; }
    this.failState = { kind: 'cuffed', t: 0 };
    this.emit('busted');
  }

  onPlayerDeath() {
    this.failState = { kind: 'flatlined', t: 0 };
    this.emit('wasted');
  }

  /** After FLATLINED or CUFFED: hospital or police HQ, minus $100 (and ammo when arrested). */
  respawn(kind) {
    const a = this.city.anchors;
    const p = this.player;
    const spot = kind === 'cuffed' ? a.police.respawn : a.hospital.respawn;
    if (p.vehicle) { p.vehicle.driver = null; p.vehicle = null; }
    this.entry.seq = null;
    p.place(spot[0], spot[1], Math.PI);
    p.health = p.maxHealth;
    p.seat = 0;
    p.visible = true;
    if (kind === 'cuffed') { p.armor = 0; this.arsenal.strip(); }
    this.addMoney(-100);
    this.wanted.clear();
    for (const c of [...this.peds.list]) if (c.kind === 'cop') this.peds.remove(c);
    for (const v of [...this.police.units]) this.vehicles.remove(v);
    this.camCtl.face(Math.PI);
    p.safeTimer = 2;
    this.failState = null;
    this.emit('respawn', { kind });
  }

  /** Scripted fire at the nearest enemy (screenshot scenes only). */
  autoShoot(dt) {
    const p = this.player;
    p.aim = 1;
    this.autoT = (this.autoT ?? 0) - dt;
    if (this.autoT > 0) return;
    this.autoT = 0.09;
    let best = null, bd = 60;
    for (const q of this.peds.list) if (q.kind === 'gang' && !q.dead && Math.hypot(q.x - p.x, q.z - p.z) < bd) { bd = Math.hypot(q.x - p.x, q.z - p.z); best = q; }
    if (!best) return;
    const [ox, oy, oz] = this.combat.muzzleOf(p);
    let dx = best.x - ox + (Math.random() - 0.5) * 1.5, dy = best.y + 1.3 - oy, dz = best.z - oz;
    const l = Math.hypot(dx, dy, dz);
    this.combat.fire(p, 'smg', ox, oy, oz, dx / l, dy / l, dz / l, 1);
    p.recoil = 0.25;
  }

  /** Smoke, fire and drift effects that vehicles emit every frame. */
  vehicleFx(dt) {
    const pt = this.fx.particles;
    for (const v of this.vehicles.list) {
      if (Math.abs(v.x - this.camera.pos[0]) > 160 || Math.abs(v.z - this.camera.pos[2]) > 160) continue;
      const f = v.forward;
      const hx = v.x + f[0] * (v.def.len / 2 - 0.6), hz = v.z + f[1] * (v.def.len / 2 - 0.6);
      if (v.wrecked) {
        if (v.wreckTimer < 25 && Math.random() < dt * 8) pt.fire(v.x, v.y + 1, v.z, 0.8);
        if (Math.random() < dt * 4) pt.carSmoke(v.x, v.y + 1.6, v.z, true);
      } else if (v.health < 350) {
        if (Math.random() < dt * 20) pt.fire(hx, v.y + 1.1, hz, 0.7);
        if (Math.random() < dt * 0.9) this.fx.lights.add(hx, v.y + 1.5, hz, [5, 2, 0.5], 8, 0.4);
      } else if (v.health < 650) {
        if (Math.random() < dt * 10) pt.carSmoke(hx, v.y + 1.1, hz, v.health < 500);
      }
      if (v.drifting || (v.handbrake && Math.abs(v.speed) > 6) || (v.braking && Math.abs(v.speed) > 14)) {
        const r = v.right;
        for (const s of [1, -1]) {
          const wx = v.x - f[0] * 1.4 + r[0] * s * 0.8, wz = v.z - f[1] * 1.4 + r[1] * s * 0.8;
          v.skidAcc = (v.skidAcc ?? 0) + dt;
          if (v.skidAcc > 0.03) this.fx.decals.skid(wx, wz, v.y, f[0], f[1]);
          if (Math.random() < dt * 18) pt.tyreSmoke(wx, v.y, wz);
        }
        if (v.skidAcc > 0.03) v.skidAcc = 0;
        v.screech = true;
      } else v.screech = false;
    }
  }

  // ------------------------------------------------------------ frame
  handleUse() {
    const p = this.player;
    if (this.entry.busy || !p.alive) return;
    if (p.vehicle) {
      if (Math.abs(p.vehicle.speed) < 6) this.entry.exit(p, p.vehicle);
      return;
    }
    const v = this.vehicles.nearestEnterable(p.x, p.z);
    if (v && !v.mission?.locked) this.entry.enter(p, v, (car) => this.onCarjack(car));
  }

  /** Fresh state for New Game / Continue (the city and its systems stay loaded). */
  resetForNewGame() {
    const p = this.player;
    this.money = 0;
    this.arsenal.owned = { fists: { clip: 0, ammo: 0 } };
    this.arsenal.current = 'fists';
    p.health = p.maxHealth;
    p.armor = 0;
    p.dead = 0;
    p.cuffed = 0;
    p.visible = true;
    p.vehicle = null;
    p.seat = 0;
    this.entry.seq = null;
    this.failState = null;
    this.wanted.clear();
    for (const c of [...this.peds.list]) if (c.kind !== 'civ') this.peds.remove(c);
    this.controlsOn = true;
    this.timeScale = 1;
    this.waypoint = null;
    this.cinematic = null;
    this.env.hour = 17.4;
    Object.assign(this.stats, { kills: 0, carsStolen: 0, missions: 0, tags: 0, timePlayed: 0, shots: 0, copsKilled: 0 });
    this.missions?.reset();
    this.tags?.reset();
    p.place(POINTS.ferryArrive[0], POINTS.ferryArrive[1], Math.PI);
    this.camCtl.face(Math.PI);
  }

  update(dt) {
    const input = this.input;
    this.time += dt;
    this.stats.timePlayed += dt;
    const p = this.player;
    const look = input.look();
    if (this.controlsOn && input.pressed('KeyF')) this.handleUse();

    const ev = this.entry.update(dt);
    if (ev === 'exited') this.camCtl.face(p.yaw);
    if (ev === 'entered') this.emit('entered', { v: p.vehicle });
    const v = p.vehicle;
    if (v && !this.entry.busy) {
      v.throttle = this.controlsOn ? input.axis('KeyS', 'KeyW') : 0;
      v.steer = this.controlsOn ? input.axis('KeyD', 'KeyA') : 0;
      v.handbrake = this.controlsOn && input.isDown('Space');
      v.horn = this.controlsOn && input.isDown('KeyH');
      v.brake = 0;
      p.steerPose = -v.steer;
      const sp = v.seatPoint();
      p.x = sp[0];
      p.z = sp[1];
      p.y = v.y;
      p.yaw = v.yaw;
      p.seat = 1;
      if (v.wrecked && !this.entry.busy && v.wreckTimer > 0.2) this.entry.exit(p, v);
    } else if (!this.entry.busy) {
      const aiming = input.rightDown && this.controlsOn && p.alive;
      p.aim = aiming ? 1 : 0;
      p.aimPitch = aiming ? -this.camCtl.pitch * 0.8 : 0;
      p.updateFoot(dt, input, this.camCtl.yaw, aiming, this.controlsOn);
    }
    if (!this.entry.busy) this.arsenal.update(dt, input, this.controlsOn && !this.failState);
    // Screenshot scenes: scripted driving and firing.
    if (this.autoDrive && p.vehicle) this.autoDrive(dt);
    if (this.autoFire) this.autoShoot(dt);
    p.updateAnim(dt);
    p.safeTimer = Math.max(0, (p.safeTimer ?? 0) - dt);
    // Death and arrest.
    if (p.dead > 0 && !this.failState) this.onPlayerDeath();
    if (this.failState) {
      this.failState.t += dt / Math.max(0.1, this.timeScale);
      if (this.failState.t > 4.5) this.respawn(this.failState.kind);
    }
    this.missions?.update(dt);
    this.cutscene?.update(dt);
    if (!this.cinematic) this.shops.update(dt);
    this.tags?.update(dt);
    this.heli?.update(dt);
    this.music?.update(dt, this);
    this.updateWorld(dt, false, look, v);
    this.slowMo = Math.max(0, (this.slowMo ?? 0) - dt * 0.8);
    this.timeScale = this.failState?.kind === 'flatlined' ? 0.35 : 1 - Math.min(0.6, this.slowMo ?? 0);
  }

  /** Everything that runs without player control too (title screen, cutscenes). */
  updateWorld(dt, title = false, look = [0, 0], v = null) {
    const p = this.player;
    this.env.hour = (this.env.hour + dt * this.clockRate) % 24;
    this.env.update(dt);
    this.traffic.update(dt);
    if (!title) this.police.update(dt);
    this.streamParked(dt, this.camera.pos[0], this.camera.pos[2]);
    this.vehicles.update(dt);
    this.peds.update(dt);
    if (!title) {
      this.wanted.update(dt);
      this.combat.update(dt);
      this.pickups.update(dt);
    }
    this.vehicleFx(dt);
    if (this.env.rain > 0.05) this.fx.particles.rain(this.camera.pos[0], this.camera.pos[1], this.camera.pos[2], this.env.rain, dt);
    this.fx.particles.update(dt);
    this.fx.lights.update(dt);
    if (this.cinematic?.cam) this.camCtl.updateShot(dt, this.cinematic.cam.pos, this.cinematic.cam.target, this.cinematic.cam.fov ?? 45, this.cinematic.cam.smooth ?? 0);
    else if (this.debugCam) this.camCtl.updateShot(dt, this.debugCam.pos, this.debugCam.target, this.debugCam.fov ?? 50);
    else if (v && !this.entry.busy) this.camCtl.updateCar(dt, look, v);
    else this.camCtl.updateFoot(dt, look, p.x, p.y, p.z, p.aim);
    this.city.update(dt, this.camera.pos[0], this.camera.pos[2], this.renderer.preset.draw);
    this.onFrameEvents?.(this.events);
    this.events.length = 0;
  }

  render(dt) {
    const r = this.renderer;
    const cx = this.camera.pos[0], cz = this.camera.pos[2];
    r.begin(this.camera, this.env, this.time);
    this.city.queue(r, this.env.night);
    this.vehicles.queue(r, this.env.night, cx, cz);
    this.peds.queue(r, this.env.night, cx, cz);
    this.player.queue(r, this.env.night);
    this.combat.queueWeapon(r, this.player);
    for (const q of this.peds.list) if (q.weapon && !q.hidden && Math.hypot(q.x - cx, q.z - cz) < 90) this.combat.queueWeapon(r, q);
    this.combat.queue(r);
    this.pickups.queue(r, this.env.night);
    this.fx.lights.queue(r);
    r.addTransparent(() => this.fx.decals.draw(r));
    // Glowing markers: missions, save point, shops and the waypoint beam.
    this.markers.begin();
    if (this.app?.state !== 'title') {
      this.missions.queueMarkers(this.markers);
      this.shops.queueMarkers(this.markers);
      if (this.waypoint) this.markers.add(this.waypoint[0], this.city.groundAt(this.waypoint[0], this.waypoint[1]), this.waypoint[1], 1.2, 60, [1.0, 0.25, 0.65]);
    }
    r.addTransparent(() => this.markers.draw(r));
    r.addTransparent(() => this.fx.particles.draw(r));
    this.extraQueue?.(r);
    r.post.desat = this.failState?.kind === 'flatlined' ? Math.min(1, this.failState.t / 1.5) : 0;
    r.render(dt);
  }
}
