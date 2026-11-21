// Weapons and combat. Fists (combo), Kobra 9 pistol, Wasp SMG and Thunder shotgun. Shots are hitscan
// rays from the muzzle towards the point under the crosshair, tested against the city, people and
// cars; they leave tracers, muzzle flashes with a light pulse, impact sparks, bullet holes and
// ejected shell casings. Recoil kicks the aim and blooms the crosshair. NPCs fire with imperfect
// accuracy through the same code.

import { MeshBuilder, MAT } from '../engine/mesh-builder.js';
import { createMesh } from '../engine/gl.js';
import { hex, m4mul, m4compose, clamp } from '../core/math.js';

export const WEAPONS = {
  fists: { name: 'Fists', icon: 'fist', melee: true, damage: 14, rate: 0.42, range: 1.7 },
  pistol: { name: 'Kobra 9', icon: 'pistol', damage: 26, rate: 0.26, clip: 12, spread: 0.012, range: 130, recoil: 0.5, pellets: 1, reload: 1.1, sound: 'pistol' },
  smg: { name: 'Wasp', icon: 'smg', damage: 15, rate: 0.085, clip: 30, spread: 0.032, range: 110, recoil: 0.25, pellets: 1, reload: 1.6, auto: true, twoHanded: true, sound: 'smg' },
  shotgun: { name: 'Thunder', icon: 'shotgun', damage: 12, rate: 0.85, clip: 6, spread: 0.07, range: 45, recoil: 1.3, pellets: 8, reload: 2.2, twoHanded: true, sound: 'shotgun' },
};
export const WEAPON_ORDER = ['fists', 'pistol', 'smg', 'shotgun'];

/** Weapon meshes, built along +Z (the barrel), grip at the origin. */
function buildWeaponMesh(gl, key) {
  const b = new MeshBuilder();
  const dark = hex('#1d1e22'), metal = hex('#5a5e66');
  if (key === 'pistol') {
    b.paint(dark, MAT.METAL).bevelBox(0, 0.04, 0.06, 0.035, 0.05, 0.2, 0.012);
    b.paint(metal, MAT.METAL).box(0, 0.075, 0.07, 0.03, 0.02, 0.2);
    b.paint(dark, MAT.PLAIN).push().transform(0, -0.02, -0.01, 0, -0.25, 0).bevelBox(0, -0.03, 0, 0.032, 0.11, 0.045, 0.01).pop();
  } else if (key === 'smg') {
    b.paint(dark, MAT.METAL).bevelBox(0, 0.04, 0.08, 0.045, 0.07, 0.3, 0.015);
    b.paint(metal, MAT.METAL).cylinder(0, 0.04, 0.23, 0.012, 0.012, 0.0001, 6);
    b.push().transform(0, 0.04, 0.23, 0, Math.PI / 2, 0).cylinder(0, 0, 0, 0.014, 0.014, 0.12, 6).pop();
    b.paint(dark, MAT.PLAIN).box(0, -0.05, 0.1, 0.03, 0.14, 0.035).box(0, -0.03, -0.02, 0.03, 0.09, 0.04).box(0, 0.03, -0.13, 0.025, 0.04, 0.12);
  } else if (key === 'shotgun') {
    b.paint(hex('#6a4a2a'), MAT.WOOD).bevelBox(0, 0.0, -0.12, 0.045, 0.08, 0.3, 0.015);
    b.paint(dark, MAT.METAL).bevelBox(0, 0.03, 0.15, 0.05, 0.06, 0.3, 0.012);
    b.paint(metal, MAT.METAL).push().transform(0, 0.05, 0.25, 0, Math.PI / 2, 0).cylinder(0, 0, 0, 0.018, 0.018, 0.4, 8).pop();
    b.paint(hex('#6a4a2a'), MAT.WOOD).push().transform(0, 0.015, 0.3, 0, Math.PI / 2, 0).cylinder(0, 0, 0, 0.025, 0.025, 0.16, 8).pop();
  }
  return createMesh(gl, b.build());
}

