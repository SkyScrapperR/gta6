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
    this.spawnParkedCars();
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
    this.emit('explosion', { x: v.x, y: v.y + 1, z: v.z, v });
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

  onArrest() {
    if (!this.player.alive || this.cuffedT) return;
    this.player.cuffed = 0.001;
    this.emit('busted');
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

  update(dt) {
    const input = this.input;
    this.time += dt;
    this.stats.timePlayed += dt;
    this.env.hour = (this.env.hour + dt * this.clockRate) % 24;
    this.env.update(dt);
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
      p.updateFoot(dt, input, this.camCtl.yaw, aiming, this.controlsOn);
    }
    p.updateAnim(dt);
    this.city.roads.update(0);
    this.traffic.update(dt);
    this.police.update(dt);
    this.streamParked(dt, this.camera.pos[0], this.camera.pos[2]);
    this.vehicles.update(dt);
    this.peds.update(dt);
    this.wanted.update(dt);
    if (this.debugCam) this.camCtl.updateShot(dt, this.debugCam.pos, this.debugCam.target, this.debugCam.fov ?? 50);
    else if (v && !this.entry.busy) this.camCtl.updateCar(dt, look, v);
    else this.camCtl.updateFoot(dt, look, p.x, p.y, p.z, p.aim);
    this.city.update(dt, this.camera.pos[0], this.camera.pos[2], this.renderer.preset.draw);
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
    r.render(dt);
  }
}
