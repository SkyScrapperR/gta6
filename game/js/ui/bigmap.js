// Full-screen map and dossier (M, or Pause > Map): the pre-rendered city with district names, landmark
// icons, a legend, a dossier panel (story missions and status, side content, stats), the
// player, police and mission blips. Left click sets a waypoint (shown as a beam in the world and a
// GPS route on the minimap); right click clears it. Mouse wheel zooms.

import { MAP_MIN, MAP_SIZE, drawIcon } from './minimap.js';
import { DISTRICTS, LANDMARKS, PITCH } from '../world/layout.js';
import { MISSIONS } from '../story/missions.js';

const LABELS = [
  ['downtown', 5.5, 3.6], ['midtown', 4.5, 7.5], ['midtown', 7.4, 1.0], ['residential', 1.5, 8.3], ['docks', 9.0, 4.6], ['beach', 5.0, 10.35], ['park', 3.4, 5.05],
];

export class BigMap {
  constructor(world, hud) {
    this.world = world;
    this.hud = hud;
    this.zoom = 1;
    this.open = false;
    this.canvas = document.getElementById('hud');
    addEventListener('mousedown', (e) => this.onClick(e));
    addEventListener('wheel', (e) => { if (this.open) this.zoom = Math.max(0.7, Math.min(2.5, this.zoom * (e.deltaY > 0 ? 0.9 : 1.1))); });
  }

  layout() {
    const W = this.canvas.width, H = this.canvas.height;
    const size = Math.min(W, H) * 0.9 * this.zoom;
    const scale = size / MAP_SIZE;
    const p = this.world.player;
    const cx = this.zoom > 1 ? W / 2 - (p.x - MAP_MIN - MAP_SIZE / 2) * scale : W / 2;
    const cy = this.zoom > 1 ? H / 2 - (p.z - MAP_MIN - MAP_SIZE / 2) * scale : H / 2;
    return { x0: cx - size / 2, y0: cy - size / 2, scale };
  }

  /** Dossier panel on the right: story missions and their status, side content and stats, all live. */
  drawDossier(g, W, s) {
    const w = this.world;
    const m = w.missions;
    const pw = 290 * s, x = W - pw - 24 * s;
    let y = 24 * s;
    const head = (text) => {
      g.font = `900 ${15 * s}px "Arial Black", sans-serif`;
      g.fillStyle = '#2ff3e0';
      g.fillText(text, x + 14 * s, y + 12 * s);
      y += 30 * s;
    };
    const row = (label, value, color = '#f2f4ff', valueColor = '#c8cce0') => {
      g.font = `600 ${13.5 * s}px system-ui, sans-serif`;
      g.textAlign = 'left';
      g.fillStyle = color;
      g.fillText(label, x + 14 * s, y);
      g.textAlign = 'right';
      g.fillStyle = valueColor;
      g.fillText(value, x + pw - 14 * s, y);
      g.textAlign = 'left';
      y += 21 * s;
    };
    const stats = w.stats;
    const t = Math.floor(stats.timePlayed);
    const height = (30 + 6 * 21 + 16 + 30 + 3 * 21 + 16 + 30 + 6 * 21 + 10) * s;
    g.fillStyle = 'rgba(8,10,20,0.85)';
    g.fillRect(x, y, pw, height);
    g.fillStyle = '#ff3fa4';
    g.fillRect(x, y, 4 * s, height);
    g.textAlign = 'left';
    g.textBaseline = 'middle';
    y += 6 * s;
    head('STORY');
    MISSIONS.forEach((def, i) => {
      const active = m.active === def;
      const status = active ? ['IN PROGRESS', '#ffd23a'] : i < m.passed ? ['PASSED', '#4dff9a'] : i === m.passed ? ['AVAILABLE', '#ffd23a'] : ['LOCKED', '#6a7088'];
      row(`${i + 1}  ${def.title}`, status[0], i <= m.passed ? '#f2f4ff' : '#8a90a6', status[1]);
    });
    y += 16 * s;
    head('SIDE CONTENT');
    row('Orchid tags', `${w.tags.collected.size} / 12`);
    row('Kilat Respray', 'clears stars · $100');
    row('Bang Bang Arms', 'guns · ammo · armor');
    y += 16 * s;
    head('STATS');
    row('Money', `$${w.money.toLocaleString('en-US')}`, '#f2f4ff', '#4dff9a');
    row('Missions passed', `${m.passed} / 6`);
    row('People taken down', String(stats.kills));
    row('Officers taken down', String(stats.copsKilled));
    row('Cars stolen', String(stats.carsStolen));
    row('Time played', `${Math.floor(t / 3600)}h ${Math.floor((t % 3600) / 60)}m`);
  }

