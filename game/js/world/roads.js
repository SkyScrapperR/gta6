// Road graph: intersections on the 100 m grid, two-way edges, left-hand lanes, turn curves through
// junctions, traffic-light phases, A* routing for traffic, police and the GPS line.

import { PITCH, GRID, LANE, ROAD_HALF } from './layout.js';

export const STOP_BACK = ROAD_HALF + 3; // where a lane ends before a junction centre

export class RoadGraph {
  constructor() {
    this.nodes = [];
    this.index = new Map();
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        const n = { id: this.nodes.length, i, j, x: i * PITCH, z: j * PITCH, links: [], phaseOffset: ((i * 7 + j * 3) % 4) * 4.5 };
        this.index.set(`${i},${j}`, n);
        this.nodes.push(n);
      }
    }
    for (const n of this.nodes) {
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const m = this.index.get(`${n.i + di},${n.j + dj}`);
        if (m) n.links.push(m.id);
      }
    }
    this.time = 0;
    this.cycle = 26; // seconds: 11 green + 2 amber per axis
  }

  node(i, j) {
    return this.index.get(`${i},${j}`);
  }

  nearestNode(x, z) {
    const i = Math.max(0, Math.min(GRID, Math.round(x / PITCH)));
    const j = Math.max(0, Math.min(GRID, Math.round(z / PITCH)));
    return this.node(i, j);
  }

  /** The node at the end of the road segment a point is on, given a travel direction. */
  nodeAhead(x, z, hx, hz) {
    const n = this.nearestNode(x, z);
    const dx = n.x - x, dz = n.z - z;
    if (dx * hx + dz * hz > 0) return n;
    // Behind us: step one node along the heading's dominant axis.
    const ai = Math.abs(hx) > Math.abs(hz) ? Math.sign(hx) : 0;
    const aj = ai === 0 ? Math.sign(hz) : 0;
    return this.node(n.i + ai, n.j + aj) ?? n;
  }

  /** Lane endpoints for travelling a -> b (traffic keeps left). */
  laneOf(a, b) {
    const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
    const lx = dz, lz = -dx; // left of travel (x east, z south: heading south, east is on the left)
    return {
      dir: [dx, dz],
      start: [a.x + dx * STOP_BACK + lx * LANE, a.z + dz * STOP_BACK + lz * LANE],
      end: [b.x - dx * STOP_BACK + lx * LANE, b.z - dz * STOP_BACK + lz * LANE],
    };
  }

  /** Quadratic curve through junction `via` from lane (a->via) into lane (via->c). */
  turnCurve(a, via, c) {
    const inL = this.laneOf(a, via);
    const outL = this.laneOf(via, c);
    const p0 = inL.end, p2 = outL.start;
    let ctrl;
    if (inL.dir[0] === outL.dir[0] && inL.dir[1] === outL.dir[1]) ctrl = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2];
    else if (inL.dir[0] === -outL.dir[0] && inL.dir[1] === -outL.dir[1]) ctrl = [via.x, via.z];
    else ctrl = inL.dir[0] !== 0 ? [p2[0], p0[1]] : [p0[0], p2[1]];
    return { p0, p1: ctrl, p2 };
  }

  /** Traffic light state for entering junction `n` travelling along axis ('x' or 'z'): 'green'|'amber'|'red'. */
  signal(n, axis) {
    const t = (this.time + n.phaseOffset) % this.cycle;
    const half = this.cycle / 2;
    const own = axis === 'x' ? t : (t + half) % this.cycle;
    if (own < half - 2) return 'green';
    if (own < half) return 'amber';
    return 'red';
  }

  update(dt) {
    this.time += dt;
  }

  /** A* over intersections; returns a list of node ids from start to goal. */
  route(startId, goalId) {
    if (startId === goalId) return [startId];
    const goal = this.nodes[goalId];
    const open = new Map([[startId, 0]]);
    const g = new Map([[startId, 0]]);
    const came = new Map();
    const h = (n) => Math.abs(n.x - goal.x) + Math.abs(n.z - goal.z);
    while (open.size) {
      let cur = -1, bestF = Infinity;
      for (const [id, f] of open) if (f < bestF) { bestF = f; cur = id; }
      if (cur === goalId) {
        const path = [cur];
        while (came.has(path[0])) path.unshift(came.get(path[0]));
        return path;
      }
      open.delete(cur);
      const cn = this.nodes[cur];
      for (const nb of cn.links) {
        const tg = g.get(cur) + PITCH;
        if (tg < (g.get(nb) ?? Infinity)) {
          came.set(nb, cur);
          g.set(nb, tg);
          open.set(nb, tg + h(this.nodes[nb]));
        }
      }
    }
    return [startId];
  }

  /** Polyline of world points along lanes for a node route (used by the GPS line). */
  routePolyline(path, fromX, fromZ) {
    const pts = [[fromX, fromZ]];
    for (const id of path) pts.push([this.nodes[id].x, this.nodes[id].z]);
    return pts;
  }
}

export function bezier(c, t) {
  const u = 1 - t;
  return [u * u * c.p0[0] + 2 * u * t * c.p1[0] + t * t * c.p2[0], u * u * c.p0[1] + 2 * u * t * c.p1[1] + t * t * c.p2[1]];
}
