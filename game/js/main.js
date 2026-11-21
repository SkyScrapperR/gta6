// Engine test scene (step 2): primitives under the full renderer, to validate shading and post.
import { Renderer } from './engine/renderer.js';
import { Camera } from './engine/camera.js';
import { Environment } from './engine/sky.js';
import { MeshBuilder, MAT } from './engine/mesh-builder.js';
import { createMesh } from './engine/gl.js';
import { hex } from './core/math.js';

const canvas = document.getElementById('view');
const renderer = new Renderer(canvas);
const gl = renderer.gl;
const cam = new Camera();
const env = new Environment();
const q = new URLSearchParams(location.search);
env.hour = Number(q.get('hour') ?? 17.2);
env.targetRain = env.rain = Number(q.get('rain') ?? 0);
renderer.setPreset(q.get('q') ?? 'high');

const b = new MeshBuilder();
b.paint(hex('#3a3d44'), MAT.ASPHALT).plane(-80, -80, 80, 80, 0);
b.paint(hex('#b9b2a6'), MAT.CONCRETE).box(0, 0.08, 14, 160, 0.16, 6);
b.paint(hex('#d9c7a8'), MAT.WINDOWS).box(-20, 15, 30, 18, 30, 14);
b.paint(hex('#6a4aa8'), MAT.GLASS_TOWER).box(20, 40, 36, 16, 80, 16);
b.paint(hex('#ffd23a'), MAT.PAINT).bevelBox(0, 0.75, 0, 1.9, 0.7, 4.3, 0.18);
b.paint(hex('#ffd23a'), MAT.PAINT).bevelBox(0, 1.35, -0.2, 1.6, 0.55, 2.0, 0.2, { taperX: 0.82, taperZ: 0.7 });
for (const [x, z] of [[-0.85, 1.4], [0.85, 1.4], [-0.85, -1.4], [0.85, -1.4]]) b.wheel(x, 0.36, z, 0.36, 0.26, [0.05, 0.05, 0.05], [0.7, 0.72, 0.75]);
b.paint(hex('#d9a27a'), MAT.SKIN).sphere(-4, 1.65, 0, 0.13, 0.15, 0.14, 12, 8);
b.paint(hex('#1aa7a0'), MAT.CLOTH).bevelBox(-4, 1.25, 0, 0.42, 0.55, 0.24, 0.08);
b.paint(hex('#2c2c38'), MAT.CLOTH).limb(-4.1, 0.95, 0, -4.12, 0.05, 0.05, 0.08, 0.06);
b.paint(hex('#2c2c38'), MAT.CLOTH).limb(-3.9, 0.95, 0, -3.88, 0.05, -0.05, 0.08, 0.06);
b.paint(hex('#2a8a3a'), MAT.FOLIAGE).sphere(6, 4, 4, 2, 1.6, 2);
b.paint(hex('#5a3a22'), MAT.WOOD).cylinder(6, 0, 4, 0.25, 0.18, 3, 8);
b.paint(hex('#ff3fa4'), MAT.NEON, 1.5).box(-20, 6, 22.9, 8, 1.4, 0.2);
b.paint(hex('#fff2c8'), MAT.LAMP, 1).sphere(3, 6, 12, 0.3);
const mesh = createMesh(gl, b.build());

let t = 0;
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  const a = t * 0.15 + 0.6;
  cam.pos = [Math.sin(a) * 14, 4.5, Math.cos(a) * 14 - 4];
  cam.target = [0, 2, 6];
  env.update(dt);
  renderer.begin(cam, env, t);
  renderer.draw(mesh);
  renderer.light([3, 6, 12], 18, [3, 2.6, 2]);
  renderer.render(dt);
  requestAnimationFrame(frame);
}
document.getElementById('loading').classList.add('done');
requestAnimationFrame(frame);
window.__engine = { renderer, env, cam };
