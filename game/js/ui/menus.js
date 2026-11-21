// DOM menus over the live 3D scene: title (Continue / New Game / Controls / Settings / Credits),
// pause (Resume / Map / Stats / Controls / Settings / Quit to Title), settings (graphics quality,
// music / SFX / radio volumes, mouse sensitivity, invert Y), controls, stats, credits and a confirm
// dialog. Keyboard (arrows + Enter) and mouse both work.

import { loadSettings, saveSettings } from '../save.js';

const CONTROLS = [
  ['W A S D', 'Move / drive'], ['Mouse', 'Look (click to lock the pointer)'], ['Shift', 'Sprint'], ['Space', 'Jump / handbrake'],
  ['Right mouse', 'Aim'], ['Left mouse', 'Shoot / punch / drive-by'], ['Q / E / wheel', 'Switch weapon'], ['R', 'Reload / change radio station'],
  ['F', 'Enter / exit / steal a car'], ['H', 'Horn'], ['M', 'Map'], ['Esc', 'Pause'], ['F3', 'FPS counter'],
];

export class Menus {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('ui');
    this.stack = [];
    this.sel = 0;
    addEventListener('keydown', (e) => this.onKey(e));
  }

  clear() {
    this.root.innerHTML = '';
    this.stack = [];
  }

  el(html) {
    const d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  /** A vertical button menu. items: [label, fn] */
  buttons(items, { center = false, title = null, subtitle = null } = {}) {
    const m = this.el(`<div class="menu${center ? ' center' : ''}"></div>`);
    if (title) m.appendChild(this.el(`<div class="logo title">${title}</div>`));
    if (subtitle) m.appendChild(this.el(`<div class="subtitle">${subtitle}</div>`));
    items.forEach(([label, fn], i) => {
      const b = this.el(`<button>${label}</button>`);
      b.addEventListener('click', () => { this.app.audio?.ui(); fn(); });
      b.addEventListener('mouseenter', () => this.select(i));
      m.appendChild(b);
    });
    this.root.innerHTML = '';
    this.root.appendChild(m);
    this.current = m;
    this.select(0);
    return m;
  }

  select(i) {
    const bs = this.current?.querySelectorAll('button') ?? [];
    if (!bs.length) return;
    this.sel = (i + bs.length) % bs.length;
    bs.forEach((b, k) => b.classList.toggle('sel', k === this.sel));
  }

  onKey(e) {
    if (!this.current || !this.root.contains(this.current)) return;
    if (e.code === 'ArrowDown') this.select(this.sel + 1);
    else if (e.code === 'ArrowUp') this.select(this.sel - 1);
    else if (e.code === 'Enter') this.current.querySelectorAll('button')[this.sel]?.click();
  }

  title(hasSave) {
    const items = [];
    if (hasSave) items.push(['CONTINUE', () => this.app.continueGame()]);
    items.push(['NEW GAME', () => (hasSave ? this.confirm('Start a new game? Your saved progress will be overwritten.', () => this.app.newGame(), () => this.title(hasSave)) : this.app.newGame())]);
    items.push(['CONTROLS', () => this.controls(() => this.title(hasSave))]);
    items.push(['SETTINGS', () => this.settings(() => this.title(hasSave))]);
    items.push(['CREDITS', () => this.credits(() => this.title(hasSave))]);
    const m = this.buttons(items, { title: 'SELARA BAY', subtitle: 'HEAT ON THE COAST' });
    m.classList.add('title-menu');
    m.appendChild(this.el('<div class="hint">Click anywhere to enable sound · best in desktop Chrome</div>'));
  }

  pause() {
    this.buttons([
      ['RESUME', () => this.app.resume()],
      ['MAP', () => this.app.openMap()],
      ['STATS', () => this.stats(() => this.pause())],
      ['CONTROLS', () => this.controls(() => this.pause())],
      ['SETTINGS', () => this.settings(() => this.pause())],
      ['QUIT TO TITLE', () => this.confirm('Quit to the title screen? Unsaved progress since your last save will be lost.', () => this.app.quitToTitle(), () => this.pause())],
    ], { title: 'PAUSED' });
  }

  panelPage(html, back) {
    const m = this.el(`<div class="menu center"><div class="panel">${html}</div></div>`);
    const b = this.el('<button style="margin-top:16px;min-width:200px;text-align:center">BACK</button>');
    b.addEventListener('click', () => { this.app.audio?.ui(); back(); });
    m.querySelector('.panel').appendChild(b);
    this.root.innerHTML = '';
    this.root.appendChild(m);
    this.current = m;
    this.select(0);
    return m;
  }

  controls(back) {
    this.panelPage(`<h2>CONTROLS</h2><table>${CONTROLS.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`, back);
  }

  credits(back) {
    this.panelPage(`<h2>CREDITS</h2>
      <p style="font-family:system-ui;max-width:560px;line-height:1.5">SELARA BAY — an original open-world game made for the make.fun gta6-01 bounty.<br>
      Custom WebGL2 engine, procedural city, characters, vehicles and synthesized soundtrack — every pixel and note generated in code.<br><br>
      Story: Kai Santoso, Mama Lin, Dex, Viktor Raza and Rendy are original characters.<br>
      Music: Selara Nights FM, Ombak Lo-Fi and Gamelan Wave are fictional stations with original compositions.<br><br>
      Code license: MIT. Copyright © I Wayan Bagus Somabawa.</p>`, back);
  }

  stats(back) {
    const w = this.app.game;
    const s = w.stats;
    const t = Math.floor(s.timePlayed);
    const rows = [
      ['Missions passed', `${w.missions?.passedCount ?? 0} / 6`], ['Orchid tags', `${w.tags?.collected.size ?? 0} / 12`], ['Money', `$${w.money.toLocaleString('en-US')}`],
      ['People taken down', s.kills], ['Officers taken down', s.copsKilled], ['Cars stolen', s.carsStolen], ['Shots fired', s.shots],
      ['Time played', `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m ${t % 60}s`],
    ];
    this.panelPage(`<h2>STATS</h2><table>${rows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</table>`, back);
  }

  settings(back) {
    const s = loadSettings();
    const html = `<h2>SETTINGS</h2>
      <div class="row"><label>Graphics quality</label><select id="set-q"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
      <div class="row"><label>Music volume</label><input id="set-music" type="range" min="0" max="1" step="0.05" value="${s.music}"></div>
      <div class="row"><label>SFX volume</label><input id="set-sfx" type="range" min="0" max="1" step="0.05" value="${s.sfx}"></div>
      <div class="row"><label>Radio volume</label><input id="set-radio" type="range" min="0" max="1" step="0.05" value="${s.radio}"></div>
      <div class="row"><label>Mouse sensitivity</label><input id="set-sens" type="range" min="0.3" max="2.5" step="0.05" value="${s.sensitivity}"></div>
      <div class="row"><label>Invert Y</label><input id="set-inv" type="checkbox" ${s.invertY ? 'checked' : ''}></div>`;
    const m = this.panelPage(html, () => { this.apply(); back(); });
    m.querySelector('#set-q').value = s.quality ?? this.app.renderer.presetKey;
    m.querySelectorAll('input,select').forEach((i) => i.addEventListener('input', () => this.apply()));
  }

  apply() {
    const q = (id) => document.getElementById(id);
    if (!q('set-q')) return;
    const s = {
      quality: q('set-q').value,
      music: Number(q('set-music').value),
      sfx: Number(q('set-sfx').value),
      radio: Number(q('set-radio').value),
      sensitivity: Number(q('set-sens').value),
      invertY: q('set-inv').checked,
    };
    saveSettings(s);
    this.app.applySettings(s);
  }

  confirm(text, yes, no) {
    const m = this.el(`<div class="confirm panel"><p style="font-family:system-ui;max-width:420px">${text}</p></div>`);
    const row = this.el('<div class="menu" style="position:static;flex-direction:row;padding:0;justify-content:center"></div>');
    for (const [label, fn] of [['YES', yes], ['NO', no]]) {
      const b = this.el(`<button>${label}</button>`);
      b.addEventListener('click', () => { this.app.audio?.ui(); fn(); });
      row.appendChild(b);
    }
    m.appendChild(row);
    this.root.innerHTML = '';
    this.root.appendChild(m);
    this.current = m;
    this.select(1);
  }
}
