// City generation. Builds Selara Bay chunk by chunk (one chunk per grid cell: its junction, the
// road segments east/south of it and the block inside), fills blocks by district, places the
// landmarks, street furniture, traffic signals, parking bays and pedestrian paths, and uploads
// everything as merged chunk meshes plus instanced prop batches and one sign atlas.

import { MeshBuilder, MAT } from '../engine/mesh-builder.js';
import { createMesh, uploadInstances, INSTANCE_FLOATS } from '../engine/gl.js';
import { SignAtlas, SignBuilder, SignRenderer } from '../engine/signs.js';
import { Water } from '../engine/water.js';
import { makeRng, m4compose, hex } from '../core/math.js';
import { PITCH, GRID, ROAD_HALF, CURB, LOT_IN, PARK_LANE, SEA_LEVEL, CITY, districtOfBlock, landmarkAtBlock, LANDMARKS } from './layout.js';
import { buildRoads, buildSidewalks, buildLotGround, buildCoast } from './city-meshes.js';
import { midrise, tower, house, warehouse, hotel, BRANDS, PALETTES } from './buildings.js';
import { LANDMARK_BUILDERS } from './landmarks.js';
import { CollisionWorld } from './collision.js';
import { RoadGraph } from './roads.js';
import { PropSystem } from './props.js';

const HOTEL_NAMES = ['Hotel Pantai Indah', 'Selara Beach Resort', 'Ombak Suites', 'Hotel Kelapa', 'The Coral', 'Senja Bay Hotel', 'Pelangi Inn', 'Hotel Mutiara', 'Laguna Selara', 'Pasir Putih'];

export class City {
  constructor(gl) {
    this.gl = gl;
    this.col = new CollisionWorld();
    this.roads = new RoadGraph();
    this.props = new PropSystem(gl, this.col);
    this.atlas = new SignAtlas(2048);
    this.signBuilder = new SignBuilder();
    this.signs = new SignRenderer(gl);
    this.water = new Water(gl, SEA_LEVEL);
    this.chunks = [];
    this.anchors = {};
    this.parking = [];
    this.lampLights = [];
    this.shopLights = [];
    this.neonLights = [];
    this.signalHeads = [];
    this.pedRings = [];
    this.crossings = [];
    this.bulbMesh = null;
    this.billboards = 0;
  }

  /** Build everything; reports progress 0..1 and yields to keep the loading screen alive. */
  async generate(onProgress = () => {}) {
    const total = (GRID + 1) * (GRID + 1) + 2;
    let done = 0;
    for (let j = 0; j <= GRID; j++) {
      for (let i = 0; i <= GRID; i++) {
        this.buildChunk(i, j);
        done++;
        if (done % 6 === 0) {
          onProgress(done / total, `Building ${districtOfBlock(Math.min(i, GRID - 1), Math.min(j, GRID - 1))}…`);
          await new Promise((r) => setTimeout(r, 0));
        }
      }
    }
    const cb = new MeshBuilder();
    buildCoast(cb, makeRng(99));
    this.coastProps();
    this.addChunk(cb);
    this.buildSignals();
    onProgress(0.97, 'Painting signs…');
    await new Promise((r) => setTimeout(r, 0));
    this.signs.upload(this.atlas, this.signBuilder);
    this.props.finalize();
    for (const l of this.lampLights) void l;
    onProgress(1, 'Ready');
  }

  addChunk(b) {
    if (b.vertexCount === 0) return;
    const data = b.build();
    this.chunks.push({ mesh: createMesh(this.gl, data), bounds: data.bounds });
  }

  /** The shared context passed to building generators. */
  makeCtx(b, rng, lot) {
    const ctx = {
      b, rng, col: this.col, atlas: this.atlas, signs: this.signBuilder, props: this.props,
      shopLights: this.shopLights, neonLights: this.neonLights, treeSpots: [], parkingLot: [], lamps: [],
      lot,
      fill: (x0, z0, x1, z1, _fronts, kind) => this.fill(ctx, x0, z0, x1, z1, kind),
      container: (x, z, yaw, color, stack = 1) => this.container(x, z, yaw, color, stack),
    };
    return ctx;
  }

