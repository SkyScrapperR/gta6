// Debug scenario: start Yellow Fever at its marker and report mission state.
async (page) => {
  const BASE = globalThis.PLAYTEST_URL ?? 'http://localhost:8080/';
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.stack ?? e).split('\n').slice(0, 3).join(' | ')));
  await page.goto(`${BASE}?q=low&play=1`);
  await page.bringToFront();
  await page.waitForFunction(() => window.__app?.state === 'cutscene' || window.__app?.state === 'playing', null, { timeout: 90000 });
  for (let k = 0; k < 6; k++) { await page.keyboard.press('Space'); await page.waitForTimeout(300); }
  const r = await page.evaluate(async () => {
    const g = window.__app.game;
    g.missions.abort();
    g.missions.passed = 1;
    const f = g.city.anchors.garage.front;
    g.player.place(f[0] + 6, f[1]);
    await new Promise((res) => setTimeout(res, 500));
    const before = { armed: g.missions.armed, active: g.missions.active?.id, marker: g.missions.markerOf(1), p: [g.player.x, g.player.z] };
    g.player.place(f[0], f[1]);
    await new Promise((res) => setTimeout(res, 800));
    return { before, after: { active: g.missions.active?.id, armed: g.missions.armed, p: [g.player.x, g.player.z], fail: g.failState, veh: !!g.player.vehicle, alive: g.player.alive, state: window.__app.state } };
  });
  return { ok: errors.length === 0, errors, log: [JSON.stringify(r)] };
}
