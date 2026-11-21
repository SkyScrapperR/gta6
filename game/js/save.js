// Save games and settings in localStorage under versioned keys. A save holds money, mission progress,
// weapons and ammo, health and armor, position, collected tags, stats, time of day and settings.

const SAVE_KEY = 'selarabay.save.v1';
const SETTINGS_KEY = 'selarabay.settings.v1';

export const DEFAULT_SETTINGS = { quality: null, music: 0.7, sfx: 0.8, radio: 0.7, sensitivity: 1, invertY: false };

function read(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function hasSave() {
  return !!read(SAVE_KEY);
}

export function loadSave() {
  const s = read(SAVE_KEY);
  return s && s.version === 1 ? s : null;
}

export function deleteSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
}

/** Serialise the world into a save record. */
export function saveGame(world) {
  const p = world.player;
  const rec = {
    version: 1,
    money: world.money,
    missions: world.missions?.serialize() ?? {},
    arsenal: { owned: world.arsenal.owned, current: world.arsenal.current },
    health: p.health,
    armor: p.armor,
    pos: [p.x, p.z, p.yaw],
    tags: [...(world.tags?.collected ?? [])],
    stats: world.stats,
    hour: world.env.hour,
    settings: loadSettings(),
  };
  return write(SAVE_KEY, rec);
}

/** Apply a save record to a freshly loaded world. */
export function applySave(world, rec) {
  world.money = rec.money ?? 0;
  world.missions?.deserialize(rec.missions ?? {});
  if (rec.arsenal) {
    world.arsenal.owned = rec.arsenal.owned;
    world.arsenal.current = rec.arsenal.current in rec.arsenal.owned ? rec.arsenal.current : 'fists';
  }
  const p = world.player;
  p.health = rec.health ?? 100;
  p.armor = rec.armor ?? 0;
  if (rec.pos) p.place(rec.pos[0], rec.pos[1], rec.pos[2]);
  world.camCtl.face(p.yaw);
  world.tags?.restore(rec.tags ?? []);
  Object.assign(world.stats, rec.stats ?? {});
  world.env.hour = rec.hour ?? 12;
}

export function loadSettings() {
  return { ...DEFAULT_SETTINGS, ...(read(SETTINGS_KEY) ?? {}) };
}

export function saveSettings(s) {
  write(SETTINGS_KEY, s);
}