  buildChunk(i, j) {
    const rng = makeRng(1000 + i * 37 + j * 101);
    const b = new MeshBuilder();
    buildRoads(b, i, j, rng);
    if (i < GRID && j < GRID) {
      buildSidewalks(b, i, j);
      const lot = { x0: i * PITCH + LOT_IN, z0: j * PITCH + LOT_IN, x1: (i + 1) * PITCH - LOT_IN, z1: (j + 1) * PITCH - LOT_IN, i, j };
      const district = districtOfBlock(i, j);
      lot.district = district;
      buildLotGround(b, lot.x0, lot.z0, lot.x1, lot.z1, district);
      const ctx = this.makeCtx(b, rng, lot);
      const lm = landmarkAtBlock(i, j);
      if (lm) {
        this.anchors[lm] = { ...LANDMARK_BUILDERS[lm](ctx, lot), name: LANDMARKS[lm].name };
      } else if (district === 'park') this.park(ctx, lot);
      else if (district === 'docks') this.docks(ctx, lot);
      else if (district === 'beach') this.beachBlock(ctx, lot);
      else this.fill(ctx, lot.x0, lot.z0, lot.x1, lot.z1);
      for (const t of ctx.treeSpots) this.props.add(rng.chance(0.6) ? 'tree' : 'palm', t[0], CURB, t[1], rng.range(0, 6), rng.range(0.8, 1.1));
      for (const l of ctx.lamps) this.addLamp(l[0], l[1], l[2], l[3]);
      for (const p of ctx.parkingLot) this.parking.push({ x: p[0], z: p[1], yaw: p[2], kind: p[3] ?? 'lot' });
      this.streetFurniture(rng, i, j, district);
      this.pedRings.push({ x0: i * PITCH + ROAD_HALF + 2, z0: j * PITCH + ROAD_HALF + 2, x1: (i + 1) * PITCH - ROAD_HALF - 2, z1: (j + 1) * PITCH - ROAD_HALF - 2, i, j });
    }
    this.addChunk(b);
    this.parkingBays(rng, i, j);
  }

  // ------------------------------------------------------------ district fillers
  /** Split a rectangle into parcels and fill them with the block's district style. */
  fill(ctx, x0, z0, x1, z1, kind = null) {
    const L = ctx.lot;
    const w = x1 - x0, d = z1 - z0;
    if (w < 9 || d < 9) return;
    const style = kind ?? L.district;
    const max = { downtown: 42, midtown: 30, residential: 28, docks: 40, beach: 40, house: 28, tower: 40, park: 99 }[style] ?? 30;
    const gap = style === 'residential' || style === 'house' ? 0 : 4;
    const parcels = [];
    const split = (a0, b0, a1, b1, depth) => {
      const pw = a1 - a0, pd = b1 - b0;
      if ((pw <= max && pd <= max) || depth > 5) {
        parcels.push([a0, b0, a1, b1]);
        return;
      }
      if (pw >= pd) {
        const m = a0 + pw * ctx.rng.range(0.42, 0.58);
        split(a0, b0, m - gap / 2, b1, depth + 1);
        split(m + gap / 2, b0, a1, b1, depth + 1);
      } else {
        const m = b0 + pd * ctx.rng.range(0.42, 0.58);
        split(a0, b0, a1, m - gap / 2, depth + 1);
        split(a0, m + gap / 2, a1, b1, depth + 1);
      }
    };
    split(x0, z0, x1, z1, 0);
    for (const [a0, b0, a1, b1] of parcels) {
      const fronts = [];
      if (Math.abs(b0 - L.z0) < 1) fronts.push('n');
      if (Math.abs(b1 - L.z1) < 1) fronts.push('s');
      if (Math.abs(a0 - L.x0) < 1) fronts.push('w');
      if (Math.abs(a1 - L.x1) < 1) fronts.push('e');
      const p = { x0: a0, z0: b0, x1: a1, z1: b1, fronts };
      if (a1 - a0 < 8 || b1 - b0 < 8) continue;
      if (style === 'downtown' || style === 'tower') {
        if (ctx.rng.chance(0.18) && fronts.length) this.plaza(ctx, p);
        else if (a1 - a0 > 24 && b1 - b0 > 24) tower(ctx, p);
        else midrise(ctx, p, { floors: ctx.rng.int(8, 14), palette: PALETTES.downtownPodium });
      } else if (style === 'residential' || style === 'house') {
        if (fronts.length === 0) this.garden(ctx, p);
        else house(ctx, p);
      } else if (style === 'docks') warehouse(ctx, p);
      else midrise(ctx, p);
    }
    // Alleys between parcels get bins and crates.
    if (gap > 0 && parcels.length > 1) {
      for (let k = 0; k < 3; k++) this.props.add(ctx.rng.pick(['bin', 'crate', 'pallet']), ctx.rng.range(x0 + 3, x1 - 3), CURB, ctx.rng.range(z0 + 3, z1 - 3), ctx.rng.range(0, 6));
    }
  }

