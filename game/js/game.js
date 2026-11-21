// The gameplay world: owns the city, the player, the camera rig, environment and every system,
// steps them in order each frame and queues what the renderer draws.

import { Camera } from './engine/camera.js';
import { Environment } from './engine/sky.js';
import { City } from './world/city.js';
import { Player } from './entities/player.js';
import { CameraController } from './entities/camera-controller.js';
import { VehicleSystem } from './entities/vehicle.js';
import { CarEntry } from './entities/car-entry.js';
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
  }

  async load(onProgress) {
    await this.city.generate(onProgress);
    this.player = new Player(this.gl, this.city);
    this.camCtl = new CameraController(this.camera, this.city.col);
    this.vehicles = new VehicleSystem(this.gl, this.city);
    this.spawnParkedCars();
    this.testCar = this.vehicles.spawn('merpati', POINTS.homecomingCar[0], 1005.3, -Math.PI / 2, { parked: true, color: '#3a5a8a' });
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
        // A car that was moved or damaged is simply dropped; the bay refills later.
        this.vehicles.remove(v);
        s.vehicle = null;
      }
    }
  }

  /** F: enter the nearest car, or leave the current one. */
  handleUse() {
    const p = this.player;
    if (this.entry.busy || !p.alive) return;
    if (p.vehicle) {
      if (Math.abs(p.vehicle.speed) < 6) this.entry.exit(p, p.vehicle);
      return;
    }
    const v = this.vehicles.nearestEnterable(p.x, p.z);
    if (v) this.entry.enter(p, v, (car) => this.onCarjack?.(car));
  }

  update(dt) {
    const input = this.input;
    this.time += dt;
    this.env.hour = (this.env.hour + dt * this.clockRate) % 24;
    this.env.update(dt);
    const p = this.player;
    const look = input.look();
    if (this.controlsOn && input.pressed('KeyF')) this.handleUse();

    const ev = this.entry.update(dt);
    if (ev === 'exited') this.camCtl.face(p.yaw);
    const v = p.vehicle;
    if (v && !this.entry.busy) {
      // Driving.
      v.throttle = this.controlsOn ? input.axis('KeyS', 'KeyW') : 0;
      v.steer = this.controlsOn ? input.axis('KeyD', 'KeyA') : 0;
      v.handbrake = this.controlsOn && input.isDown('Space');
      v.horn = this.controlsOn && input.isDown('KeyH');
      p.steerPose = -v.steer;
      p.x = v.seatPoint()[0];
      p.z = v.seatPoint()[1];
      p.y = v.y;
      p.yaw = v.yaw;
      p.seat = 1;
    } else if (!this.entry.busy) {
      const aiming = input.rightDown && this.controlsOn;
      p.aim = aiming ? 1 : 0;
      p.updateFoot(dt, input, this.camCtl.yaw, aiming, this.controlsOn);
    }
    p.updateAnim(dt);
    this.streamParked(dt, this.camera.pos[0], this.camera.pos[2]);
    this.vehicles.update(dt);
    if (this.debugCam) this.camCtl.updateShot(dt, this.debugCam.pos, this.debugCam.target, this.debugCam.fov ?? 50);
    else if (v && !this.entry.busy) this.camCtl.updateCar(dt, look, v);
    else this.camCtl.updateFoot(dt, look, p.x, p.y, p.z, p.aim);
    this.city.update(dt, this.camera.pos[0], this.camera.pos[2], this.renderer.preset.draw);
  }

  render(dt) {
    const r = this.renderer;
    r.begin(this.camera, this.env, this.time);
    this.city.queue(r, this.env.night);
    this.vehicles.queue(r, this.env.night, this.camera.pos[0], this.camera.pos[2]);
    this.player.queue(r, this.env.night);
    r.render(dt);
  }
}
