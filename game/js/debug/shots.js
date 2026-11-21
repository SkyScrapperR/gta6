// Screenshot and test scenes, selected with ?shot=<name|number>. Each sets up a believable mid-game
// state (about $48,000, the relevant mission active, a fitting weapon), lets the world run a few
// seconds so traffic, particles and lights are live, then raises window.__shotReady.

import { POINTS } from '../world/layout.js';
import { GangBrain } from '../ai/combat-ai.js';
import { twoShot, openSide } from '../story/cutscene-camera.js';
import { MISSIONS } from '../story/missions.js';

const wait = (app, s) => new Promise((res) => {
  const end = app.game.time + s;
  const check = () => (app.game.time >= end ? res() : requestAnimationFrame(check));
  check();
});

function midGame(app) {
  const g = app.game;
  g.resetForNewGame();
  g.debugCam = null;
  g.money = 48250;
  g.missions.passed = 3;
  g.missions.safehouseUnlocked = true;
  g.arsenal.give('pistol', 96);
  g.arsenal.give('smg', 240);
  g.capture = true;
  g.notes.clear('toast');
  app.renderer.adaptiveScale = 1;
  app.renderer.post.autoExposure = true;
}

export async function runShot(app, name) {
  const g = app.game;
  const scenes = { 1: 'golden', 2: 'cutscene', 3: 'map', 4: 'docks' };
  name = scenes[name] ?? name;
  if (name === 'title') {
    app.enterTitle();
    app.titleT = 18;
    await wait(app, 4);
  } else if (name === 'golden') {
    // Yellow Fever gone loud: the Vesper sliding up a Kemuning shop street at golden hour, three
    // cruisers and the Rajawali behind it, one cruiser ploughing into a car it tried to pass.
    midGame(app);
    app.setState('playing');
    g.env.hour = 17.35;
    g.env.rain = g.env.targetRain = 0;
    const lane = 697.4, z0 = 322;
    const v = g.vehicles.spawn('vesper', lane, z0, Math.PI, { color: '#f2c41a' });
    g.player.place(lane - 2, z0, Math.PI);
    g.entry.seq = null;
    g.player.vehicle = v;
    v.driver = 'player';
    g.player.seat = 1;
    g.populate(24, 34);
    for (const [type, x, z] of [['motor', 705.8, 300], ['angkot', 705.8, 318], ['motor', 706.4, 334], ['motor', 705.4, 352]]) {
      const t = g.traffic.spawnOne(0, 1e9, true, type);
      if (t) { t.x = x; t.z = z; t.yaw = x < 700 ? Math.PI : 0; t.speed = x < 700 ? 9 : 8; }
    }
    g.missions.active = MISSIONS[1];
    g.missions.done = ["Steal Rendy's yellow Vesper GT"];
    g.missions.objText = 'Lose the cops, then deliver the Vesper';
    g.missions.objSub = 'Car condition 82% (keep it above 25%) · Kilat Respray clears your stars for $100';
    g.wanted.setStars(4);
    g.wanted.reveal();
    const cops = [];
    for (let k = 0; k < 3; k++) {
      const x = k === 1 ? 694.2 : lane;
      const c = g.vehicles.spawn('patrol', x, z0 + 10 + k * 9, Math.PI);
      g.police.enlist(c);
      Object.assign(c, { speed: 21, siren: true, ai: null, driver: 'shot', shotLane: x });
      cops.push(c);
    }
    // The car the third cruiser is about to hit, stopped across its lane with a smoking hood.
    const victim = g.vehicles.spawn('kancil', 694.0, z0 - 48, Math.PI * 0.62, { color: '#3a6a8a' });
    victim.health = 420;
    victim.driver = null;
    g.autoPolice = () => {
      for (const c of cops) { c.throttle = c.speed < 22 ? 0.95 : 0.25; c.steer = (c.shotLane - c.x) * 0.06 - Math.sin(c.yaw - Math.PI) * 1.2; c.siren = true; }
      // The Rajawali keeps station high behind the pursuit with its searchlight locked on the Vesper.
      Object.assign(g.heli, { x: v.x - 3, y: 17, z: v.z + 42, vx: 0, vz: -v.speed, orbit: Math.PI / 2 });
      g.heli.spot = [v.x, g.city.groundAt(v.x, v.z), v.z];
    };
    v.speed = 21;
    let crashT = null;
    const onCrash = g.onCrash.bind(g);
    g.onCrash = (a, speed, other) => { onCrash(a, speed, other); if (crashT === null && (a === victim || other === victim)) crashT = g.time; };
    // Hold the lane, then flick into a slide just before the shot.
    const driftAt = g.time + 2.7;
    g.autoDrive = () => {
      const drift = g.time > driftAt;
      v.throttle = v.speed < 21 ? 0.8 : 0.2;
      v.steer = drift ? -0.3 : (lane - v.x) * 0.08 - Math.sin(v.yaw - Math.PI) * 1.2;
      v.handbrake = drift && g.time < driftAt + 0.25;
    };
    g.heli.spawnNear(v.x, v.z + 30);
    Object.assign(g.heli, { x: v.x + 8, z: v.z + 60, y: 15 });
    g.camCtl.lookOffset = 2.5;
    g.camCtl.lookPitch = 0.02;
    g.camCtl.holdLook = true;
    app.audio.start(); // what the player's first key press does
    g.music?.radioOn?.(2);
    const end = g.time + 6;
    await new Promise((res) => { const f = () => ((crashT !== null && g.time > crashT + 0.12) || g.time > end ? res() : requestAnimationFrame(f)); f(); });
  } else if (name === 'map') {
    // Pause > Map & Dossier, mid-game: three missions passed, Wheelman next, a waypoint set.
    midGame(app);
    app.setState('playing');
    g.env.hour = 15;
    g.player.place(452, 520, 0);
    for (const i of [0, 3, 5, 8]) g.tags.collected.add(i);
    Object.assign(g.stats, { kills: 38, copsKilled: 6, carsStolen: 17, shots: 912, timePlayed: 2 * 3600 + 14 * 60 });
    g.waypoint = [g.city.anchors.bank.getaway[0], g.city.anchors.bank.getaway[1]];
    await wait(app, 1);
    app.openMap();
    // The map pauses the world, so wait a few real frames for it to draw.
    await new Promise((res) => { let n = 0; const f = () => (++n > 10 ? res() : requestAnimationFrame(f)); f(); });
  } else if (name === 'chase') {
    midGame(app);
    app.setState('playing');
    g.env.hour = 22.6;
    g.env.rain = g.env.targetRain = 1;
    const v = g.vehicles.spawn('vesper', 502.6, 330, 0, { color: '#f2c41a' });
    g.player.place(500, 330, 0);
    g.entry.seq = null;
    g.player.vehicle = v;
    v.driver = 'player';
    g.player.seat = 1;
    g.populate(20, 30);
    g.wanted.setStars(4);
    g.wanted.reveal();
    for (let k = 0; k < 3; k++) {
      const c = g.vehicles.spawn('patrol', 502.6 + (k % 2 ? -4.6 : 0.4), 318 - k * 9, 0);
      g.police.enlist(c);
      c.speed = 21;
      c.siren = true;
      c.ai = null;
      c.driver = 'shot';
      c.shotLane = 502.6 + (k % 2 ? -4.6 : 0.4);
    }
    g.autoPolice = (dt) => { for (const c of g.vehicles.list) if (c.driver === 'shot') { c.throttle = c.speed < 21 ? 0.9 : 0.2; c.steer = (c.shotLane - c.x) * 0.06 - Math.sin(c.yaw) * 1.2; c.siren = true; } };
    v.speed = 20;
    g.autoDrive = (dt) => { v.throttle = v.speed < 19 ? 0.7 : 0; v.steer = (502.6 - v.x) * 0.08 - Math.sin(v.yaw) * 1.2; };
    g.heli.spawnNear(v.x, v.z - 30);
    Object.assign(g.heli, { x: v.x - 10, z: v.z - 34, y: 24 });
    g.camCtl.lookOffset = 2.75;
    g.camCtl.lookPitch = 0.12;
    g.camCtl.holdLook = true;
    g.music?.radioOn?.(0);
    await wait(app, 3.5);
  } else if (name === 'cutscene') {
    midGame(app);
    app.setState('playing');
    g.env.hour = 17.95;
    g.populate(16, 24);
    const lin = g.missions.stageGarage();
    g.dialogue.actors = { lin, kai: g.player };
    const sides = [1, -1].map((sd) => [sd, twoShot({ ...g.player }, { ...lin }, sd).pos[2]]);
    const side = sides[0][1] > sides[1][1] ? sides[0][0] : sides[1][0];
    void openSide;
    g.cinematic = { cam: { ...twoShot(g.player, lin, side, 3.2, 1.35, 0.3), fov: 46 }, portrait: 'lin', skipHint: false };
    g.dialogue.say([['lin', "Viktor's nephew parks a yellow Vesper GT outside Bank Samudra like the street is his.", 30]]);
    g.controlsOn = false;
    await wait(app, 3);
  } else if (name === 'docks') {
    midGame(app);
    app.setState('playing');
    g.env.hour = 23.2;
    const fr = g.city.anchors.freight;
    const y = fr.yard;
    // Kai in the yard behind a parked van, aiming across it: guards behind the containers 10-20 m
    // out, the Bison under the gantry crane ahead to the left.
    const px = fr.truck[0] + 18, pz = fr.truck[1] + 3.5;
    const face = Math.atan2(fr.truck[0] + 6 - px, fr.truck[1] - 5.5 - pz);
    g.player.place(px, pz, face);
    g.camCtl.face(face);
    g.camCtl.pitch = -0.02;
    g.arsenal.current = 'smg';
    g.player.aim = 1;
    const truck = g.vehicles.spawn('bison', fr.truck[0], fr.truck[1], Math.PI / 2, { color: '#3a2a4a' });
    g.missionNoCops = true;
    for (const s of g.parkSlots) if (Math.hypot(s.x - px, s.z - pz) < 60) { s.gone = true; if (s.vehicle) g.vehicles.remove(s.vehicle); s.vehicle = null; }
    // The four guards still standing, at the container ends and by the truck 9-15 m out (the two at the
    // gate were dealt with on the way in, so the tracker reads 2/6).
    const spots = [[12.3, -2.9], [24, -2.3], [16, -7.3], [3.5, 2.5]].map(([dx, dz]) => [fr.truck[0] + dx, fr.truck[1] + dz]);
    const lx = Math.cos(face), lz = -Math.sin(face); // Kai's left
    const van = g.vehicles.spawn('bajak', px + lx * 4.2 - Math.sin(face) * 0.5, pz + lz * 4.2 - Math.cos(face) * 0.5, face + 0.35, { parked: true, color: '#5a8a5a' });
    van.driver = null;
    spots.forEach(([x, z], k) => {
      const weapon = k % 2 ? 'smg' : 'pistol';
      const e = g.peds.spawn('gang', x, z, { kind: 'gang', health: 900, state: 'scripted' });
      e.keep = true;
      e.weapon = weapon;
      // Each guard holds the spot it was posted at and peeks out from there.
      e.brain = new GangBrain(g, { weapon, accuracy: 0.0, alerted: true });
      Object.assign(e.brain, { state: 'cover', cover: [x, z], coverT: 0, peekT: 0.3 + k * 0.45 });
    });
    g.player.god = true;
    // Mid-mission Low Tide state; the tracker counter is computed from the guards actually down.
    g.missions.active = MISSIONS[4];
    g.missions.done = ['Grab the Wasp SMG from the workbench', 'Go to Orchid Freight'];
    g.missions.tick = () => {
      const down = g.peds.list.filter((q) => q.kind === 'gang' && q.dead).length + 6 - g.peds.list.filter((q) => q.kind === 'gang').length;
      const t = `Defeat the guards ${down}/6 · Destroy the Bison ${truck.wrecked ? '[x]' : '[ ]'}`;
      if (t !== g.missions.objText) { g.missions.objText = t; g.missions.objSub = 'Shoot the truck until it explodes'; }
    };
    g.autoFire = true;
    // Pulled-back over-the-shoulder framing: Kai on the left third at about a quarter of the frame height.
    const fx = Math.sin(face), fz = Math.cos(face), rx = -fz, rz = fx;
    g.debugCam = { pos: [px - fx * 8.4 + rx * 2.2, 2.7, pz - fz * 8.4 + rz * 2.2], target: [px + fx * 30 + rx * 2.2, 2.6, pz + fz * 30 + rz * 2.2], fov: 52 };
    let npcShot = -1;
    const npcFire = g.combat.npcFire.bind(g.combat);
    g.combat.npcFire = (...a) => { npcShot = g.time; return npcFire(...a); };
    await wait(app, 2.5);
    truck.damage(5000);
    // Catch the fireball while it is still orange, on a frame right after a guard fires.
    const t0 = g.time;
    await new Promise((res) => { const f = () => ((g.time > t0 + 0.2 && g.time - npcShot < 0.05) || g.time > t0 + 0.55 ? res() : requestAnimationFrame(f)); f(); });
  } else if (name === 'kaicop') {
    midGame(app);
    app.setState('playing');
    g.env.hour = 13;
    const [x, z] = POINTS.homecomingCar;
    g.player.place(x - 0.8, z + 4, Math.PI);
    const cop = g.peds.spawn('cop', x + 0.8, z + 4, { kind: 'story', state: 'scripted', yaw: Math.PI });
    cop.keep = true;
    g.controlsOn = false;
    g.debugCam = { pos: [x, 1.4, z + 0.5], target: [x, 1.1, z + 4], fov: 40 };
    app.hud.visible = false;
    await wait(app, 1.5);
  }
  window.__shotReady = true;
}
