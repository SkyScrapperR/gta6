// Boot, main loop and the top-level state machine:
//   loading -> title -> playing <-> paused / map ; playing -> cutscene -> playing
// The title screen is the live city at dusk with a low camera flying between towers. Debug and
// screenshot scenes come from ?shot=N (debug/shots.js). Audio starts on the first user gesture.

import { Renderer } from './engine/renderer.js';
import { Input } from './core/input.js';
import { Game } from './game.js';
import { HUD } from './ui/hud.js';
import { BigMap } from './ui/bigmap.js';
import { Menus } from './ui/menus.js';
import { AudioSystem } from './audio/sfx.js';
import { hasSave, loadSave, applySave, loadSettings, saveSettings } from './save.js';
import { WEAPONS } from './combat/weapons.js';
import { VEHICLES } from './entities/vehicle-model.js';
import { damp } from './core/math.js';

const canvas = document.getElementById('view');
const params = new URLSearchParams(location.search);

const app = {
  state: 'loading',
  fps: 60,
  titleT: 0,

  setState(s) {
    this.state = s;
    const playing = s === 'playing';
    this.input.wantLock = playing;
    if (!playing) this.input.releaseLock();
    this.game.audioActive = s !== 'title' || true;
    this.bigmap.open = s === 'map';
    this.renderer.post.dim = s === 'paused' ? 0.75 : 0;
    this.hud.visible = playing || s === 'cutscene';
    if (playing || s === 'cutscene') this.menus.clear();
  },

  applySettings(s) {
    if (s.quality && s.quality !== this.renderer.presetKey) this.renderer.setPreset(s.quality);
    this.input.sensitivity = s.sensitivity;
    this.input.invertY = s.invertY;
    this.audio.setVolumes({ music: s.music, sfx: s.sfx, radio: s.radio });
    this.game.music?.setVolumes?.(s);
  },

  // ------------------------------------------------------------ title
  enterTitle() {
    const g = this.game;
    g.cinematic = null;
    g.player.visible = false;
    g.controlsOn = false;
    g.env.hour = 18.55;
    g.env.targetRain = g.env.rain = 0;
    g.wanted.clear();
    this.titleT = 0;
    this.titlePath();
    g.player.place(this.titleCam[0][0], this.titleCam[0][2]);
    g.populate(34, 60);
    this.setState('title');
    this.menus.title(hasSave());
    this.game.music?.playTitle?.();
  },

  /** A low flight along Kota Lama's shopping street between the towers. */
  titlePath() {
    this.titleCam = [[512, 7, 590], [512, 9, 300]];
  },

  updateTitle(dt) {
    const g = this.game;
    this.titleT += dt;
    const u = (this.titleT * 0.012) % 1;
    const z = 590 - u * 290;
    const sway = Math.sin(this.titleT * 0.25) * 1.6;
    const pos = [501.5 + sway, 6.5 + Math.sin(this.titleT * 0.18) * 1.2, z];
    const target = [497 - sway * 0.5, 9.5, z - 40];
    g.player.x = pos[0];
    g.player.z = pos[2];
    g.debugCam = { pos, target, fov: 62 };
    g.updateWorld(dt, true);
  },

  // ------------------------------------------------------------ game flow
  newGame() {
    const g = this.game;
    g.debugCam = null;
    g.resetForNewGame();
    this.setState('playing');
    g.missions?.startNewGame();
  },

  continueGame() {
    const g = this.game;
    const rec = loadSave();
    g.debugCam = null;
    g.resetForNewGame();
    if (rec) applySave(g, rec);
    g.notes.push({ slot: 'toast', text: 'Game loaded', color: '#2ff3e0', duration: 2.5 });
    this.setState('playing');
  },

  resume() {
    this.setState('playing');
  },

  pause() {
    if (this.state !== 'playing') return;
    this.setState('paused');
    this.menus.pause();
  },

  openMap() {
    this.menus.clear();
    this.setState('map');
  },

  quitToTitle() {
    this.menus.clear();
    this.enterTitle();
  },
};

