// The HUD, drawn on a 2D canvas over the 3D view: top-right panel (clock + weather, money that ticks
// up, weapon icon with clip/ammo, five wanted stars that flash while unseen), the minimap with
// health/armor arcs, a dynamic crosshair with hit markers and damage-direction arcs, stamina, and
// the notification slots (objective, subtitles with speaker colours, help tips, area / vehicle /
// radio pop-ups, the big MISSION PASSED / FLATLINED / CUFFED banners). F3 shows the FPS counter.

import { Minimap, renderCityMap, MAP_MIN } from './minimap.js';
import { WEAPONS } from '../combat/weapons.js';
import { districtAt, DISTRICTS } from '../world/layout.js';

const FONT = '"Segoe UI Black", "Arial Black", Impact, sans-serif';

function outlined(g, text, x, y, fill, stroke = '#000', width = 4) {
  g.lineJoin = 'round';
  g.lineWidth = width;
  g.strokeStyle = stroke;
  g.strokeText(text, x, y);
  g.fillStyle = fill;
  g.fillText(text, x, y);
}

function panel(g, x, y, w, h, alpha = 0.72) {
  g.fillStyle = `rgba(8,10,20,${alpha})`;
  g.beginPath();
  g.roundRect(x, y, w, h, 6);
  g.fill();
  g.strokeStyle = 'rgba(47,243,224,0.35)';
  g.lineWidth = 1;
  g.stroke();
}

function star(g, x, y, r, filled, color) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fillStyle = filled ? color : 'rgba(255,255,255,0.12)';
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = '#000';
  g.stroke();
}

function weaponIcon(g, key, x, y, s) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#f2f4ff';
  g.strokeStyle = '#000';
  g.lineWidth = 2;
  const R = (a, b, c, d) => { g.fillRect(a * s, b * s, c * s, d * s); g.strokeRect(a * s, b * s, c * s, d * s); };
  if (key === 'fists') {
    g.beginPath();
    g.roundRect(-0.5 * s, -0.35 * s, s, 0.7 * s, 0.15 * s);
    g.fill(); g.stroke();
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo((-0.35 + i * 0.25) * s, -0.35 * s); g.lineTo((-0.35 + i * 0.25) * s, 0); g.stroke(); }
  } else if (key === 'pistol') { R(-0.6, -0.25, 1.1, 0.28); R(-0.55, 0, 0.3, 0.5); }
  else if (key === 'smg') { R(-0.8, -0.25, 1.5, 0.3); R(-0.2, 0.05, 0.22, 0.6); R(-0.8, -0.15, -0.35, 0.18); R(0.7, -0.17, 0.25, 0.12); }
  else if (key === 'shotgun') { R(-1.0, -0.2, 2.0, 0.22); R(-1.0, -0.05, 0.5, 0.35); R(0.1, 0.02, 0.6, 0.14); }
  g.restore();
}

