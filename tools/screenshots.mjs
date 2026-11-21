// Captures the four README/dossier screenshots from the live game (?shot=1..4) on the High preset at
// render scale 1.0, as 1280x720 JPEGs under 256 KiB (the make.fun gate's limits).
//   npm i && node tools/screenshots.mjs

import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 8092;
const server = spawn(process.execPath, [join(root, 'serve.ts'), '--port', String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));
const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const names = { 1: '01-golden-hour-chase', 2: '02-mission-cutscene', 3: '03-map-dossier', 4: '04-docks-firefight' };
const only = process.argv.slice(2); // e.g. `node tools/screenshots.mjs 1 4` retakes just those
for (const [n, name] of Object.entries(names)) {
  if (only.length && !only.includes(n)) continue;
  await page.goto(`http://localhost:${port}/?q=high&shot=${n}`);
  await page.bringToFront();
  await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 300000 });
  await page.waitForTimeout(300);
  let quality = 90;
  let buf;
  do {
    buf = await page.screenshot({ type: 'jpeg', quality });
    quality -= 5;
  } while (buf.length > 250 * 1024 && quality > 50);
  const { writeFileSync } = await import('node:fs');
  writeFileSync(join(root, 'screenshots', `${name}.jpg`), buf);
  console.log(`${name}.jpg ${buf.length} bytes`);
}
await browser.close();
server.kill();
