// Short-lived dynamic lights: muzzle flash pulses, explosion flashes and burning-car glow. Each frame
// the live ones are handed to the renderer's forward light list.

export class FlashLights {
  constructor() {
    this.list = [];
  }

  add(x, y, z, color, radius, life) {
    this.list.push({ x, y, z, color, radius, life, t: 0 });
  }

  update(dt) {
    for (const l of this.list) l.t += dt;
    this.list = this.list.filter((l) => l.t < l.life);
  }

  queue(renderer) {
    for (const l of this.list) {
      const k = 1 - l.t / l.life;
      renderer.light([l.x, l.y, l.z], l.radius, [l.color[0] * k, l.color[1] * k, l.color[2] * k]);
    }
  }
}