export class Combat {
  constructor(world) {
    this.world = world;
    this.meshes = {};
    for (const k of ['pistol', 'smg', 'shotgun']) this.meshes[k] = buildWeaponMesh(world.gl, k);
    this.casings = [];
    this.casingMesh = (() => {
      const b = new MeshBuilder();
      b.paint(hex('#d8a83a'), MAT.METAL).cylinder(0, -0.01, 0, 0.006, 0.006, 0.02, 5);
      return createMesh(world.gl, b.build());
    })();
    this.bloom = 0; // crosshair spread
    this.hitMarker = 0;
  }

  // ------------------------------------------------------------ ray casting
  /**
   * Cast a bullet ray. Returns the closest of: city geometry, a ped, a vehicle.
   * { t, x,y,z, nx,ny,nz, ped?, vehicle?, head? }
   */
  cast(ox, oy, oz, dx, dy, dz, range, shooter) {
    const w = this.world;
    let best = { t: range, x: ox + dx * range, y: oy + dy * range, z: oz + dz * range, nx: -dx, ny: -dy, nz: -dz };
    const hit = w.city.col.raycast(ox, oy, oz, dx, dy, dz, range, (it) => !(it.type === 'circle' && it.r < 0.25));
    if (hit) best = { t: hit.t, x: ox + dx * hit.t, y: oy + dy * hit.t, z: oz + dz * hit.t, nx: hit.nx, ny: hit.ny, nz: hit.nz, item: hit.item };
    // Ground plane.
    if (dy < -1e-4) {
      const tg = (w.city.groundAt(ox, oz) - oy) / dy;
      if (tg > 0 && tg < best.t) best = { t: tg, x: ox + dx * tg, y: oy + dy * tg, z: oz + dz * tg, nx: 0, ny: 1, nz: 0, ground: true };
    }
    // People: vertical capsules.
    const targets = [...w.peds.list];
    if (shooter !== w.player && w.player.alive) targets.push(w.player);
    for (const p of targets) {
      if (p === shooter || p.dead || p.hidden) continue;
      if (p === w.player && w.player.vehicle) continue;
      const fx = ox - p.x, fz = oz - p.z;
      const a = dx * dx + dz * dz;
      const bq = 2 * (fx * dx + fz * dz);
      const r = 0.36;
      const c = fx * fx + fz * fz - r * r;
      const disc = bq * bq - 4 * a * c;
      if (disc < 0 || a < 1e-8) continue;
      const t = (-bq - Math.sqrt(disc)) / (2 * a);
      if (t < 0 || t >= best.t) continue;
      const y = oy + dy * t;
      const lying = p.dead > 0.5 || p.down > 0.5;
      const top = lying ? p.y + 0.45 : p.y + 1.85;
      if (y < p.y || y > top) continue;
      best = { t, x: ox + dx * t, y, z: oz + dz * t, nx: -dx, ny: 0, nz: -dz, ped: p, head: !lying && y > p.y + 1.55 };
    }
    // Vehicles: two vertical cylinders per car.
    for (const v of w.vehicles.list) {
      if (Math.abs(v.x - ox) > range + 5 && Math.abs(v.z - oz) > range + 5) continue;
      if (shooter === w.player && v === w.player.vehicle) continue;
      if (shooter?.vehicleRef === v) continue;
      for (const [cx, cz] of v.circles()) {
        const fx = ox - cx, fz = oz - cz;
        const a = dx * dx + dz * dz;
        const bq = 2 * (fx * dx + fz * dz);
        const c = fx * fx + fz * fz - v.radius * v.radius;
        const disc = bq * bq - 4 * a * c;
        if (disc < 0 || a < 1e-8) continue;
        const t = (-bq - Math.sqrt(disc)) / (2 * a);
        if (t < 0 || t >= best.t) continue;
        const y = oy + dy * t;
        if (y < v.y || y > v.y + (v.def.roof ?? 1.5) + 0.1) continue;
        const hx = ox + dx * t - cx, hz = oz + dz * t - cz;
        const hl = Math.hypot(hx, hz) || 1;
        best = { t, x: ox + dx * t, y, z: oz + dz * t, nx: hx / hl, ny: 0, nz: hz / hl, vehicle: v };
      }
    }
    return best;
  }