export class HUD {
  constructor(world, canvas) {
    this.world = world;
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.map = renderCityMap(world.city);
    this.minimap = new Minimap(world, this.map);
    this.moneyShown = 0;
    this.showFps = false;
    this.lastArea = null;
    this.landmarkBlips = Minimap.landmarkBlips(world.city);
    this.dmgDir = null;
    this.dmgT = 0;
    this.lastHealth = 100;
    this.visible = true;
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(innerWidth * dpr), h = Math.floor(innerHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.dpr = dpr;
  }

  /** Collect blips for the minimap/big map from the world and the mission system. */
  blips() {
    const w = this.world;
    const out = [...this.landmarkBlips];
    for (const v of w.vehicles.list) {
      if (v.police && v.pursuit && !v.wrecked) out.push({ x: v.x, z: v.z, dot: true, color: Math.sin(w.time * 12) > 0 ? '#ff3a3a' : '#4a7aff', size: 4.5 });
    }
    for (const c of w.peds.list) {
      if (c.kind === 'cop' && !c.dead && !c.hidden) out.push({ x: c.x, z: c.z, dot: true, color: '#4a7aff', size: 3, flash: true });
      if (c.target && !c.dead) out.push({ x: c.x, z: c.z, dot: true, color: '#ff3a5a', size: 4.5 });
    }
    if (w.heli?.active && !w.heli.down) out.push({ x: w.heli.x, z: w.heli.z, icon: 'badge', color: '#4a7aff', flash: true });
    for (const b of w.missions?.blips() ?? []) out.push(b);
    if (w.waypoint) out.push({ x: w.waypoint[0], z: w.waypoint[1], icon: 'target', color: '#ff3fa4', always: true });
    return out;
  }

  notify(n) {
    this.world.notes.push(n);
  }

  draw(dt) {
    this.resize();
    const g = this.g;
    const W = this.canvas.width, H = this.canvas.height;
    const s = Math.max(0.75, Math.min(H / 1080, W / 1920) * 1.25) * 1;
    const w = this.world;
    const p = w.player;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!this.visible) return;
    w.notes.update(dt);
    const cine = w.cinematic;

    // Area name pop-up on district change.
    const area = districtAt(p.x, p.z);
    if (area !== this.lastArea && !cine) {
      if (this.lastArea !== null && area !== 'sea') w.notes.push({ slot: 'area', text: DISTRICTS[area].name, color: DISTRICTS[area].color, duration: 3.5, key: 'area' });
      this.lastArea = area;
    }

    if (cine) {
      this.drawCinematic(g, W, H, s, dt);
      this.drawSlots(g, W, H, s);
      return;
    }

    // ------------------------------------------------ top-right panel
    g.save();
    g.scale(s, s);
    const PW = 250, px = W / s - PW - 24, py = 22;
    panel(g, px, py, PW, 118);
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    g.font = `900 22px ${FONT}`;
    outlined(g, w.env.clockText, px + 14, py + 22, '#f2f4ff');
    // Weather icon.
    const wx = px + 108, wy = py + 22;
    if (w.env.rain > 0.3) {
      g.fillStyle = '#9ab0c8'; g.beginPath(); g.arc(wx, wy - 2, 7, 0, Math.PI * 2); g.arc(wx + 8, wy, 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#6ac0ff'; g.lineWidth = 2; for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(wx - 4 + i * 5, wy + 7); g.lineTo(wx - 6 + i * 5, wy + 12); g.stroke(); }
    } else if (w.env.night > 0.5) {
      g.fillStyle = '#e8e4c8'; g.beginPath(); g.arc(wx, wy, 8, 0.6, Math.PI * 2 - 0.6 + 6.28, false); g.fill();
      g.fillStyle = '#0b0d14'; g.beginPath(); g.arc(wx + 4, wy - 3, 7, 0, Math.PI * 2); g.fill();
    } else {
      g.fillStyle = '#ffcf4a'; g.beginPath(); g.arc(wx, wy, 7, 0, Math.PI * 2); g.fill();
      g.strokeStyle = '#ffcf4a'; g.lineWidth = 2;
      for (let i = 0; i < 8; i++) { const a = i * 0.785; g.beginPath(); g.moveTo(wx + Math.cos(a) * 10, wy + Math.sin(a) * 10); g.lineTo(wx + Math.cos(a) * 13, wy + Math.sin(a) * 13); g.stroke(); }
    }
    // Money, ticking up.
    const diff = w.money - this.moneyShown;
    this.moneyShown += Math.abs(diff) < 1 ? diff : diff * Math.min(1, dt * 4) + Math.sign(diff) * Math.min(Math.abs(diff), dt * 200);
    g.textAlign = 'right';
    g.font = `900 26px ${FONT}`;
    outlined(g, `$${Math.round(this.moneyShown).toLocaleString('en-US')}`, px + PW - 14, py + 24, diff > 0.5 ? '#9dff6a' : '#4dff9a');
    // Weapon.
    const key = w.arsenal.current;
    weaponIcon(g, key, px + 44, py + 64, 26);
    g.font = `900 18px ${FONT}`;
    g.textAlign = 'left';
    outlined(g, WEAPONS[key].name.toUpperCase(), px + 84, py + 56, '#f2f4ff');
    if (!WEAPONS[key].melee) {
      const st = w.arsenal.state;
      const txt = w.arsenal.reloading > 0 ? 'RELOADING' : `${st.clip} / ${st.ammo}`;
      outlined(g, txt, px + 84, py + 78, w.arsenal.reloading > 0 ? '#ffd23a' : st.clip === 0 ? '#ff5a5a' : '#2ff3e0');
    }
    // Stars.
    const stars = w.wanted.stars;
    const flash = w.wanted.flash && Math.sin(w.time * 9) < 0;
    for (let i = 0; i < 5; i++) star(g, px + PW - 22 - (4 - i) * 30, py + 100, 11, i < stars && !flash, '#ffd23a');
    g.restore();

    // ------------------------------------------------ minimap
    const R = 96 * s;
    const mcx = 30 * s + R, mcy = H - 30 * s - R;
    const target = w.missions?.gpsTarget?.() ?? w.waypoint;
    this.minimap.updateRoute(dt, target);
    this.minimap.draw(g, mcx, mcy, R, this.blips(), dt);
    // Stamina bar under the minimap.
    if (p.stamina < 0.99 && !p.vehicle) {
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect(mcx - R, mcy + R + 14 * s, R * 2, 6 * s);
      g.fillStyle = p.sprintLock ? '#ff8a3a' : '#ffd23a';
      g.fillRect(mcx - R, mcy + R + 14 * s, R * 2 * p.stamina, 6 * s);
    }
    // Vehicle speed.
    if (p.vehicle) {
      g.save();
      g.scale(s, s);
      g.font = `900 30px ${FONT}`;
      g.textAlign = 'left';
      outlined(g, `${Math.round(Math.abs(p.vehicle.speed) * 3.6)}`, (mcx + R) / s + 22, mcy / s + R / s - 10, '#f2f4ff');
      g.font = `900 13px ${FONT}`;
      outlined(g, 'KM/H', (mcx + R) / s + 24, mcy / s + R / s + 12, '#2ff3e0', '#000', 3);
      // Vehicle damage bar.
      const hp = Math.max(0, p.vehicle.health / p.vehicle.maxHealth);
      g.fillStyle = 'rgba(0,0,0,0.55)';
      g.fillRect((mcx + R) / s + 22, mcy / s + R / s + 24, 80, 6);
      g.fillStyle = hp < 0.35 ? '#ff5a3a' : '#ffd23a';
      g.fillRect((mcx + R) / s + 22, mcy / s + R / s + 24, 80 * hp, 6);
      g.restore();
    }

    // ------------------------------------------------ crosshair, hit markers, damage direction
    const cx = W / 2, cy = H / 2;
    const ranged = !WEAPONS[key].melee;
    if ((p.aim > 0.5 || (p.vehicle && w.input.leftDown)) && ranged && p.alive) {
      const gap = (6 + w.combat.bloom * 18) * s;
      g.strokeStyle = '#ffffff';
      g.lineWidth = 2.5 * s;
      g.shadowColor = '#000';
      g.shadowBlur = 3;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        g.beginPath();
        g.moveTo(cx + dx * gap, cy + dy * gap);
        g.lineTo(cx + dx * (gap + 9 * s), cy + dy * (gap + 9 * s));
        g.stroke();
      }
      g.fillStyle = '#2ff3e0';
      g.fillRect(cx - 1.5 * s, cy - 1.5 * s, 3 * s, 3 * s);
      g.shadowBlur = 0;
    } else if (!p.vehicle && p.alive) {
      g.fillStyle = 'rgba(255,255,255,0.5)';
      g.beginPath();
      g.arc(cx, cy, 2 * s, 0, Math.PI * 2);
      g.fill();
    }
    if (w.combat.hitMarker > 0) {
      const k = Math.min(1, w.combat.hitMarker);
      g.strokeStyle = w.combat.hitMarker > 1 ? `rgba(255,60,80,${k})` : `rgba(255,255,255,${k})`;
      g.lineWidth = 3 * s;
      for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) {
        g.beginPath();
        g.moveTo(cx + dx * 8 * s, cy + dy * 8 * s);
        g.lineTo(cx + dx * 16 * s, cy + dy * 16 * s);
        g.stroke();
      }
    }
    if (p.health < this.lastHealth - 0.5 && p.lastHitFrom) {
      this.dmgDir = p.lastHitFrom.slice();
      this.dmgT = 1.2;
    }
    this.lastHealth = p.health;
    if (this.dmgT > 0 && this.dmgDir) {
      this.dmgT -= dt;
      const ang = Math.atan2(this.dmgDir[0] - p.x, this.dmgDir[1] - p.z) - w.camCtl.yaw;
      g.strokeStyle = `rgba(255,40,40,${Math.min(1, this.dmgT) * 0.8})`;
      g.lineWidth = 10 * s;
      g.beginPath();
      const a = -Math.PI / 2 - ang;
      g.arc(cx, cy, 120 * s, a - 0.35, a + 0.35);
      g.stroke();
    }
    // Low health vignette.
    if (p.health < 30 && p.alive) {
      const grd = g.createRadialGradient(cx, cy, H * 0.3, cx, cy, H * 0.8);
      grd.addColorStop(0, 'rgba(120,0,0,0)');
      grd.addColorStop(1, `rgba(150,0,0,${0.35 + 0.15 * Math.sin(w.time * 6)})`);
      g.fillStyle = grd;
      g.fillRect(0, 0, W, H);
    }
    this.drawSlots(g, W, H, s);
    if (this.showFps) {
      g.font = `bold ${14 * s}px monospace`;
      g.textAlign = 'left';
      const r = w.renderer;
      outlined(g, `${Math.round(w.fps)} FPS  ${r.preset.name}  ${(r.stats.tris / 1e6).toFixed(2)}M tris  ${r.stats.draws} draws`, 12 * s, 20 * s, '#9dff6a', '#000', 3);
    }
  }

  /** Letterbox bars for cutscenes; subtitles and portrait cards come from the slots. */
  drawCinematic(g, W, H, s, dt) {
    const k = Math.min(1, (this.cineT = (this.cineT ?? 0) + dt * 2));
    const bar = H * 0.11 * k;
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, bar);
    g.fillRect(0, H - bar, W, bar);
    const c = this.world.cinematic;
    if (c?.portrait) this.portrait(g, c.portrait, 40 * s, H - bar - 150 * s, s);
    if (c?.skipHint) {
      g.font = `700 ${13 * s}px sans-serif`;
      g.textAlign = 'right';
      outlined(g, 'SPACE to skip', W - 24 * s, H - bar / 2, 'rgba(255,255,255,0.7)', '#000', 3);
    }
  }

  /** 2D portrait card: a stylised bust drawn with the character's palette. */
  portrait(g, who, x, y, s) {
    const P = {
      kai: ['#16b3a6', '#d9a27a', '#17110d', 'KAI'], lin: ['#e8792a', '#e0ac83', '#a8a8a8', 'MAMA LIN'], dex: ['#3a4a5a', '#8a5535', '#1a1410', 'DEX'],
      viktor: ['#f2f0ea', '#f1c9a5', '#2a2420', 'VIKTOR RAZA'], rendy: ['#f2c41a', '#e0ac83', '#2a1d14', 'RENDY'],
    }[who];
    if (!P) return;
    const w = 120 * s, h = 136 * s;
    g.save();
    panel(g, x, y, w, h, 0.85);
    g.beginPath();
    g.rect(x + 4, y + 4, w - 8, h - 8);
    g.clip();
    const grd = g.createLinearGradient(x, y, x, y + h);
    grd.addColorStop(0, who === 'viktor' ? '#3a1a4a' : '#13344a');
    grd.addColorStop(1, '#0b0d14');
    g.fillStyle = grd;
    g.fillRect(x, y, w, h);
    const cx = x + w / 2;
    g.fillStyle = P[0];
    g.beginPath(); g.ellipse(cx, y + h * 1.02, w * 0.48, h * 0.38, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = P[1];
    g.fillRect(cx - w * 0.07, y + h * 0.52, w * 0.14, h * 0.16);
    g.beginPath(); g.ellipse(cx, y + h * 0.42, w * 0.2, h * 0.2, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = P[2];
    g.beginPath(); g.ellipse(cx, y + h * 0.3, w * 0.22, h * 0.13, 0, Math.PI, Math.PI * 2); g.fill();
    if (who === 'lin') { g.beginPath(); g.arc(cx, y + h * 0.18, w * 0.08, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#fff';
    for (const dx of [-1, 1]) { g.beginPath(); g.ellipse(cx + dx * w * 0.08, y + h * 0.42, w * 0.045, h * 0.03, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#1a1010';
    for (const dx of [-1, 1]) { g.beginPath(); g.arc(cx + dx * w * 0.08, y + h * 0.42, w * 0.022, 0, Math.PI * 2); g.fill(); }
    if (who === 'lin') { g.strokeStyle = '#111'; g.lineWidth = 2; for (const dx of [-1, 1]) { g.beginPath(); g.arc(cx + dx * w * 0.08, y + h * 0.42, w * 0.055, 0, Math.PI * 2); g.stroke(); } }
    g.restore();
    g.font = `900 ${14 * s}px ${FONT}`;
    g.textAlign = 'center';
    outlined(g, P[3], cx, y + h + 14 * s, '#f2f4ff', '#000', 3);
  }

  drawSlots(g, W, H, s) {
    const n = this.world.notes;
    const cine = this.world.cinematic;
    // Banner (big centre words).
    const ban = n.active.banner;
    if (ban) {
      const a = n.alpha('banner');
      g.save();
      g.globalAlpha = a;
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      const scale = 1 + Math.max(0, 0.25 - ban.t) * 1.2;
      g.font = `900 ${Math.round(96 * s * scale)}px ${FONT}`;
      g.shadowColor = ban.color;
      g.shadowBlur = 30 * s;
      outlined(g, ban.text, W / 2, H * 0.4, ban.color, '#000', 8 * s);
      g.shadowBlur = 0;
      if (ban.sub) {
        g.font = `900 ${30 * s}px ${FONT}`;
        outlined(g, ban.sub, W / 2, H * 0.4 + 76 * s, '#f2f4ff', '#000', 5 * s);
      }
      g.restore();
    }
    g.textBaseline = 'middle';
    // Objective (bottom centre, above subtitles).
    const obj = n.active.objective;
    if (obj && !cine) {
      g.globalAlpha = n.alpha('objective');
      g.textAlign = 'center';
      g.font = `800 ${24 * s}px ${FONT}`;
      outlined(g, obj.text, W / 2, H - 150 * s, obj.color ?? '#f2f4ff', '#000', 5 * s);
      if (obj.sub) {
        g.font = `800 ${18 * s}px ${FONT}`;
        outlined(g, obj.sub, W / 2, H - 120 * s, '#2ff3e0', '#000', 4 * s);
      }
      g.globalAlpha = 1;
    }
    // Subtitle with speaker name and colour.
    const sub = n.active.subtitle;
    if (sub) {
      g.globalAlpha = n.alpha('subtitle');
      g.textAlign = 'center';
      const y = cine ? H - H * 0.055 : H - 80 * s;
      g.font = `700 ${22 * s}px "Segoe UI", system-ui, sans-serif`;
      const line = sub.speaker ? `${sub.speaker}: ` : '';
      const full = line + sub.text;
      const tw = g.measureText(full).width;
      let x0 = W / 2 - tw / 2;
      g.textAlign = 'left';
      if (line) {
        outlined(g, line, x0, y, sub.color ?? '#ffd23a', '#000', 4 * s);
        x0 += g.measureText(line).width;
      }
      outlined(g, sub.text, x0, y, '#ffffff', '#000', 4 * s);
      g.globalAlpha = 1;
    }
    // Help tip (top-left box).
    const help = n.active.help;
    if (help && !cine) {
      g.save();
      g.globalAlpha = n.alpha('help');
      g.font = `600 ${16 * s}px "Segoe UI", system-ui, sans-serif`;
      const lines = help.text.split('\n');
      const bw = Math.max(...lines.map((l) => g.measureText(l).width)) + 30 * s;
      const bh = lines.length * 22 * s + 18 * s;
      g.scale(1, 1);
      panel(g, 22 * s, 22 * s, bw, bh, 0.8);
      g.textAlign = 'left';
      lines.forEach((l, i) => outlined(g, l, 37 * s, 22 * s + 20 * s + i * 22 * s, '#f2f4ff', '#000', 3));
      g.restore();
    }
    // Right-side pop-ups stacked in fixed rows: area, vehicle, radio, toast.
    const rows = [['area', 0], ['vehicle', 1], ['radio', 2], ['toast', 3]];
    for (const [slot, row] of rows) {
      const m = n.active[slot];
      if (!m || (cine && slot !== 'toast')) continue;
      g.globalAlpha = n.alpha(slot);
      g.textAlign = 'right';
      const y = H - 230 * s - row * 46 * s;
      g.font = `900 ${(slot === 'area' ? 30 : 20) * s}px ${FONT}`;
      outlined(g, m.text, W - 30 * s, y, m.color ?? '#f2f4ff', '#000', 5 * s);
      if (m.sub) {
        g.font = `700 ${15 * s}px "Segoe UI", system-ui, sans-serif`;
        outlined(g, m.sub, W - 30 * s, y + 22 * s, '#ff3fa4', '#000', 3 * s);
      }
      g.globalAlpha = 1;
    }
  }
}

export { MAP_MIN };
