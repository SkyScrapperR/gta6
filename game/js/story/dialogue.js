// Dialogue: timed subtitle lines with speaker names and colours, routed to the subtitle slot. While
// a line plays its speaker gestures (talk animation) and music/radio duck under it.

export const SPEAKERS = {
  kai: { name: 'Kai', color: '#2ff3e0' },
  lin: { name: 'Mama Lin', color: '#ffb347' },
  dex: { name: 'Dex', color: '#7ad7ff' },
  viktor: { name: 'Viktor', color: '#c070ff' },
  rendy: { name: 'Rendy', color: '#f2c41a' },
  radio: { name: 'Police radio', color: '#6a9aff' },
};

export class Dialogue {
  constructor(world) {
    this.world = world;
    this.queue = [];
    this.cur = null;
    this.t = 0;
    this.actors = {};
  }

  /** lines: [[who, text, seconds?], ...] */
  say(lines, onDone = null) {
    for (const [who, text, dur] of lines) this.queue.push({ who, text, dur: dur ?? Math.max(2.2, text.length * 0.055) });
    if (onDone) this.queue.push({ done: onDone });
    if (!this.cur) this.next();
  }

  next() {
    this.cur = this.queue.shift() ?? null;
    this.t = 0;
    if (!this.cur) return;
    if (this.cur.done) {
      const f = this.cur.done;
      this.cur = null;
      f();
      if (!this.cur) this.next();
      return;
    }
    const sp = SPEAKERS[this.cur.who] ?? { name: this.cur.who, color: '#fff' };
    this.world.notes.push({ slot: 'subtitle', speaker: sp.name, color: sp.color, text: this.cur.text, duration: this.cur.dur, priority: 5, key: 'dlg' });
    this.world.audio?.duckFor(0.45, this.cur.dur);
    if (this.world.cinematic) this.world.cinematic.portrait = this.cur.who in SPEAKERS && this.cur.who !== 'radio' ? this.cur.who : null;
  }

  get busy() {
    return !!this.cur || this.queue.length > 0;
  }

  clear() {
    this.queue = [];
    this.cur = null;
    this.world.notes.clear('subtitle', 'dlg');
  }

  update(dt) {
    for (const [who, ped] of Object.entries(this.actors)) {
      if (!ped) continue;
      const speaking = this.cur && this.cur.who === who;
      ped.talk = Math.max(0, Math.min(1, (ped.talk ?? 0) + (speaking ? dt * 3 : -dt * 2)));
    }
    if (!this.cur) return;
    this.t += dt;
    if (this.t >= this.cur.dur) this.next();
  }
}
