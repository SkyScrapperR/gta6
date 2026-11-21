// Side content: twelve glowing Orchid tags hidden around the city (cash for each, all twelve pays a
// bonus), Kilat Respray (drive in: new paint and the wanted level gone for $100 — mission cars
// included) and Bang Bang Arms (walk up to the counter: weapons, ammo and armor).

import { WEAPONS } from '../combat/weapons.js';

const TAG_SPOTS = [
  [112, 268], [288, 132], [455, 512], [612, 188], [742, 455], [905, 312], [188, 712], [338, 888], [575, 785], [818, 905], [960, 560], [25, 960],
];

export class OrchidTags {
  constructor(world) {
    this.w = world;
    this.collected = new Set();
    this.items = [];
    this.spawn();
  }

  spawn() {
    for (const p of this.items) p.active = false;
    this.items = TAG_SPOTS.map(([x, z], i) => {
      if (this.collected.has(i)) return null;
      return this.w.pickups.spawn('tag', x, z, 250, { id: i, onTake: () => this.take(i) });
    }).filter(Boolean);
  }

  take(i) {
    this.collected.add(i);
    this.w.addMoney(250);
    this.w.stats.tags = this.collected.size;
    this.w.emit('tag');
    const n = this.collected.size;
    this.w.notes.push({ slot: 'toast', text: `Orchid tag ${n}/12`, sub: n === 12 ? 'All tags found! +$5,000' : '+$250', color: '#c070ff', duration: 3 });
    if (n === 12) this.w.addMoney(5000);
  }

  reset() {
    this.collected.clear();
    this.spawn();
  }

  restore(list) {
    this.collected = new Set(list);
    this.spawn();
  }

  update() {}
}

export class Shops {
  constructor(world) {
    this.w = world;
    this.cool = 0;
  }

  update(dt) {
    const w = this.w;
    const a = w.city.anchors;
    const p = w.player;
    this.cool -= dt;
    // Kilat Respray: drive into the bay.
    const bay = a.respray.bay;
    const v = p.vehicle;
    if (v && Math.hypot(v.x - bay[0], v.z - bay[1]) < 6.5 && Math.abs(v.speed) < 3 && this.cool <= 0) {
      this.cool = 6;
      if (w.money < 100) {
        w.notes.push({ slot: 'help', text: 'Kilat Respray: $100 for a new coat and a clean record. You are short.', duration: 4, key: 'help' });
      } else if (w.wanted.stars === 0 && v.health >= v.maxHealth * 0.95) {
        w.notes.push({ slot: 'help', text: 'Kilat Respray: nothing to fix, nothing to hide. Come back with heat.', duration: 4, key: 'help' });
      } else {
        w.addMoney(-100);
        w.wanted.clear();
        v.health = v.maxHealth;
        v.burning = 0;
        const palette = [[0.85, 0.15, 0.2], [0.1, 0.35, 0.8], [0.12, 0.12, 0.14], [0.95, 0.95, 0.95], [0.2, 0.6, 0.3], [0.7, 0.3, 0.8]];
        const old = v.paint;
        let c;
        do c = palette[Math.floor(Math.random() * palette.length)]; while (Math.abs(c[0] - old[0]) + Math.abs(c[1] - old[1]) < 0.2);
        v.paint = c;
        w.stats.resprays = (w.stats.resprays ?? 0) + 1;
        w.notes.push({ slot: 'toast', text: 'Kilat Respray', sub: 'Fresh paint · wanted level cleared · -$100', color: '#4dff9a', duration: 3.5 });
        w.audio?.chime();
        w.emit('respray');
      }
    }
    // Bang Bang Arms: stand at the counter.
    const c = a.guns.counter;
    if (!v && Math.hypot(p.x - c[0], p.z - c[1]) < 1.6 && this.cool <= 0) {
      this.cool = 4;
      const owned = w.arsenal.owned;
      let bought = null;
      if (!owned.pistol && w.money >= 400) { w.addMoney(-400); w.arsenal.give('pistol', 48); bought = 'Kobra 9 + 48 rounds (-$400)'; }
      else if (!owned.smg && w.money >= 1500) { w.addMoney(-1500); w.arsenal.give('smg', 120); bought = 'Wasp SMG + 120 rounds (-$1,500)'; }
      else if (!owned.shotgun && w.money >= 2500) { w.addMoney(-2500); w.arsenal.give('shotgun', 24); bought = 'Thunder shotgun + 24 shells (-$2,500)'; }
      else if (w.money >= 300) {
        w.addMoney(-300);
        for (const k of Object.keys(owned)) if (WEAPONS[k].clip) owned[k].ammo += WEAPONS[k].clip * 3;
        p.armor = 100;
        bought = 'Ammo for every gun + full armor (-$300)';
      }
      w.notes.push({ slot: 'help', text: bought ? `Bang Bang Arms: ${bought}` : 'Bang Bang Arms: come back with more cash.', duration: 4, key: 'help' });
      if (bought) { w.audio?.cash(); w.emit('purchase'); }
    }
  }

  queueMarkers(markers) {
    const a = this.w.city.anchors;
    const g = this.w.city;
    markers.add(a.respray.bay[0], g.groundAt(a.respray.bay[0], a.respray.bay[1]), a.respray.bay[1], 3, 1.2, [0.2, 1.0, 0.5]);
    markers.add(a.guns.counter[0], g.groundAt(a.guns.counter[0], a.guns.counter[1]), a.guns.counter[1], 0.9, 1.2, [1.0, 0.5, 0.15]);
  }
}
