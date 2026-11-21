// Runs tools/playtest-scenario.js in a headed desktop Chrome via playwright-core and prints the report.
// Starts the local static server itself. Exits 1 if any step or console error fails.
//   npm i && node tools/playtest.mjs [--url http://localhost:8091/]

import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = 8091;
const server = spawn(process.execPath, [join(root, 'serve.ts'), '--port', String(port)], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 800));

const file = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'playtest-scenario.js';
const scenario = readFileSync(join(root, 'tools', file), 'utf8');
// The scenario file is a single function expression (shared with the Playwright MCP).
const run = (0, eval)(`(${scenario.replace(/^\s*\/\/.*$/gm, '').trim()})`);
globalThis.PLAYTEST_URL = `http://localhost:${port}/`;
const fromArg = process.argv.indexOf('--from');
if (fromArg > 0) globalThis.PLAYTEST_FROM = Number(process.argv[fromArg + 1]);

const browser = await chromium.launch({ channel: 'chrome', headless: false, args: ['--window-size=1300,800', '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
let result;
try {
  result = await run(page);
} catch (e) {
  result = { ok: false, errors: [String(e)], log: [] };
}
await browser.close();
server.kill();
for (const l of result.log) console.log(l);
for (const e of result.errors) console.log(`ERROR ${e}`);
console.log(result.ok ? 'PLAYTEST PASSED' : 'PLAYTEST FAILED');
process.exit(result.ok ? 0 : 1);