  /** Apply a bullet hit: damage, effects. */
  impact(h, damage, shooter) {
    const w = this.world;
    const fx = w.fx;
    if (h.ped) {
      const dmg = damage * (h.head ? 2.2 : 1);
      const killed = h.ped.damage(dmg, shooter?.x, shooter?.z, shooter === w.player ? 'player' : 'npc');
      fx.particles.dust(h.x, h.y, h.z, [0.45, 0.42, 0.45]);
      if (shooter === w.player) {
        this.hitMarker = killed ? 2 : 1;
        if (h.ped.kind === 'cop' && !killed) w.wanted.crime(1.5);
      }
      return;
    }
    if (h === w.player || h.isPlayer) return;
    if (h.vehicle) {
      h.vehicle.damage(damage * 0.9, shooter === w.player ? 'player' : 'npc');
      fx.particles.sparks(h.x, h.y, h.z, h.nx, h.ny, h.nz, 6);
      fx.decals.bulletHole([h.x, h.y, h.z], [h.nx, h.ny, h.nz]);
      if (shooter === w.player) {
        this.hitMarker = Math.max(this.hitMarker, 0.6);
        if (h.vehicle.police) w.wanted.crime(1);
      }
      return;
    }
    if (h.t < 0) return;
    if (h.item?.data?.breakable && shooter === w.player) w.city.props.knockOver(h.item.data.prop, -h.nx, -h.nz);
    fx.particles.sparks(h.x, h.y, h.z, h.nx, h.ny, h.nz, h.ground ? 3 : 5);
    if (h.ground) fx.particles.dust(h.x, h.y, h.z);
    fx.decals.bulletHole([h.x, h.y, h.z], [h.nx, h.ny, h.nz]);
  }

  /** Muzzle world position for a character holding a weapon. */
  muzzleOf(ch) {
    const m = m4mul(ch.model, ch.anim.handMatrix());
    const len = ch.weapon === 'shotgun' ? 0.48 : ch.weapon === 'smg' ? 0.32 : 0.18;
    return [m[0] * 0 + m[4] * 0.05 + m[8] * len + m[12], m[1] * 0 + m[5] * 0.05 + m[9] * len + m[13], m[2] * 0 + m[6] * 0.05 + m[10] * len + m[14]];
  }

  /** Fire a weapon from `shooter` along (dx,dy,dz) (already normalised); returns hits. */
  fire(shooter, key, ox, oy, oz, dx, dy, dz, spreadMul = 1) {
    const w = this.world;
    const wpn = WEAPONS[key];
    const hits = [];
    for (let k = 0; k < wpn.pellets; k++) {
      const s = wpn.spread * spreadMul;
      let ex = dx + (Math.random() - 0.5) * 2 * s, ey = dy + (Math.random() - 0.5) * 2 * s, ez = dz + (Math.random() - 0.5) * 2 * s;
      const l = Math.hypot(ex, ey, ez);
      ex /= l; ey /= l; ez /= l;
      const h = this.cast(ox, oy, oz, ex, ey, ez, wpn.range, shooter);
      if (h.ped === w.player || (h.ped && h.ped.isPlayer)) {
        w.player.damage(wpn.damage * (shooter.kind === 'cop' ? 0.45 : 0.5), shooter.x, shooter.z);
      } else this.impact(h, wpn.damage, shooter);
      if (k < 3) w.fx.particles.tracer(ox, oy, oz, h.x, h.y, h.z);
      hits.push(h);
    }
    w.fx.particles.muzzle(ox, oy, oz, dx, dy, dz);
    w.fx.lights.add(ox + dx * 0.3, oy, oz + dz * 0.3, [6, 4, 1.6], 9, 0.07);
    // Shell casing.
    const r = [-dz, 0, dx];
    this.casings.push({ x: ox - dx * 0.2, y: oy, z: oz - dz * 0.2, vx: r[0] * 2.2 + (Math.random() - 0.5), vy: 2.2, vz: r[2] * 2.2 + (Math.random() - 0.5), t: 0, rot: 0 });
    if (this.casings.length > 60) this.casings.shift();
    w.emit('shot', { x: ox, z: oz, weapon: key, shooter });
    // Gunfire near people frightens them; the player's shots count as a crime.
    w.peds.panic(ox, oz, 28);
    if (shooter === w.player) {
      const near = w.peds.list.some((p) => p.kind === 'civ' && !p.dead && Math.hypot(p.x - ox, p.z - oz) < 30);
      if (near) w.wanted.crime(0.35);
      w.stats.shots++;
    }
    return hits;
  }