  plaza(ctx, p) {
    const { b, rng } = ctx;
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
    b.paint(hex('#c7bfae'), MAT.CONCRETE).box(cx, CURB + 0.04, cz, p.x1 - p.x0, 0.08, p.z1 - p.z0);
    b.paint(hex('#a89f8e'), MAT.CONCRETE);
    for (let r = 4; r < Math.min(p.x1 - p.x0, p.z1 - p.z0) / 2; r += 4) b.box(cx, CURB + 0.085, cz, r * 2, 0.01, 0.3).box(cx, CURB + 0.085, cz, 0.3, 0.01, r * 2);
    this.props.add('fountain', cx, CURB, cz);
    for (const [dx, dz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      this.props.add('palm', cx + dx * (p.x1 - p.x0) * 0.32, CURB, cz + dz * (p.z1 - p.z0) * 0.32, rng.range(0, 6), rng.range(0.9, 1.2));
      this.props.add('bench', cx + dx * 7, CURB, cz + dz * 2.5, dz > 0 ? Math.PI : 0);
    }
    // A big neon billboard on a frame over the plaza.
    const brand = BRANDS[this.billboards++ % BRANDS.length];
    const s = this.atlas.text(brand[0], { fg: brand[2], bg: brand[3], border: brand[2], w: 768, h: 288, sub: brand[1], font: '900 120px "Arial Black", Impact, sans-serif' });
    const yaw = p.fronts.includes('n') ? Math.PI : p.fronts.includes('s') ? 0 : p.fronts.includes('e') ? Math.PI / 2 : -Math.PI / 2;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    const bx = cx + fx * ((p.x1 - p.x0) / 2 - 3), bz = cz + fz * ((p.z1 - p.z0) / 2 - 3);
    b.paint(hex('#2a2d33'), MAT.METAL).box(bx - Math.cos(yaw) * 5, CURB + 6, bz + Math.sin(yaw) * 5, 0.5, 12, 0.5).box(bx + Math.cos(yaw) * 5, CURB + 6, bz - Math.sin(yaw) * 5, 0.5, 12, 0.5);
    b.push().transform(bx, CURB + 13, bz, yaw).box(0, 0, -0.3, 13, 5, 0.4).pop();
    this.signBuilder.quad(bx, CURB + 13, bz, yaw, 12.4, 4.65, s, 2.6, 1);
    this.neonLights.push([bx + fx * 3, CURB + 11, bz + fz * 3, hex(brand[2])]);
    this.col.addCircle(cx, cz, 4.2, CURB + 1, { kind: 'fountain' });
  }

  garden(ctx, p) {
    const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
    ctx.b.paint(hex('#22b4d8'), MAT.WATER).box(cx, CURB + 0.2, cz, 8, 0.05, 5);
    ctx.b.paint(hex('#ebe7dc'), MAT.CONCRETE).box(cx, CURB + 0.1, cz, 9.5, 0.18, 6.5);
    for (let k = 0; k < 3; k++) this.props.add('tree', ctx.rng.range(p.x0 + 3, p.x1 - 3), CURB, ctx.rng.range(p.z0 + 3, p.z1 - 3), ctx.rng.range(0, 6));
  }

  park(ctx, L) {
    const { b, rng } = ctx;
    const cx = (L.x0 + L.x1) / 2, cz = (L.z0 + L.z1) / 2;
    b.paint(hex('#c9b994'), MAT.SAND);
    b.box(cx, CURB + 0.03, cz, L.x1 - L.x0, 0.04, 3.5).box(cx, CURB + 0.03, cz, 3.5, 0.04, L.z1 - L.z0);
    // Pond.
    b.paint(hex('#8a7f6a'), MAT.CONCRETE).cylinder(cx + 18, CURB - 0.05, cz + 18, 10.8, 10.8, 0.25, 24);
    b.paint(hex('#2a7f8a'), MAT.WATER).cylinder(cx + 18, CURB + 0.1, cz + 18, 10, 10, 0.1, 24);
    this.col.addCircle(cx + 18, cz + 18, 10, CURB + 0.5, { kind: 'pond', ghost: true });
    for (let k = 0; k < 22; k++) {
      const x = rng.range(L.x0 + 4, L.x1 - 4), z = rng.range(L.z0 + 4, L.z1 - 4);
      if (Math.abs(x - cx) < 4 || Math.abs(z - cz) < 4 || Math.hypot(x - cx - 18, z - cz - 18) < 13) continue;
      this.props.add(rng.chance(0.65) ? 'tree' : 'palm', x, CURB, z, rng.range(0, 6), rng.range(0.85, 1.25));
    }
    for (const [dx, dz, yaw] of [[-12, -3, 0], [12, 3, Math.PI], [-3, -14, Math.PI / 2], [3, 14, -Math.PI / 2]]) this.props.add('bench', cx + dx, CURB, cz + dz, yaw);
    for (const [dx, dz] of [[-6, -6], [6, 6], [-6, 6], [6, -6]]) this.addLamp(cx + dx, CURB, cz + dz, 0);
    // A small kiosk.
    b.paint(hex('#e96fa8'), MAT.PAINT).bevelBox(cx - 20, CURB + 1.4, cz - 20, 4, 2.8, 3, 0.15);
    b.paint(hex('#ffffff'), MAT.CLOTH).box(cx - 20, CURB + 3.0, cz - 18.2, 4.4, 0.1, 1.6);
    this.col.addBox(cx - 22, cz - 21.5, cx - 18, cz - 18.5, CURB + 2.8, { kind: 'building' });
  }

  docks(ctx, L) {
    const { b, rng } = ctx;
    // Painted safety lines across the yard.
    b.paint(hex('#e8b830'), MAT.PLAIN);
    for (let z = L.z0 + 6; z < L.z1; z += 18) b.box((L.x0 + L.x1) / 2, CURB + 0.01, z, L.x1 - L.x0 - 4, 0.02, 0.25);
    const half = rng.chance(0.5);
    if (half) {
      warehouse(ctx, { x0: L.x0, z0: L.z0, x1: L.x1, z1: L.z0 + 38, fronts: ['n'] }, { label: rng.chance(0.4) ? 'PELABUHAN 9' : null });
      this.containerYard(rng, L.x0 + 4, L.z0 + 44, L.x1 - 4, L.z1 - 4);
    } else {
      this.containerYard(rng, L.x0 + 4, L.z0 + 4, L.x1 - 4, L.z1 - 40);
      warehouse(ctx, { x0: L.x0, z0: L.z1 - 36, x1: L.x1, z1: L.z1, fronts: ['s'] });
    }
    if (L.i === 9) this.props.add('crane', L.x1 + 12, CURB, (L.z0 + L.z1) / 2, 0, 1, [1, 1, 1, 0], { solid: false });
    for (let k = 0; k < 2; k++) this.props.add('forklift', rng.range(L.x0 + 8, L.x1 - 8), CURB, rng.range(L.z0 + 8, L.z1 - 8), rng.range(0, 6));
    for (let k = 0; k < 4; k++) this.props.add(rng.pick(['barrel', 'pallet', 'crate']), rng.range(L.x0 + 6, L.x1 - 6), CURB, rng.range(L.z0 + 6, L.z1 - 6), rng.range(0, 6));
  }

  containerYard(rng, x0, z0, x1, z1) {
    const colors = [[0.75, 0.2, 0.18], [0.15, 0.4, 0.75], [0.2, 0.6, 0.35], [0.85, 0.6, 0.15], [0.55, 0.25, 0.65], [0.85, 0.85, 0.85], [0.1, 0.55, 0.6]];
    for (let x = x0 + 4; x < x1 - 4; x += 8) {
      for (let z = z0 + 5; z < z1 - 5; z += 14) {
        if (rng.chance(0.25)) continue;
        this.container(x, z, 0, rng.pick(colors), rng.int(1, 3));
      }
    }
    for (let x = x0 + 6; x < x1; x += 22) this.addLamp(x, CURB, z0 - 1, Math.PI);
  }

  /** A stack of shipping containers with one collision box. */
  container(x, z, yaw, color, stack = 1) {
    for (let s = 0; s < stack; s++) this.props.add('container', x, CURB + s * 2.6, z, yaw + (s % 2) * 0.03, 1, [color[0] * (1 - s * 0.06), color[1], color[2], 0], { solid: false });
    const along = Math.abs(Math.sin(yaw)) > 0.5;
    const hx = along ? 3.03 : 1.22, hz = along ? 1.22 : 3.03;
    this.col.addBox(x - hx, z - hz, x + hx, z + hz, CURB + stack * 2.6, { kind: 'container' });
    this.lampLightsMaybe = true;
  }

  beachBlock(ctx, L) {
    const n = 2;
    const w = (L.x1 - L.x0 - 6) / n;
    for (let k = 0; k < n; k++) {
      const x0 = L.x0 + k * (w + 6);
      hotel(ctx, { x0, z0: L.z0, x1: x0 + w, z1: L.z1, fronts: ['n', 's'] }, HOTEL_NAMES[(L.i * 2 + k) % HOTEL_NAMES.length]);
    }
    const rng = ctx.rng;
    // Resort gardens: a palm grove, sun loungers and a path to the beach.
    ctx.b.paint(hex('#d9cba8'), MAT.SAND).box((L.x0 + L.x1) / 2, CURB + 0.03, L.z1 - 14, 3, 0.04, 28);
    for (let k = 0; k < 12; k++) this.props.add('palm', rng.range(L.x0 + 4, L.x1 - 4), CURB, rng.range(L.z1 - 26, L.z1 - 3), rng.range(0, 6), rng.range(0.9, 1.3));
    for (let k = 0; k < 6; k++) this.props.add('umbrella', rng.range(L.x0 + 6, L.x1 - 6), CURB, rng.range(L.z1 - 24, L.z1 - 6), rng.range(0, 6), 0.9, [rng.pick([1, 0.2, 1]), rng.pick([0.3, 0.7, 0.9]), rng.pick([0.3, 0.9, 0.5]), 0]);
  }

  coastProps() {
    const rng = makeRng(7);
    const zb = CITY + ROAD_HALF + 4;
    for (let x = -10; x < CITY + 20; x += rng.range(9, 16)) {
      this.props.add('palm', x, 0.2, zb + rng.range(8, 14), rng.range(0, 6), rng.range(0.9, 1.35));
      if (rng.chance(0.6)) this.props.add('umbrella', x + rng.range(-4, 4), 0.0, zb + rng.range(18, 30), rng.range(0, 6), 1, [rng.pick([1, 0.2, 1]), rng.pick([0.3, 0.6, 0.9]), rng.pick([0.3, 0.9, 0.5]), 0], { solid: false });
    }
    for (let x = -14; x < CITY + 20; x += 25) this.addLamp(x, 0.4, zb + 1.2, Math.PI);
    // Promenade lamps and railings on the other three coasts.
    for (let t = 0; t <= CITY; t += 30) {
      this.addLamp(-14, CURB, t, -Math.PI / 2);
      this.addLamp(t, CURB, -14, Math.PI);
      if (t < CITY) this.addLamp(CITY + 14, CURB, t, Math.PI / 2);
      this.props.add('rail', -29, CURB, t + 5, 0, 1, [1, 1, 1, 0], { solid: false });
      this.props.add('rail', t + 5, CURB, -29, Math.PI / 2, 1, [1, 1, 1, 0], { solid: false });
    }
    // Invisible walls at the sea edges (the piers stay open).
    this.col.addBox(-34, -40, -30, CITY + 70, 50, { kind: 'seawall' });
    this.col.addBox(-40, -34, CITY + 40, -30, 50, { kind: 'seawall' });
    this.col.addBox(CITY + 30, -40, CITY + 34, 675, 50, { kind: 'seawall' });
    this.col.addBox(CITY + 30, 705, CITY + 34, CITY + 70, 50, { kind: 'seawall' });
    this.col.addBox(-40, CITY + 62, 439, CITY + 66, 50, { kind: 'seawall' });
    this.col.addBox(461, CITY + 62, CITY + 40, CITY + 66, 50, { kind: 'seawall' });
    this.col.addBox(1150, 670, 1154, 710, 50, { kind: 'seawall' });
    this.col.addBox(1030, 672, 1150, 675.5, 50, { kind: 'seawall' });
    this.col.addBox(1030, 704.5, 1150, 708, 50, { kind: 'seawall' });
    this.col.addBox(436, 1062, 440, 1152, 50, { kind: 'seawall' });
    this.col.addBox(460, 1062, 464, 1152, 50, { kind: 'seawall' });
    this.col.addBox(436, 1150, 464, 1154, 50, { kind: 'seawall' });
    // Moored boats along the east pier and the ferry pier.
    for (let x = 1045; x < 1140; x += 14) this.props.add('boat', x, -0.7, 712 + (x % 3), Math.PI / 2 + rng.range(-0.1, 0.1), 1, [1, 1, 1, 0], { solid: false });
    this.props.add('boat', 468, -0.7, 1120, 0.05, 1.3, [1, 1, 1, 0], { solid: false });
    for (let x = 1040; x <= 1140; x += 12) for (const z of [678, 702]) this.props.add('bollard', x, 0.3, z);
  }

  // ------------------------------------------------------------ streets
  addLamp(x, y, z, yaw) {
    this.props.add('lamp', x, y, z, yaw);
    this.lampLights.push([x + Math.sin(yaw) * 1.9, y + 7.1, z + Math.cos(yaw) * 1.9]);
  }

  streetFurniture(rng, i, j, district) {
    const X0 = i * PITCH, Z0 = j * PITCH, X1 = X0 + PITCH, Z1 = Z0 + PITCH;
    const k = ROAD_HALF + 0.9;
    const sides = [
      { a0: X0 + 14, a1: X1 - 14, fixed: Z0 + k, axis: 'x', yaw: Math.PI },
      { a0: X0 + 14, a1: X1 - 14, fixed: Z1 - k, axis: 'x', yaw: 0 },
      { a0: Z0 + 14, a1: Z1 - 14, fixed: X0 + k, axis: 'z', yaw: -Math.PI / 2 },
      { a0: Z0 + 14, a1: Z1 - 14, fixed: X1 - k, axis: 'z', yaw: Math.PI / 2 },
    ];
    const greenery = district === 'downtown' || district === 'beach' ? 'palm' : 'tree';
    for (const s of sides) {
      const at = (u, off = 0) => (s.axis === 'x' ? [u, s.fixed + (s.yaw === Math.PI ? off : -off)] : [s.fixed + (s.yaw === -Math.PI / 2 ? off : -off), u]);
      for (let u = s.a0; u <= s.a1; u += 24) {
        const [x, z] = at(u);
        this.addLamp(x, CURB, z, s.yaw);
      }
      if (district !== 'docks') {
        for (let u = s.a0 + 12; u < s.a1; u += 24) {
          if (rng.chance(0.75)) {
            const [x, z] = at(u, 0.4);
            this.props.add(greenery, x, CURB, z, rng.range(0, 6), rng.range(0.8, 1.05));
          }
        }
      }
      const [bx, bz] = at(rng.range(s.a0 + 4, s.a1 - 4), 2.4);
      if (rng.chance(0.5)) this.props.add('bin', bx, CURB, bz);
      const [hx, hz] = at(rng.range(s.a0 + 4, s.a1 - 4), 0.2);
      if (rng.chance(0.4)) this.props.add('hydrant', hx, CURB, hz);
      if (district === 'docks') {
        for (let u = s.a0; u < s.a1; u += 8) {
          const [x, z] = at(u, 0.1);
          this.props.add('bollard', x, CURB, z);
        }
      }
    }
    if ((i + j) % 3 === 0 && district !== 'docks') {
      const s = sides[(i * 3 + j) % 4];
      const mid = (s.a0 + s.a1) / 2 + 10;
      const [x, z] = s.axis === 'x' ? [mid, s.fixed + (s.yaw === Math.PI ? 1.6 : -1.6)] : [s.fixed + (s.yaw === -Math.PI / 2 ? 1.6 : -1.6), mid];
      this.props.add('busstop', x, CURB, z, s.yaw + Math.PI);
      this.col.addBox(x - 1.9, z - 0.7, x + 1.9, z + 0.7, CURB + 2.6, { kind: 'busstop', ghost: true });
    }
  }

  /** Parking bays along kerbs (cars are placed by the traffic system). */
  parkingBays(rng, i, j) {
    const X = i * PITCH, Z = j * PITCH;
    for (const axis of ['x', 'z']) {
      if (axis === 'x' && i >= GRID) continue;
      if (axis === 'z' && j >= GRID) continue;
      for (const side of [-1, 1]) {
        for (let u = 22; u <= 78; u += 7) {
          if (rng.chance(0.55)) continue;
          if (axis === 'x') this.parking.push({ x: X + u, z: Z + side * PARK_LANE, yaw: side > 0 ? Math.PI / 2 : -Math.PI / 2, kind: 'kerb' });
          else this.parking.push({ x: X + side * PARK_LANE, z: Z + u, yaw: side > 0 ? Math.PI : 0, kind: 'kerb' });
        }
      }
    }
  }

  /** Traffic signal poles for every approach of every junction, and the bulb batch. */
  buildSignals() {
    for (const n of this.roads.nodes) {
      for (const lid of n.links) {
        const m = this.roads.nodes[lid];
        const d = [Math.sign(n.x - m.x), Math.sign(n.z - m.z)];
        const left = [-d[1], d[0]];
        const px = n.x - d[0] * (ROAD_HALF + 1.2) + left[0] * (ROAD_HALF + 0.9);
        const pz = n.z - d[1] * (ROAD_HALF + 1.2) + left[1] * (ROAD_HALF + 0.9);
        const yaw = Math.atan2(-left[0], -left[1]);
        const item = this.props.add('signal', px, CURB, pz, yaw);
        this.signalHeads.push({ node: n, axis: d[0] !== 0 ? 'x' : 'z', x: px - left[0] * 3.0 - d[0] * 0.2, z: pz - left[1] * 3.0 - d[1] * 0.2, yaw: Math.atan2(-d[0], -d[1]), item });
      }
    }
    const bt = this.props.batches.bulb;
    this.bulbMesh = createMesh(this.gl, bt.data, { instanced: true, maxInstances: this.signalHeads.length });
  }

  update(dt, camX, camZ, drawDist) {
    this.roads.update(dt);
    this.props.update(dt, camX, camZ, drawDist);
    // Signal bulbs near the camera.
    const out = this.bulbMesh.idata;
    let n = 0;
    for (const h of this.signalHeads) {
      if (h.item.fallen) continue;
      if (Math.abs(h.x - camX) > 260 || Math.abs(h.z - camZ) > 260) continue;
      const st = this.roads.signal(h.node, h.axis);
      const y = st === 'red' ? 4.95 : st === 'amber' ? 4.6 : 4.25;
      const c = st === 'red' ? [1, 0.08, 0.04] : st === 'amber' ? [1, 0.55, 0.04] : [0.1, 1, 0.45];
      out.set(m4compose(h.x, CURB + y, h.z, h.yaw), n * INSTANCE_FLOATS);
      out.set([c[0], c[1], c[2], 0], n * INSTANCE_FLOATS + 16);
      n++;
    }
    uploadInstances(this.gl, this.bulbMesh, n);
  }

  /** Queue static chunks, props, bulbs and the transparent passes; add night lights. */
  queue(renderer, night) {
    for (const c of this.chunks) renderer.draw(c.mesh);
    this.props.queue(renderer);
    if (this.bulbMesh.icount) renderer.draw(this.bulbMesh, { cull: false, shadow: false });
    renderer.addTransparent(() => this.water.draw(renderer));
    renderer.addTransparent(() => this.signs.draw(renderer));
    if (night > 0.05) {
      const cam = renderer.camera.pos;
      const k = night;
      for (const l of this.lampLights) {
        if (Math.abs(l[0] - cam[0]) > 220 || Math.abs(l[2] - cam[2]) > 220) continue;
        renderer.light(l, 22, [1.7 * k, 1.3 * k, 0.85 * k], [0, -1, 0], 0.3);
      }
      for (const l of this.shopLights) {
        if (Math.abs(l[0] - cam[0]) > 150 || Math.abs(l[2] - cam[2]) > 150) continue;
        renderer.light([l[0], l[1], l[2]], 8, [l[3][0] * 0.7 * k, l[3][1] * 0.7 * k, l[3][2] * 0.7 * k]);
      }
      for (const l of this.neonLights) {
        if (Math.abs(l[0] - cam[0]) > 220 || Math.abs(l[2] - cam[2]) > 220) continue;
        renderer.light([l[0], l[1], l[2]], 16, [l[3][0] * 3 * k, l[3][1] * 3 * k, l[3][2] * 3 * k]);
      }
    }
  }

  /** Ground height at a point: kerbs and lots are raised, roads are at 0, piers at deck height. */
  groundAt(x, z) {
    if (x >= 1030 && x <= 1150 && z >= 676 && z <= 704) return 0.3;
    if (x >= 442 && x <= 458 && z >= 1060 && z <= 1151) return 0.7;
    if (z > CITY + ROAD_HALF + 4) {
      if (z < CITY + ROAD_HALF + 7) return 0.41;
      const t = Math.min(1, (z - (CITY + ROAD_HALF + 4)) / (CITY + 95 - (CITY + ROAD_HALF + 4)));
      return 0.12 - Math.pow(t, 1.4) * 3.4;
    }
    const rx = x - Math.round(x / PITCH) * PITCH;
    const rz = z - Math.round(z / PITCH) * PITCH;
    if (Math.abs(rx) <= ROAD_HALF || Math.abs(rz) <= ROAD_HALF) {
      if (x >= -ROAD_HALF && x <= CITY + ROAD_HALF && z >= -ROAD_HALF && z <= CITY + ROAD_HALF) return 0;
    }
    return CURB;
  }
}
