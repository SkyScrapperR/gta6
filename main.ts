// SELARA BAY — make.fun gta6-01 entrypoint (Node 22, standard library only).
//
// Hands the game in: copies game/ and screenshots/ to $MAKEFUN_OUTPUT_DIR (default /output) and
// writes dossier.json with the kit's vendored buildDossier. Before that it runs a few deterministic
// self-checks on the shipped files (no clock, no randomness, no network) and prints a short report,
// so two runs print identical bytes.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

/** The gate's caps (reference/gate.json in the kit). */
const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

/** Every file under a directory, POSIX-relative, sorted by code unit so the order never depends on the OS. */
function listFiles(dir: string, rel = ''): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(join(dir, rel), { withFileTypes: true })) {
    const path = rel === '' ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) found.push(...listFiles(dir, path));
    else if (entry.isFile()) found.push(path);
  }
  return found.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** A deterministic report line per check; a failed check stops the hand-in with exit 1. */
const report: string[] = [];
function check(name: string, ok: boolean, detail: string): void {
  report.push(`${ok ? 'ok  ' : 'FAIL'} ${name}: ${detail}`);
  if (!ok) {
    console.log(report.join('\n'));
    process.exit(1);
  }
}

const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');
check('game/index.html', existsSync(join(gameDir, 'index.html')), 'present');
const gameFiles = listFiles(gameDir);
check('game file count', gameFiles.length < CAPS.game_max_files, `${gameFiles.length} files`);
const shots = existsSync(shotsDir) ? listFiles(shotsDir).filter((n) => !n.startsWith('.')) : [];
check('screenshots', shots.length >= 3 && shots.length <= 4, `${shots.length} images`);
for (const s of shots) check(`screenshot ${s}`, statSync(join(shotsDir, s)).size <= CAPS.screenshots.max_bytes, `${statSync(join(shotsDir, s)).size} bytes`);

// A content digest of the shipped game, stable across runs and machines.
const digest = createHash('sha256');
for (const f of gameFiles) digest.update(`${f}\0`).update(readFileSync(join(gameDir, f)));
report.push(`game sha256 ${digest.digest('hex')}`);

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });
writeFileSync(join(out, 'dossier.json'), buildDossier(out, CAPS));

console.log(report.join('\n'));
console.log('SELARA BAY handed in.');
