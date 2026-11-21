# SELARA BAY — Dev log

## Current step
Step 1 (repo setup) — done when committed and pushed.

## Kit contract (gta6-01), summarized from RULES.txt / competition.yaml / starter
- **main.ts** at repo root, Node 22 (grader runs 22.23.x), standard library only. Copies `game/` and `screenshots/`
  to `$MAKEFUN_OUTPUT_DIR` (grader: `/output`) and writes `dossier.json` = `buildDossier(out, caps)` from
  `vendor/makefun-game.ts` (byte-for-byte kit copy, sha256 dc6718…6129). Caps: text 163840, screenshots max 4 /
  262144 bytes, game_max_files 993, game_max_bytes 50331648, game_path_max_bytes 1000.
- Runs twice in a sandbox: no network, read-only repo, 1 CPU, 1 GB, 64 procs, **10 s**. Both runs must write the
  same bytes → no clock reads, no unseeded randomness, sorted directory walks.
- **Gate rows** (valid = first four): game_files (plain files, ≤993 entries, ≤48 MiB, index.html ≤1 MiB);
  references (every script/link/media/import resolves to a file inside game/ or a data: URI — no http(s), no CDN,
  static imports parsed by AST); screenshots (3–4 PNG/JPEG, name `[A-Za-z0-9_][A-Za-z0-9._-]*`, **≤256 KiB,
  long side ≤1280, short side ≥480**); dossier_matches. js_parses is informational.
- **Screenshot size overrides the brief**: the brief says 1920×1080 PNG, the gate caps at 1280 long side and
  256 KiB, so screenshots are captured at **1280×720 JPEG** (quality tuned to fit 256 KiB).
- Judge sees a contact sheet of the screenshots (cover = first by name) + a short outline of source file paths and
  first declarations → clear file names and function names matter.
- **Transcript gate**: ≥30% of counted lines authored by the agent's own write/edit calls; ≤40% unwritten. Never
  generate source with scripts, never commit lockfiles/downloaded text. main.ts must be revised by ≥2 assistant
  messages (thinking_revised). ≥5 assistant text turns.
- **README** (repo_readme): 3 live badge images, each linked to make.fun; **GitHub About** (repo_about): website on
  make.fun + topic `makefun` — the user must set this.
- **Ownership**: repo owner is GitHub `SkyScrapperR`, which is the account → `.makefun/owner.json` only needed if
  the user signs in with a wallet-only account. Not added for now (note for the user at the end).
- Run record `makefun-run.json` is produced by `makefun submit`, not by main.ts.
- LICENSE: MIT, "I Wayan Bagus Somabawa".

## Decisions
- Custom WebGL2 engine, plain ES modules, no build. Simulate in 2D (x,z), render in 3D.
- Commits: plain messages, no AI trailers (user instruction).

## File map
- `main.ts` hand-in + deterministic self-checks · `serve.ts` local static server · `vendor/makefun-game.ts` kit lib
- `game/index.html` (placeholder boot page at step 1)

## Open bugs
- none yet
