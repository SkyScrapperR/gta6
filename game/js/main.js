// City test (step 3): generate Selara Bay and fly through it.
import { Renderer } from './engine/renderer.js';
import { Camera } from './engine/camera.js';
import { Environment } from './engine/sky.js';
import { Input } from './core/input.js';
import { City } from './world/city.js';

const canvas = document.getElementById('view');
const renderer = new Renderer(canvas);
const cam = new Camera();
const env = new Environment();
const input = new Input(canvas);
input.wantLock = true;
const q = new URLSearchParams(location.search);
env.hour = Number(q.get('hour') ?? 17.2);
env.targetRain = env.rain = Number(q.get('rain') ?? 0);
renderer.setPreset(q.get('q') ?? 'high');
const city = new City(renderer.gl);
const fill = document.getElementById('loadfill');
const text = document.getElementById('loadtext');
await city.generate((p, msg) => {
  fill.style.width = `${Math.round(p * 100)}%`;
  text.textContent = msg;
});
document.getElementById('loading').classList.add('done');

const v = (q.get('cam') ?? '420,40,560,0.6,-0.25').split(',').map(Number);
let [px, py, pz, yaw, pitch] = v;
let t = 0;
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  const [dx, dy] = input.look();
  yaw -= dx;
  pitch = Math.max(-1.5, Math.min(1.5, pitch - dy));
  const sp = (input.isDown('ShiftLeft') ? 120 : 30) * dt;
  const fx = Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = Math.cos(yaw) * Math.cos(pitch);
  const f = input.axis('KeyS', 'KeyW'), s = input.axis('KeyA', 'KeyD');
  px += (fx * f - Math.cos(yaw) * s) * sp;
  py += fy * f * sp + input.axis('KeyQ', 'KeyE') * sp;
  pz += (fz * f + Math.sin(yaw) * s) * sp;
  cam.pos = [px, py, pz];
  cam.target = [px + fx, py + fy, pz + fz];
  env.update(dt);
  city.update(dt, px, pz, renderer.preset.draw);
  renderer.begin(cam, env, t);
  city.queue(renderer, env.night);
  renderer.render(dt);
  input.endFrame();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.__engine = { renderer, env, cam, city };
