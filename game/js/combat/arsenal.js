// The player's arsenal and trigger handling: owned weapons, clip and reserve ammo, switching with
// Q/E or the wheel, reloading with R, firing at the crosshair (on foot) or out of the window
// (drive-by), recoil and crosshair bloom, and the punch combo.

import { WEAPONS, WEAPON_ORDER } from './weapons.js';

export class Arsenal {
  constructor(world) {
    this.world = world;
    this.owned = { fists: { clip: 0, ammo: 0 } };
    this.current = 'fists';
    this.cooldown = 0;
    this.reloading = 0;
    this.combo = 0;
  }

  give(key, ammo = null) {
    const w = WEAPONS[key];
    if (!w) return;
    if (!this.owned[key]) {
      this.owned[key] = { clip: w.clip, ammo: ammo ?? w.clip * 3 };
      this.current = key;
    } else this.owned[key].ammo += ammo ?? w.clip * 2;
    this.world.emit('weaponGet', { key });
  }

  /** Lose all ammo (arrest). Weapons are kept but empty. */
  strip() {
    for (const [k, o] of Object.entries(this.owned)) if (k !== 'fists') { o.clip = 0; o.ammo = 0; }
    this.current = 'fists';
  }

  get weapon() {
    return WEAPONS[this.current];
  }

  get state() {
    return this.owned[this.current];
  }

  cycle(dir) {
    const keys = WEAPON_ORDER.filter((k) => this.owned[k]);
    let i = keys.indexOf(this.current);
    i = (i + dir + keys.length) % keys.length;
    this.current = keys[i];
    this.reloading = 0;
    this.world.emit('weaponSwitch', { key: this.current });
  }

  reload() {
    const s = this.state, w = this.weapon;
    if (w.melee || this.reloading > 0 || s.clip >= w.clip || s.ammo <= 0) return;
    this.reloading = w.reload;
    this.world.emit('reload', { key: this.current });
  }

  update(dt, input, controlsOn) {
    const w = this.world;
    const p = w.player;
    this.cooldown -= dt;
    if (this.reloading > 0) {
      this.reloading -= dt;
      if (this.reloading <= 0) {
        const s = this.state, wp = this.weapon;
        const n = Math.min(wp.clip - s.clip, s.ammo);
        s.clip += n;
        s.ammo -= n;
      }
    }
    p.weapon = this.current;
    p.twoHanded = !!this.weapon.twoHanded;
    if (!controlsOn || !p.alive) return;
    if (input.pressed('KeyQ') || input.wheel < 0) this.cycle(-1);
    if (input.pressed('KeyE') || input.wheel > 0) this.cycle(1);
    if (input.pressed('KeyR') && !p.vehicle) this.reload();
    const wp = this.weapon;
    const trigger = wp.auto ? input.leftDown : input.leftClicked();
    if (!trigger || this.cooldown > 0 || this.reloading > 0) return;
    if (wp.melee) {
      if (p.vehicle) return;
      this.cooldown = wp.rate;
      p.punch = 0.001;
      p.punchSide = this.combo++ % 2;
      w.combat.melee(p, wp.damage * (this.combo % 3 === 0 ? 1.6 : 1));
      return;
    }
    const s = this.state;
    if (s.clip <= 0) {
      this.reload();
      return;
    }
    if (p.vehicle && this.current === 'shotgun') return;
    this.cooldown = wp.rate;
    s.clip--;
    // Aim at what is under the crosshair.
    const cam = w.camera;
    const f = cam.forward;
    const probe = w.combat.cast(cam.pos[0], cam.pos[1], cam.pos[2], f[0], f[1], f[2], 160, p);
    let ox, oy, oz;
    if (p.vehicle) {
      const v = p.vehicle;
      ox = v.x + v.right[0] * 0.9;
      oy = v.y + 1.25;
      oz = v.z + v.right[1] * 0.9;
    } else {
      [ox, oy, oz] = w.combat.muzzleOf(p);
    }
    let dx = probe.x - ox, dy = probe.y - oy, dz = probe.z - oz;
    const l = Math.hypot(dx, dy, dz) || 1;
    dx /= l; dy /= l; dz /= l;
    const spread = (p.aim > 0.5 ? 1 : 2.2) * (1 + w.combat.bloom * 2) * (p.vehicle ? 1.6 : 1);
    w.combat.fire(p, this.current, ox, oy, oz, dx, dy, dz, spread);
    w.combat.bloom = Math.min(1.2, w.combat.bloom + wp.recoil * 0.4);
    p.recoil = wp.recoil;
    w.camCtl.pitch += wp.recoil * 0.012;
    w.camera.addShake(wp.recoil * 0.06);
    if (s.clip === 0 && s.ammo > 0) this.reload();
  }
}

export { WEAPON_ORDER };