  toScreen(x, z) {
    const L = this.layout();
    return [L.x0 + (x - MAP_MIN) * L.scale, L.y0 + (z - MAP_MIN) * L.scale];
  }

  onClick(e) {
    if (!this.open) return;
    const dpr = this.hud.dpr ?? 1;
    const L = this.layout();
    const x = (e.clientX * dpr - L.x0) / L.scale + MAP_MIN;
    const z = (e.clientY * dpr - L.y0) / L.scale + MAP_MIN;
    if (e.button === 2) this.world.waypoint = null;
    else if (e.button === 0) {
      this.world.waypoint = [x, z];
      this.world.emit('waypoint', { x, z });
    }
  }

  draw() {
    const g = this.hud.g;
    const W = this.canvas.width, H = this.canvas.height;
    const s = Math.max(0.75, Math.min(H / 1080, W / 1920) * 1.25);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = 'rgba(4,6,12,0.92)';
    g.fillRect(0, 0, W, H);
    const L = this.layout();
    g.drawImage(this.hud.map, L.x0, L.y0, MAP_SIZE * L.scale, MAP_SIZE * L.scale);
    g.strokeStyle = 'rgba(47,243,224,0.5)';
    g.lineWidth = 2;
    g.strokeRect(L.x0, L.y0, MAP_SIZE * L.scale, MAP_SIZE * L.scale);
    // District names.
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    for (const [key, bx, bz] of LABELS) {
      const [x, y] = this.toScreen(bx * PITCH, bz * PITCH);
      g.font = `900 ${Math.round(22 * s * Math.min(1.4, this.zoom))}px "Arial Black", sans-serif`;
      g.lineWidth = 5;
      g.strokeStyle = '#000';
      g.strokeText(DISTRICTS[key].name.toUpperCase(), x, y);
      g.fillStyle = DISTRICTS[key].color;
      g.fillText(DISTRICTS[key].name.toUpperCase(), x, y);
    }
    // Blips.
    for (const b of this.hud.blips()) {
      const [x, y] = this.toScreen(b.x, b.z);
      if (b.dot) {
        g.fillStyle = b.color;
        g.beginPath();
        g.arc(x, y, (b.size ?? 4) * 1.2, 0, Math.PI * 2);
        g.fill();
      } else drawIcon(g, b.icon, x, y, 11 * s, b.color);
    }
    // Waypoint route.
    const route = this.hud.minimap.route;
    if (route) {
      g.strokeStyle = '#ff3fa4';
      g.lineWidth = 3;
      g.beginPath();
      route.forEach(([x, z], i) => {
        const [sx, sy] = this.toScreen(x, z);
        if (i) g.lineTo(sx, sy); else g.moveTo(sx, sy);
      });
      g.stroke();
    }
    // Player.
    const p = this.world.player;
    const [px, py] = this.toScreen(p.x, p.z);
    g.save();
    g.translate(px, py);
    g.rotate(Math.PI - (p.vehicle ? p.vehicle.yaw : p.yaw));
    g.fillStyle = '#fff';
    g.strokeStyle = '#000';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -12); g.lineTo(8, 9); g.lineTo(0, 4); g.lineTo(-8, 9); g.closePath();
    g.fill(); g.stroke();
    g.restore();
    // Legend.
    const items = Object.values(LANDMARKS).map((l) => [l.icon, l.name, l.color]);
    items.push(['mission', 'Mission', '#ffd23a'], ['save', 'Save point', '#2ff3e0'], ['target', 'Waypoint', '#ff3fa4'], ['tag', 'Orchid tag', '#c070ff']);
    const lx = 24 * s, ly = 24 * s;
    g.fillStyle = 'rgba(8,10,20,0.85)';
    g.fillRect(lx, ly, 250 * s, (items.length * 24 + 50) * s);
    g.font = `900 ${18 * s}px "Arial Black", sans-serif`;
    g.textAlign = 'left';
    g.fillStyle = '#2ff3e0';
    g.fillText('SELARA BAY', lx + 14 * s, ly + 22 * s);
    g.font = `600 ${14 * s}px system-ui, sans-serif`;
    items.forEach(([icon, name, color], i) => {
      drawIcon(g, icon, lx + 24 * s, ly + (52 + i * 24) * s, 8 * s, color);
      g.fillStyle = '#f2f4ff';
      g.fillText(name, lx + 42 * s, ly + (52 + i * 24) * s);
    });
    this.drawDossier(g, W, s);
    g.textAlign = 'center';
    g.fillStyle = '#c8cce0';
    g.fillText('Left click: set waypoint   ·   Right click: clear   ·   Wheel: zoom   ·   M / Esc: close', W / 2, H - 22 * s);
  }
}
