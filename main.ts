// SELARA BAY — make.fun gta6-01 entrypoint (Node 22, standard library only).
//
// Hands the game in: copies game/ and screenshots/ to $MAKEFUN_OUTPUT_DIR (default /output) and
// writes dossier.json with the kit's vendored buildDossier. Before that it runs deterministic
// self-checks on the shipped files (no clock, no randomness, no network) and prints a short report,
// so two runs print identical bytes:
//   - required files exist (index.html, the engine, the entry module) and the gate's caps hold
//   - every static import in every game module resolves to a file inside game/ (offline, no CDN)
//   - no source file references http(s):// at runtime
//   - screenshots are 3-4 PNG/JPEG files within the gate's byte cap and pixel limits
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, dirname, posix } from 'node:path';
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

/** Static import specifiers of a module (import ... from '...', export ... from '...', import '...'). */
function staticImports(src: string): string[] {
  const found: string[] = [];
  const re = /^\s*(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]/gm;
  for (let m = re.exec(src); m; m = re.exec(src)) found.push(m[1] ?? m[2]);
  return found;
}

/** Image size from PNG IHDR or JPEG SOFn markers. */
function imageSize(bytes: Uint8Array): [number, number] | null {
  if (bytes[0] === 0x89 && bytes[1] === 0x50) return [(bytes[16] << 24) | (bytes[17] << 16) | (bytes[18] << 8) | bytes[19], (bytes[20] << 24) | (bytes[21] << 16) | (bytes[22] << 8) | bytes[23]];
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let i = 2;
    while (i + 9 < bytes.length) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      const len = (bytes[i + 2] << 8) | bytes[i + 3];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return [(bytes[i + 7] << 8) | bytes[i + 8], (bytes[i + 5] << 8) | bytes[i + 6]];
      }
      i += 2 + len;
    }
  }
  return null;
}

const gameDir = join(here, 'game');
const shotsDir = join(here, 'screenshots');

// 1. Files and caps.
for (const f of ['index.html', 'js/main.js', 'js/game.js', 'js/engine/renderer.js', 'js/story/missions.js']) {
  check(`game/${f}`, existsSync(join(gameDir, f)), 'present');
}
const gameFiles = listFiles(gameDir);
const gameBytes = gameFiles.reduce((n, f) => n + statSync(join(gameDir, f)).size, 0);
check('game file count', gameFiles.length < CAPS.game_max_files, `${gameFiles.length} files, ${gameBytes} bytes`);
check('index.html size', statSync(join(gameDir, 'index.html')).size <= 1024 * 1024, `${statSync(join(gameDir, 'index.html')).size} bytes`);

// 2. Offline module graph: every relative import resolves to a file inside game/.
const modules = gameFiles.filter((f) => f.endsWith('.js'));
let edges = 0;
for (const m of modules) {
  const src = readFileSync(join(gameDir, m), 'utf8');
  for (const spec of staticImports(src)) {
    edges++;
    check(`import in ${m}`, spec.startsWith('./') || spec.startsWith('../'), spec);
    const target = posix.normalize(posix.join(posix.dirname(m), spec));
    check(`import target ${target}`, !target.startsWith('..') && existsSync(join(gameDir, target)), `from ${m}`);
  }
  check(`no network in ${m}`, !/['"`]https?:\/\//.test(src), 'no http(s) URL literals');
}
report.push(`modules ${modules.length}, static imports ${edges}`);

// 3. Screenshots.
const shots = existsSync(shotsDir) ? listFiles(shotsDir).filter((n) => !n.startsWith('.')) : [];
check('screenshots', shots.length >= 3 && shots.length <= 4, `${shots.length} images`);
for (const s of shots) {
  const bytes = new Uint8Array(readFileSync(join(shotsDir, s)));
  const size = imageSize(bytes);
  check(`screenshot ${s}`, bytes.length <= CAPS.screenshots.max_bytes && !!size && Math.max(...size) <= 1280 && Math.min(...size) >= 480, `${bytes.length} bytes, ${size ? size.join('x') : '?'}`);
}

// 4. Soundtrack data: the radio stations and score are plain ES modules; every song must run 1.5-3 minutes.
const { songLength } = await import('./game/js/audio/music/sequencer.js');
const { STATIONS, ALL_SONGS } = await import('./game/js/audio/music/radio.js');
check('radio stations', STATIONS.length === 3 && STATIONS.every((s: { songs: unknown[] }) => s.songs.length >= 3), `${STATIONS.length} stations`);
for (const song of ALL_SONGS as { title: string; bpm: number }[]) {
  const len = songLength(song);
  check(`song "${song.title}"`, len >= 90 && len <= 180, `${song.bpm} BPM, ${len.toFixed(1)} s`);
}

// 5. A content digest of the shipped game, stable across runs and machines.
const digest = createHash('sha256');
for (const f of gameFiles) digest.update(`${f}\0`).update(readFileSync(join(gameDir, f)));
report.push(`game sha256 ${digest.digest('hex')}`);

mkdirSync(out, { recursive: true });
cpSync(gameDir, join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
cpSync(shotsDir, join(out, 'screenshots'), { recursive: true });
const dossier = buildDossier(out, CAPS);
writeFileSync(join(out, 'dossier.json'), dossier);
report.push(`dossier ${dossier.length} bytes`);

// 6. Dossier coverage: which sources the judge's text window shows whole, which one is cut, how many are left out.
const text: string = JSON.parse(new TextDecoder().decode(dossier)).text;
const shown: { path: string; lines: number; bytes: number; cut: string | null }[] = [];
const heading = /^### game\/(\S+) \((\d+) lines?, (\d+) bytes\)$/gm;
for (let m = heading.exec(text); m; m = heading.exec(text)) shown.push({ path: m[1], lines: Number(m[2]), bytes: Number(m[3]), cut: null });
const partial = /\[(\d+) of this file's (\d+) lines not shown\.\]/.exec(text);
if (partial && shown.length) shown[shown.length - 1].cut = `${Number(partial[2]) - Number(partial[1])}/${partial[2]} lines shown`;
const leftOut = /\[Cut at \d+ bytes: (\d+) files? and (\d+) bytes of source left out\.\]/.exec(text);
const sourceCount = gameFiles.filter((f) => /\.(html|js|mjs|css|json|glsl|vert|frag|wgsl)$/.test(f)).length;
report.push(`dossier coverage: ${shown.filter((s) => !s.cut).length} whole, ${partial ? 1 : 0} cut, ${leftOut ? leftOut[1] : 0} left out of ${sourceCount} sources`);
for (const s of shown) report.push(`  ${s.cut ? 'CUT ' : 'whole'} ${s.path} (${s.bytes} bytes${s.cut ? `, ${s.cut}` : ''})`);

console.log(report.join('\n'));
console.log('SELARA BAY handed in.');
void dirname;