  /** NPC shoots at a target character with an accuracy 0..1. */
  npcFire(ch, key, target, accuracy) {
    if (!ch.weapon) ch.weapon = key;
    ch.anim.pose({ t: ch.t, aim: 1, speed: 0 });
    const mz = this.muzzleOf(ch);
    const ty = target.y + (target.vehicle ? 1.0 : 1.2);
    let dx = target.x - mz[0], dy = ty - mz[1], dz = target.z - mz[2];
    const d = Math.hypot(dx, dy, dz);
    dx /= d; dy /= d; dz /= d;
    // Imperfect aim: error grows with distance and target speed.
    const tSpeed = target.vehicle ? Math.abs(target.vehicle.speed) : target.speed ?? 0;
    const err = (1 - accuracy) * 0.09 + d * 0.0012 + tSpeed * 0.004;
    dx += (Math.random() - 0.5) * 2 * err;
    dy += (Math.random() - 0.5) * 2 * err;
    dz += (Math.random() - 0.5) * 2 * err;
    const l = Math.hypot(dx, dy, dz);
    // If the target is in a car the car takes the hits.
    const hits = this.fire(ch, key, mz[0], mz[1], mz[2], dx / l, dy / l, dz / l, 1.6);
    if (target === this.world.player && target.vehicle) {
      const pv = target.vehicle;
      for (const h of hits) if (h.vehicle === pv) { pv.damage(WEAPONS[key].damage * 0.5); if (Math.random() < 0.25) target.damage(WEAPONS[key].damage * 0.25, ch.x, ch.z); }
    }
    ch.recoilT = 0.15;
  }

  /** Melee: damage the first person in a short cone in front of the attacker. */
  melee(attacker, dmg = WEAPONS.fists.damage) {
    const w = this.world;
    const f = [Math.sin(attacker.yaw), Math.cos(attacker.yaw)];
    let best = null, bd = WEAPONS.fists.range;
    const cands = [...w.peds.list];
    if (attacker !== w.player && !w.player.vehicle) cands.push(w.player);
    for (const p of cands) {
      if (p === attacker || p.dead || p.hidden) continue;
      const dx = p.x - attacker.x, dz = p.z - attacker.z;
      const d = Math.hypot(dx, dz);
      if (d > bd || (dx * f[0] + dz * f[1]) / (d || 1) < 0.5) continue;
      best = p;
      bd = d;
    }
    if (!best) return false;
    if (best === w.player) w.player.damage(dmg * 0.7, attacker.x, attacker.z);
    else {
      best.damage(dmg, attacker.x, attacker.z, attacker === w.player ? 'player' : 'npc');
      if (attacker === w.player) {
        this.hitMarker = best.dead ? 2 : 1;
        if (best.kind === 'cop') w.wanted.crime(1.2);
        else if (best.kind === 'civ') w.wanted.crime(0.25, true);
      }
    }
    w.emit('punch', { x: best.x, z: best.z });
    return true;
  }

  update(dt) {
    this.bloom = Math.max(0, this.bloom - dt * 2.5);
    this.hitMarker = Math.max(0, this.hitMarker - dt * 3);
    for (const c of this.casings) {
      if (c.t > 6) continue;
      c.t += dt;
      if (c.y > 0.02 + this.world.city.groundAt(c.x, c.z)) {
        c.vy -= 12 * dt;
        c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
        c.rot += dt * 18;
      } else {
        c.vy = Math.abs(c.vy) > 1 ? -c.vy * 0.3 : 0;
        c.vx *= 0.5; c.vz *= 0.5;
        if (c.vy > 0) c.y += c.vy * dt;
      }
    }
  }

  /** Draw held weapons and casings. */
  queueWeapon(renderer, ch) {
    if (!ch.weapon || ch.weapon === 'fists' || ch.dead > 0.6 || ch.vehicle || (this.world.cinematic && ch === this.world.player)) return;
    const m = m4mul(ch.model, ch.anim.handMatrix());
    renderer.draw(this.meshes[ch.weapon], { model: m, cull: false, shadow: false });
  }

  queue(renderer) {
    for (const c of this.casings) {
      if (c.t > 6) continue;
      renderer.draw(this.casingMesh, { model: m4compose(c.x, c.y, c.z, 0, c.rot, c.rot * 0.7), cull: false, shadow: false });
    }
  }
}

export { clamp };
