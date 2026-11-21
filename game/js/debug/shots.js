// Screenshot and test scenes, selected with ?shot=<name|number>. Each sets up a believable mid-game
// state (about $48,000, the relevant mission active, a fitting weapon), lets the world run a few
// seconds so traffic, particles and lights are live, then raises window.__shotReady.

import { POINTS } from '../world/layout.js';
import { GangBrain } from '../ai/combat-ai.js';
import { twoShot, openSide } from '../story/cutscene-camera.js';

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
  const scenes = { 1: 'title', 2: 'chase', 3: 'cutscene', 4: 'docks' };
  name = scenes[name] ?? name;
  if (name === 'title') {
    app.enterTitle();
    app.titleT = 18;
    await wait(app, 4);
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
    g.env.hour = 17.35;
    g.populate(16, 24);
    const lin = g.missions.stageGarage();
    g.dialogue.actors = { lin, kai: g.player };
    const sides = [1, -1].map((sd) => [sd, twoShot({ ...g.player }, { ...lin }, sd).pos[2]]);
    const side = sides[0][1] < sides[1][1] ? sides[0][0] : sides[1][0];
    void openSide;
    g.cinematic = { cam: { ...twoShot(g.player, lin, side, 3.4, 1.5, 0.5), fov: 44 }, portrait: 'lin', skipHint: false };
    g.dialogue.say([['lin', "Viktor's nephew parks a yellow Vesper GT outside Bank Samudra like the street is his.", 30]]);
    g.controlsOn = false;
    await wait(app, 3);
  } else if (name === 'docks') {
    midGame(app);
    app.setState('playing');
    g.env.hour = 23.2;
    const fr = g.city.anchors.freight;
    const y = fr.yard;
    // Kai aims across the yard: guards behind lit containers, the Bison truck ahead to the right.
    const px = fr.truck[0] + 9, pz = fr.truck[1] + 21;
    const face = Math.atan2(fr.truck[0] - 3 - px, fr.truck[1] - pz);
    g.player.place(px, pz, face);
    g.camCtl.face(face);
    g.camCtl.pitch = -0.02;
    g.arsenal.current = 'smg';
    g.player.aim = 1;
    const truck = g.vehicles.spawn('bison', fr.truck[0], fr.truck[1], Math.PI / 2, { color: '#3a2a4a' });
    g.missionNoCops = true;
    for (const s of g.parkSlots) if (Math.hypot(s.x - px, s.z - pz) < 60) { s.gone = true; if (s.vehicle) g.vehicles.remove(s.vehicle); s.vehicle = null; }
    const spots = [[fr.truck[0] + 5, fr.truck[1] + 7], [fr.truck[0] - 6, fr.truck[1] + 9], [fr.truck[0] + 13, fr.truck[1] + 4], [fr.truck[0] - 1, fr.truck[1] + 4], ...fr.guardSpots.slice(0, 2)];
    for (const [x, z] of spots) {
      const e = g.peds.spawn('gang', x, z, { kind: 'gang', health: 900, state: 'scripted' });
      e.keep = true;
      e.weapon = 'pistol';
      e.brain = new GangBrain(g, { weapon: 'pistol', accuracy: 0.0, alerted: true });
    }
    g.player.god = true;
    g.missions.objective('Defeat the guards 2/6 · Destroy the Bison ✘', 'Shoot the truck until it explodes');
    g.autoFire = true;
    await wait(app, 2.5);
    truck.damage(5000);
    await wait(app, 0.7);
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
