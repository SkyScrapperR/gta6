// The gameplay world: owns the city, the player, the camera rig, environment and every system,
// steps them in order each frame and queues what the renderer draws.

import { Camera } from './engine/camera.js';
import { Environment } from './engine/sky.js';
import { City } from './world/city.js';
import { Player } from './entities/player.js';
import { CameraController } from './entities/camera-controller.js';
import { POINTS } from './world/layout.js';

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
  }

  async load(onProgress) {
    await this.city.generate(onProgress);
    this.player = new Player(this.gl, this.city);
    this.camCtl = new CameraController(this.camera, this.city.col);
    this.player.place(POINTS.homecomingCar[0] - 4, POINTS.homecomingCar[1] - 6, Math.PI);
    this.camCtl.face(Math.PI);
  }

  update(dt) {
    const input = this.input;
    this.time += dt;
    this.env.hour = (this.env.hour + dt * this.clockRate) % 24;
    this.env.update(dt);
    const p = this.player;
    const look = input.look();
    const aiming = input.rightDown && this.controlsOn;
    p.aim = aiming ? 1 : 0;
    p.updateFoot(dt, input, this.camCtl.yaw, aiming, this.controlsOn);
    p.updateAnim(dt);
    this.camCtl.updateFoot(dt, look, p.x, p.y, p.z, p.aim);
    this.city.update(dt, this.camera.pos[0], this.camera.pos[2], this.renderer.preset.draw);
  }

  render(dt) {
    const r = this.renderer;
    r.begin(this.camera, this.env, this.time);
    this.city.queue(r, this.env.night);
    this.player.queue(r, this.env.night);
    r.render(dt);
  }
}