/** UI and audio reactions to gameplay events. */
function onFrameEvents(events) {
  const g = app.game;
  app.audio.onEvents(events, g);
  for (const e of events) {
    if (e.type === 'pickup') {
      const text = e.kind === 'cash' ? `+$${e.amount}` : e.kind === 'weapon' ? WEAPONS[e.weapon]?.name ?? 'Weapon' : e.kind === 'health' ? 'Health' : e.kind === 'armor' ? 'Armor' : '';
      if (text) g.notes.push({ slot: 'toast', text, color: e.kind === 'cash' ? '#4dff9a' : '#f2f4ff', duration: 2 });
    } else if (e.type === 'entered') {
      g.notes.push({ slot: 'vehicle', text: VEHICLES[e.v.type].name, color: '#f2f4ff', duration: 3, key: 'veh' });
    } else if (e.type === 'wasted') {
      g.notes.push({ slot: 'banner', text: 'FLATLINED', color: '#ff3a4a', sub: 'Selara General Hospital  ·  -$100', priority: 10, duration: 4.4 });
    } else if (e.type === 'busted') {
      g.notes.push({ slot: 'banner', text: 'CUFFED', color: '#4a8aff', sub: 'Selara Police HQ  ·  -$100 · ammo confiscated', priority: 10, duration: 4.4 });
    } else if (e.type === 'weaponGet') {
      g.notes.push({ slot: 'toast', text: `${WEAPONS[e.key].name} acquired`, color: '#ffb347', duration: 2.5 });
    }
  }
}

async function boot() {
  app.renderer = new Renderer(canvas);
  const settings = loadSettings();
  app.renderer.setPreset(params.get('q') ?? settings.quality ?? 'high');
  app.input = new Input(canvas);
  app.audio = new AudioSystem();
  app.game = new Game(app.renderer, app.input);
  app.game.app = app;
  app.game.audio = app.audio;
  const fill = document.getElementById('loadfill');
  const text = document.getElementById('loadtext');
  await app.game.load((p, msg) => {
    fill.style.width = `${Math.round(p * 100)}%`;
    text.textContent = msg;
  });
  app.hud = new HUD(app.game, document.getElementById('hud'));
  app.game.hud = app.hud;
  app.bigmap = new BigMap(app.game, app.hud);
  app.menus = new Menus(app);
  app.game.onFrameEvents = onFrameEvents;
  app.applySettings({ ...settings, quality: params.get('q') ?? settings.quality ?? app.renderer.presetKey });
  const gesture = () => app.audio.start();
  addEventListener('pointerdown', gesture);
  addEventListener('keydown', gesture);
  app.input.onKey((code) => {
    if (code === 'F3') app.hud.showFps = !app.hud.showFps;
    if (code === 'Escape') {
      if (app.state === 'playing') app.pause();
      else if (app.state === 'paused') app.resume();
      else if (app.state === 'map') app.setState('playing');
    }
    if (code === 'KeyM') {
      if (app.state === 'playing') app.openMap();
      else if (app.state === 'map') app.setState('playing');
    }
    if (code === 'Space' && app.state === 'cutscene') app.game.cutscene?.skip();
  });
  document.getElementById('loading').classList.add('done');
  if (params.has('shot')) {
    const { runShot } = await import('./debug/shots.js');
    await runShot(app, params.get('shot'));
  } else if (params.has('play')) {
    app.newGame();
  } else app.enterTitle();
  if (params.has('hour')) app.game.env.hour = Number(params.get('hour'));
  // First run: probe the frame rate for a default quality preset.
  if (!settings.quality && !params.has('q') && !params.has('shot')) {
    setTimeout(() => {
      const f = app.fps;
      const q = f >= 38 ? 'high' : f >= 24 ? 'medium' : 'low';
      saveSettings({ ...loadSettings(), quality: q });
      app.renderer.setPreset(q);
    }, 2500);
  }
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
  g.fps = app.fps;
  if (app.state === 'title') app.updateTitle(dt);
  else if (app.state === 'playing' || app.state === 'cutscene') {
    g.update(dt * g.timeScale);
    if (g.cinematic && app.state === 'playing') app.setState('cutscene');
    else if (!g.cinematic && app.state === 'cutscene') app.setState('playing');
  }
  app.audio.update(dt, g);
  g.render(dt);
  if (app.state === 'map') app.bigmap.draw();
  else app.hud.draw(app.state === 'paused' ? 0 : dt);
  // Adaptive resolution while playing (never during screenshot capture).
  if (app.state === 'playing' && !g.capture && app.renderer.presetKey !== 'high') {
    const target = app.fps < 27 ? 0.75 : app.fps > 45 ? 1 : app.renderer.adaptiveScale;
    app.renderer.adaptiveScale = damp(app.renderer.adaptiveScale, target, 0.5, dt);
  }
  app.input.endFrame();
  requestAnimationFrame(loop);
}

window.__app = app;
boot().catch((e) => {
  console.error(e);
  document.getElementById('loadtext').textContent = `Error: ${e.message}`;
});
