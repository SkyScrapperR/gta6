// On-screen messages through a priority queue with fixed slots, so nothing ever overlaps. Each slot
// shows one message at a time; a higher-priority message pre-empts a lower one and the rest wait.
// Slots: banner (MISSION PASSED / FLATLINED / CUFFED), objective, subtitle, help, area, vehicle,
// radio, toast (pickups, money, unlocks).

export const SLOTS = ['banner', 'objective', 'subtitle', 'help', 'area', 'vehicle', 'radio', 'toast'];

export class Notifications {
  constructor() {
    this.queues = Object.fromEntries(SLOTS.map((s) => [s, []]));
    this.active = Object.fromEntries(SLOTS.map((s) => [s, null]));
  }

  /**
   * Show a message. opts: { slot, text, sub, color, priority (higher wins), duration (s, Infinity = sticky),
   * key (replaces a queued/active message with the same key) }.
   */
  push(opts) {
    const m = { priority: 1, duration: 4, t: 0, ...opts };
    const q = this.queues[m.slot];
    if (m.key) {
      const a = this.active[m.slot];
      if (a && a.key === m.key) {
        Object.assign(a, m, { t: Math.min(a.t, 0.3) });
        return a;
      }
      const i = q.findIndex((x) => x.key === m.key);
      if (i >= 0) q.splice(i, 1);
    }
    const cur = this.active[m.slot];
    if (!cur) this.active[m.slot] = m;
    else if (m.priority > cur.priority) {
      if (cur.duration === Infinity || cur.t < cur.duration - 0.5) q.unshift(cur);
      this.active[m.slot] = m;
    } else {
      q.push(m);
      q.sort((a, b) => b.priority - a.priority);
    }
    return m;
  }

  clear(slot, key = null) {
    if (key) {
      if (this.active[slot]?.key === key) this.active[slot] = null;
      this.queues[slot] = this.queues[slot].filter((m) => m.key !== key);
    } else {
      this.active[slot] = null;
      this.queues[slot] = [];
    }
    if (!this.active[slot] && this.queues[slot].length) this.active[slot] = this.queues[slot].shift();
  }

  update(dt) {
    for (const s of SLOTS) {
      const a = this.active[s];
      if (!a) continue;
      a.t += dt;
      if (a.t >= a.duration) {
        this.active[s] = this.queues[s].shift() ?? null;
        if (this.active[s]) this.active[s].t = 0;
      }
    }
  }

  /** Fade factor for the active message of a slot (0..1). */
  alpha(slot) {
    const a = this.active[slot];
    if (!a) return 0;
    const fadeIn = Math.min(1, a.t / 0.25);
    const fadeOut = a.duration === Infinity ? 1 : Math.min(1, (a.duration - a.t) / 0.4);
    return Math.max(0, Math.min(fadeIn, fadeOut));
  }
}
