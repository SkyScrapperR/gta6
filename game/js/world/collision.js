// Collision world on the ground plane: axis-aligned boxes with a top height (buildings, walls,
// containers) and circles (lamp posts, trees, hydrants — some breakable), in a uniform spatial grid.
// Supports circle push-out for walkers and cars, 3D ray casts for bullets, camera and line of sight.

const CELL = 25;

export class CollisionWorld {
  constructor() {
    this.cells = new Map();
    this.boxes = [];
    this.circles = [];
    this.stamp = 0;
  }

  key(cx, cz) {
    return cx * 4096 + cz;
  }

  cellsFor(x0, z0, x1, z1, fn) {
    const a = Math.floor(x0 / CELL), b = Math.floor(x1 / CELL);
    const c = Math.floor(z0 / CELL), d = Math.floor(z1 / CELL);
    for (let i = a; i <= b; i++) for (let j = c; j <= d; j++) fn(this.key(i + 2048, j + 2048));
  }

  insert(item, x0, z0, x1, z1) {
    this.cellsFor(x0, z0, x1, z1, (k) => {
      let list = this.cells.get(k);
      if (!list) this.cells.set(k, (list = []));
      list.push(item);
    });
  }

  /** Solid box from (x0,z0) to (x1,z1), from y0 up to `top`. */
  addBox(x0, z0, x1, z1, top, data = {}) {
    const b = { type: 'box', x0: Math.min(x0, x1), z0: Math.min(z0, z1), x1: Math.max(x0, x1), z1: Math.max(z0, z1), y0: data.y0 ?? -5, top, data, mark: 0, alive: true };
    this.boxes.push(b);
    this.insert(b, b.x0, b.z0, b.x1, b.z1);
    return b;
  }

  addCircle(x, z, r, top, data = {}) {
    const c = { type: 'circle', x, z, r, top, y0: data.y0 ?? -5, data, mark: 0, alive: true };
    this.circles.push(c);
    this.insert(c, x - r, z - r, x + r, z + r);
    return c;
  }

  /** Visit every live item whose cells touch the rectangle (each item once). */
  query(x0, z0, x1, z1, fn) {
    const s = ++this.stamp;
    this.cellsFor(x0, z0, x1, z1, (k) => {
      const list = this.cells.get(k);
      if (!list) return;
      for (const it of list) {
        if (it.mark === s || !it.alive) continue;
        it.mark = s;
        fn(it);
      }
    });
  }

  /**
   * Push a circle at (x,z) with radius r out of every solid whose vertical span covers [y, y+height].
   * Returns { x, z, hit, nx, nz, item } with the strongest contact's normal.
   */
  resolveCircle(x, z, r, y = 0, height = 1.8, ignore = null) {
    let hit = false, nx = 0, nz = 0, best = 0, item = null;
    for (let iter = 0; iter < 2; iter++) {
      this.query(x - r, z - r, x + r, z + r, (it) => {
        if (it === ignore || it.data.ghost) return;
        if (it.top < y + 0.35 || it.y0 > y + height) return;
        if (it.type === 'box') {
          const cx = Math.max(it.x0, Math.min(x, it.x1));
          const cz = Math.max(it.z0, Math.min(z, it.z1));
          let dx = x - cx, dz = z - cz;
          let d = Math.hypot(dx, dz);
          if (d >= r) return;
          if (d < 1e-5) {
            // Centre inside the box: push out along the shallowest axis.
            const pen = [x - it.x0, it.x1 - x, z - it.z0, it.z1 - z];
            const m = Math.min(...pen);
            if (m === pen[0]) { dx = -1; dz = 0; d = 0; x = it.x0 - r; }
            else if (m === pen[1]) { dx = 1; dz = 0; d = 0; x = it.x1 + r; }
            else if (m === pen[2]) { dx = 0; dz = -1; d = 0; z = it.z0 - r; }
            else { dx = 0; dz = 1; d = 0; z = it.z1 + r; }
            hit = true; nx = dx; nz = dz; best = r; item = it;
            return;
          }
          const push = r - d;
          x += (dx / d) * push;
          z += (dz / d) * push;
          if (push > best) { best = push; nx = dx / d; nz = dz / d; item = it; }
          hit = true;
        } else {
          const dx = x - it.x, dz = z - it.z;
          const d = Math.hypot(dx, dz);
          const min = r + it.r;
          if (d >= min || d < 1e-6) return;
          const push = min - d;
          x += (dx / d) * push;
          z += (dz / d) * push;
          if (push > best) { best = push; nx = dx / d; nz = dz / d; item = it; }
          hit = true;
        }
      });
    }
    return { x, z, hit, nx, nz, item };
  }

  /**
   * Ray from (ox,oy,oz) along unit dir (dx,dy,dz) up to maxT. Returns { t, item, nx, ny, nz } or null.
   * Slab test against each box's 3D extent and a vertical cylinder test against circles.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxT, filter = null) {
    const ex = ox + dx * maxT, ez = oz + dz * maxT;
    let bestT = maxT, best = null, bn = null;
    this.query(Math.min(ox, ex) - 1, Math.min(oz, ez) - 1, Math.max(ox, ex) + 1, Math.max(oz, ez) + 1, (it) => {
      if (it.data.ghost || (filter && !filter(it))) return;
      if (it.type === 'box') {
        let t0 = 0, t1 = bestT, n = null;
        const slabs = [[ox, dx, it.x0, it.x1, [-1, 0, 0]], [oy, dy, it.y0, it.top, [0, -1, 0]], [oz, dz, it.z0, it.z1, [0, 0, -1]]];
        for (const [o, d, lo, hi, axisN] of slabs) {
          if (Math.abs(d) < 1e-9) {
            if (o < lo || o > hi) return;
            continue;
          }
          let ta = (lo - o) / d, tb = (hi - o) / d;
          let sign = -1;
          if (ta > tb) { const tmp = ta; ta = tb; tb = tmp; sign = 1; }
          if (ta > t0) { t0 = ta; n = axisN.map((v) => v * sign * -1 * -1 * (d > 0 ? 1 : -1)); }
          if (tb < t1) t1 = tb;
          if (t0 > t1) return;
        }
        if (t0 < bestT && t0 >= 0) {
          bestT = t0; best = it; bn = n ?? [0, 1, 0];
        }
      } else {
        const fx = ox - it.x, fz = oz - it.z;
        const a = dx * dx + dz * dz;
        if (a < 1e-9) return;
        const b = 2 * (fx * dx + fz * dz);
        const c = fx * fx + fz * fz - it.r * it.r;
        const disc = b * b - 4 * a * c;
        if (disc < 0) return;
        const t = (-b - Math.sqrt(disc)) / (2 * a);
        if (t < 0 || t >= bestT) return;
        const y = oy + dy * t;
        if (y < it.y0 || y > it.top) return;
        bestT = t; best = it;
        const hx = ox + dx * t - it.x, hz = oz + dz * t - it.z;
        const l = Math.hypot(hx, hz) || 1;
        bn = [hx / l, 0, hz / l];
      }
    });
    if (!best) return null;
    // Normals from the slab test point against the ray; make sure they face the ray origin.
    if (bn && bn[0] * dx + bn[1] * dy + bn[2] * dz > 0) bn = bn.map((v) => -v);
    return { t: bestT, item: best, nx: bn[0], ny: bn[1], nz: bn[2] };
  }

  /** True when nothing solid lies between two 3D points. */
  lineClear(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return true;
    return !this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len, (it) => it.type === 'box' || it.r > 0.5);
  }

  removeItem(it) {
    it.alive = false;
  }
}
