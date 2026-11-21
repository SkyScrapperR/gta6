// Boot, main loop and the top-level state machine:
// loading -> title -> playing <-> paused / map / cutscene. Debug scenes come from ?shot=N.

import { Renderer } from './engine/renderer.js';
import { Input } from './core/input.js';
import { Game } from './game.js';

const canvas = document.getElementById('view');
const params = new URLSearchParams(location.search);

const app = {
  state: 'loading',
  renderer: null,
  input: null,
  game: null,
  fps: 0,
  setState(s) {
    this.state = s;
    this.input.wantLock = s === 'playing';
    if (s !== 'playing') this.input.releaseLock();
  },
};

async function boot() {
  app.renderer = new Renderer(canvas);
  app.renderer.setPreset(params.get('q') ?? 'high');
  app.input = new Input(canvas);
  app.game = new Game(app.renderer, app.input);
  const fill = document.getElementById('loadfill');
  const text = document.getElementById('loadtext');
  await app.game.load((p, msg) => {
    fill.style.width = `${Math.round(p * 100)}%`;
    text.textContent = msg;
  });
  if (params.has('hour')) app.game.env.hour = Number(params.get('hour'));
  app.game.populate();
  document.getElementById('loading').classList.add('done');
  app.setState('playing');
  requestAnimationFrame(loop);
}

let last = performance.now();
let fpsAcc = 0, fpsN = 0;
function loop(now) {
  const raw = Math.min(0.1, (now - last) / 1000);
  last = now;
  fpsAcc += raw;
  fpsN++;
  if (fpsAcc > 0.5) {
    app.fps = fpsN / fpsAcc;
    fpsAcc = 0;
    fpsN = 0;
  }
  const dt = Math.min(raw, 1 / 20);
  const g = app.game;
  g.fps = app.fps || 60;
  if (app.state === 'playing') g.update(dt * g.timeScale);
  g.render(dt);
  app.input.endFrame();
  requestAnimationFrame(loop);
}

window.__app = app;
boot().catch((e) => {
  console.error(e);
  document.getElementById('loadtext').textContent = `Error: ${e.message}`;
});
