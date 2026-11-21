// The city map, pre-rendered once into a canvas from the layout and collision data (sea, beach,
// districts, roads, buildings, parks, piers), and the circular minimap that rotates with the camera:
// player arrow, mission/safehouse/shop/hospital blips, flashing police, mission targets, the search
// area, a GPS route along the road graph and health/armor arcs around the rim.

import { PITCH, GRID, ROAD_HALF, CITY, LANDMARKS, districtOfBlock, DISTRICTS } from '../world/layout.js';

export const MAP_MIN = -220;
export const MAP_SIZE = 1500; // world metres covered, 1 px per metre

export function renderCityMap(city) {
  const c = document.createElement('canvas');
  c.width = c.height = MAP_SIZE;
  const g = c.getContext('2d');
  const X = (x) => x - MAP_MIN;
  g.fillStyle = '#0e2c44';
  g.fillRect(0, 0, MAP_SIZE, MAP_SIZE);
  // Gentle depth bands in the sea.
  g.fillStyle = '#123652';
  g.fillRect(X(-60), X(-60), CITY + 120, CITY + 180);
  // Land and beach.
  g.fillStyle = '#2b2e35';
  g.fillRect(X(-30), X(-30), CITY + 60, CITY + 40);
  g.fillStyle = '#c9b27a';
  g.fillRect(X(-30), X(CITY + 10), CITY + 60, 50);
  g.fillStyle = '#6a5a40';
  g.fillRect(X(440), X(CITY + 10), 20, 140);
  g.fillRect(X(1030), X(676), 120, 28);
  // District tints per block.
  const tint = { downtown: '#2f3a48', midtown: '#3a3530', residential: '#2f3a2c', docks: '#3a3826', beach: '#3a3036', park: '#2d4a2c' };
  for (let j = 0; j < GRID; j++) {
    for (let i = 0; i < GRID; i++) {
      const d = districtOfBlock(i, j);
      g.fillStyle = tint[d] ?? '#33363c';
      g.fillRect(X(i * PITCH + ROAD_HALF), X(j * PITCH + ROAD_HALF), PITCH - 2 * ROAD_HALF, PITCH - 2 * ROAD_HALF);
      if (d === 'park') {
        g.fillStyle = '#3f7a3a';
        g.fillRect(X(i * PITCH + 11), X(j * PITCH + 11), PITCH - 22, PITCH - 22);
        g.fillStyle = '#2a6a8a';
        g.beginPath();
        g.arc(X(i * PITCH + 68), X(j * PITCH + 68), 10, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // Buildings and containers from the collision world.
  for (const b of city.col.boxes) {
    const k = b.data.kind;
    if (k === 'building') g.fillStyle = '#5c616b';
    else if (k === 'container') g.fillStyle = '#7a6a4a';
    else continue;
    g.fillRect(X(b.x0), X(b.z0), b.x1 - b.x0, b.z1 - b.z0);
  }
  // Roads with a faint centre line.
  g.fillStyle = '#80848c';
  for (let i = 0; i <= GRID; i++) {
    g.fillRect(X(i * PITCH - ROAD_HALF), X(-ROAD_HALF), ROAD_HALF * 2, CITY + 2 * ROAD_HALF);
    g.fillRect(X(-ROAD_HALF), X(i * PITCH - ROAD_HALF), CITY + 2 * ROAD_HALF, ROAD_HALF * 2);
  }
  g.fillStyle = '#9ea2a8';
  for (let i = 0; i <= GRID; i++) {
    g.fillRect(X(i * PITCH - 0.6), X(-ROAD_HALF), 1.2, CITY + 2 * ROAD_HALF);
    g.fillRect(X(-ROAD_HALF), X(i * PITCH - 0.6), CITY + 2 * ROAD_HALF, 1.2);
  }
  return c;
}

/** Small vector icons for blips. */
export function drawIcon(g, icon, x, y, s, color) {
  g.save();
  g.translate(x, y);
  g.fillStyle = '#0b0d14';
  g.strokeStyle = color;
  g.lineWidth = 2;
  g.beginPath();
  g.arc(0, 0, s, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.fillStyle = color;
  g.strokeStyle = color;
  const k = s * 0.55;
  g.lineWidth = Math.max(1.5, s * 0.18);
  g.beginPath();
  switch (icon) {
    case 'house': g.moveTo(-k, 0); g.lineTo(0, -k); g.lineTo(k, 0); g.lineTo(k * 0.7, 0); g.lineTo(k * 0.7, k); g.lineTo(-k * 0.7, k); g.lineTo(-k * 0.7, 0); g.closePath(); g.fill(); break;
    case 'cross': g.fillRect(-k * 0.3, -k, k * 0.6, k * 2); g.fillRect(-k, -k * 0.3, k * 2, k * 0.6); break;
    case 'badge': g.moveTo(0, -k); g.lineTo(k, -k * 0.4); g.lineTo(k * 0.6, k); g.lineTo(-k * 0.6, k); g.lineTo(-k, -k * 0.4); g.closePath(); g.fill(); break;
    case 'wrench': g.moveTo(-k, k); g.lineTo(k * 0.5, -k * 0.5); g.stroke(); g.beginPath(); g.arc(k * 0.55, -k * 0.55, k * 0.45, 0, Math.PI * 2); g.stroke(); break;
    case 'bank': g.fillRect(-k, k * 0.6, k * 2, k * 0.3); for (let i = -1; i <= 1; i++) g.fillRect(i * k * 0.6 - k * 0.12, -k * 0.3, k * 0.24, k * 0.9); g.moveTo(-k, -k * 0.3); g.lineTo(0, -k); g.lineTo(k, -k * 0.3); g.closePath(); g.fill(); break;
    case 'orchid': for (let i = 0; i < 5; i++) { g.beginPath(); g.ellipse(Math.cos(i * 1.256 - 1.57) * k * 0.5, Math.sin(i * 1.256 - 1.57) * k * 0.5, k * 0.32, k * 0.55, i * 1.256, 0, Math.PI * 2); g.fill(); } break;
    case 'crate': g.strokeRect(-k, -k, k * 2, k * 2); g.moveTo(-k, -k); g.lineTo(k, k); g.stroke(); break;
    case 'spray': g.fillRect(-k * 0.4, -k * 0.3, k * 0.8, k * 1.3); g.fillRect(-k * 0.15, -k * 0.7, k * 0.3, k * 0.4); g.arc(k * 0.6, -k * 0.6, k * 0.2, 0, Math.PI * 2); g.fill(); break;
    case 'gun': g.fillRect(-k, -k * 0.35, k * 1.8, k * 0.45); g.fillRect(-k * 0.2, 0, k * 0.4, k * 0.8); break;
    case 'dex': g.font = `bold ${s * 1.1}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('D', 0, 1); break;
    case 'cup': g.fillRect(-k * 0.7, -k * 0.4, k * 1.2, k * 1.1); g.arc(k * 0.6, k * 0.1, k * 0.3, -1.5, 1.5); g.stroke(); break;
    case 'mission': g.font = `900 ${s * 1.2}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('!', 0, 1); break;
    case 'save': g.fillRect(-k * 0.8, -k * 0.8, k * 1.6, k * 1.6); g.fillStyle = '#0b0d14'; g.fillRect(-k * 0.45, -k * 0.8, k * 0.9, k * 0.6); break;
    case 'target': g.arc(0, 0, k * 0.6, 0, Math.PI * 2); g.fill(); break;
    case 'tag': g.arc(0, 0, k * 0.5, 0, Math.PI * 2); g.fill(); break;
    default: g.arc(0, 0, k * 0.5, 0, Math.PI * 2); g.fill();
  }
  g.restore();
}

export class Minimap {
  constructor(world, mapCanvas) {
    this.world = world;
    this.map = mapCanvas;
    this.zoom = 1.1;
    this.flash = 0;
    this.routeT = 0;
    this.route = null;
  }

  /** Recompute the GPS route to a target every second. */
  updateRoute(dt, target) {
    this.routeT -= dt;
    if (!target) { this.route = null; return; }
    if (this.routeT > 0 && this.route) return;
    this.routeT = 1;
    const w = this.world;
    const roads = w.city.roads;
    const px = w.player.x, pz = w.player.z;
    const a = roads.nearestNode(px, pz), b = roads.nearestNode(target[0], target[1]);
    const path = roads.route(a.id, b.id);
    this.route = [[px, pz], ...path.map((id) => [roads.nodes[id].x, roads.nodes[id].z]), [target[0], target[1]]];
  }

  draw(g, cx, cy, R, blips, dt) {
    const w = this.world;
    const p = w.player;
    this.flash += dt;
    const speed = p.vehicle ? Math.abs(p.vehicle.speed) : 0;
    this.zoom += ((p.vehicle ? 0.75 - Math.min(0.3, speed / 120) : 1.1) - this.zoom) * Math.min(1, dt * 2);
    const h = w.camCtl.yaw;
    g.save();
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.clip();
    g.fillStyle = '#0e2c44';
    g.fillRect(cx - R, cy - R, R * 2, R * 2);
    g.translate(cx, cy);
    g.rotate(h - Math.PI);
    g.scale(this.zoom, this.zoom);
    g.translate(-(p.x - MAP_MIN), -(p.z - MAP_MIN));
    g.imageSmoothingEnabled = true;
    g.drawImage(this.map, 0, 0);
    // Search area.
    if (w.wanted.stars > 0 && !w.wanted.seen) {
      g.fillStyle = 'rgba(80,140,255,0.18)';
      g.strokeStyle = `rgba(120,170,255,${0.5 + 0.4 * Math.sin(this.flash * 6)})`;
      g.lineWidth = 3 / this.zoom;
      g.beginPath();
      g.arc(w.wanted.lastKnown[0] - MAP_MIN, w.wanted.lastKnown[1] - MAP_MIN, w.wanted.searchRadius, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    }
    // GPS route.
    if (this.route) {
      g.strokeStyle = '#ff3fa4';
      g.lineWidth = 5 / this.zoom;
      g.lineJoin = 'round';
      g.beginPath();
      this.route.forEach(([x, z], i) => (i ? g.lineTo(x - MAP_MIN, z - MAP_MIN) : g.moveTo(x - MAP_MIN, z - MAP_MIN)));
      g.stroke();
    }
    g.restore();
    // Blips stay upright: transform positions manually.
    const ch = Math.cos(h - Math.PI), sh = Math.sin(h - Math.PI);
    const toMini = (x, z) => {
      const dx = (x - p.x) * this.zoom, dz = (z - p.z) * this.zoom;
      return [cx + dx * ch - dz * sh, cy + dx * sh + dz * ch];
    };
    for (const b of blips) {
      let [sx, sy] = toMini(b.x, b.z);
      const dd = Math.hypot(sx - cx, sy - cy);
      const edge = dd > R - 8;
      if (edge) {
        if (!b.always) continue;
        sx = cx + ((sx - cx) / dd) * (R - 8);
        sy = cy + ((sy - cy) / dd) * (R - 8);
      }
      if (b.flash && Math.sin(this.flash * 10) < 0) continue;
      if (b.dot) {
        g.fillStyle = b.color;
        g.beginPath();
        g.arc(sx, sy, b.size ?? 4, 0, Math.PI * 2);
        g.fill();
      } else drawIcon(g, b.icon, sx, sy, edge ? 7 : 9, b.color);
    }
    // Player arrow (points along the body/vehicle heading relative to the map rotation).
    const heading = (p.vehicle ? p.vehicle.yaw : p.yaw) - h;
    g.save();
    g.translate(cx, cy);
    g.rotate(-heading);
    g.fillStyle = '#ffffff';
    g.strokeStyle = '#0b0d14';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(0, -10);
    g.lineTo(7, 8);
    g.lineTo(0, 4);
    g.lineTo(-7, 8);
    g.closePath();
    g.fill();
    g.stroke();
    g.restore();
    // Rim: health (left) and armor (right) arcs.
    g.lineWidth = 6;
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.beginPath();
    g.arc(cx, cy, R + 5, 0, Math.PI * 2);
    g.stroke();
    const hp = Math.max(0, p.health / p.maxHealth);
    g.strokeStyle = hp < 0.3 && Math.sin(this.flash * 8) > 0 ? '#ff3a3a' : '#4dff9a';
    g.beginPath();
    g.arc(cx, cy, R + 5, Math.PI * 0.55, Math.PI * 0.55 + Math.PI * 0.9 * hp);
    g.stroke();
    g.strokeStyle = '#4aa0ff';
    g.beginPath();
    g.arc(cx, cy, R + 5, Math.PI * 1.55, Math.PI * 1.55 + Math.PI * 0.9 * Math.max(0, p.armor / 100));
    g.stroke();
    g.strokeStyle = 'rgba(47,243,224,0.7)';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.stroke();
    // North marker.
    const [nx, ny] = toMini(p.x, p.z - 1000);
    const nd = Math.hypot(nx - cx, ny - cy) || 1;
    g.fillStyle = '#ffffff';
    g.font = '900 12px sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText('N', cx + ((nx - cx) / nd) * (R - 10), cy + ((ny - cy) / nd) * (R - 10));
  }

  /** Static blips for landmarks (safehouse, shops, hospital, police HQ...). */
  static landmarkBlips(city) {
    const out = [];
    for (const [key, l] of Object.entries(LANDMARKS)) {
      const a = city.anchors[key];
      const pos = a?.front ?? a?.door ?? a?.respawn;
      if (!pos) continue;
      out.push({ x: pos[0], z: pos[1], icon: l.icon, color: l.color, key, name: l.name });
    }
    return out;
  }
}

export { DISTRICTS };
