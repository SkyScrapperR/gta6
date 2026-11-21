# SELARA BAY — Dev log

## Current step
Step 5 (vehicles) done → next: step 6 traffic, pedestrians, wanted level, police.

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
  the user signs in with a wallet-only account. Not added (note for the user at the end).
- Run record `makefun-run.json` is produced by `makefun submit`, not by main.ts.

## Decisions
- Custom WebGL2 engine, plain ES modules, no build. Simulate in 2D (x,z), render in 3D.
- World axes: x east, **z south** (top-down map draws x right, z down — consistent with right-handed 3D).
  Forward for yaw h = (sin h, cos h). Left of travel direction d = (dz, -dx). Traffic keeps LEFT; cars are
  right-hand drive (driver on body −X side, door index 1).
- One lit shader for everything; material id + bone index packed in the vertex (`mat + 32*bone`).
  Rigged meshes (characters, cars) use up to 16 bone matrices; static chunks use identity.
- Parked cars are streamed around the camera (150 m in, 210 m out) — spawning all ~800 killed the GPU.
- Playwright tests must call `page.bringToFront()`: Chrome throttles rAF for occluded windows.
- Commits: plain messages, no AI trailers (user instruction).

## Measured
- Frame time (render+sync readback, 1280×720): Low 36 ms, Medium 53 ms, High 69 ms; live rAF on High ≈ 33 fps
  when the window is in front.

## File map
- `main.ts` hand-in + deterministic self-checks · `serve.ts` local static server · `vendor/makefun-game.ts` kit lib
- `game/js/main.js` boot/loop/states · `game/js/game.js` gameplay world wiring
- `game/js/core/` math (mat4, rng), input · `game/js/engine/` gl, renderer, shaders/*, mesh-builder, camera,
  frustum, shadows, sky (time of day), post (bloom/exposure/ACES), signs (canvas atlas), water
- `game/js/world/` layout (map data), city (generation), city-meshes (roads/sidewalks/coast), buildings,
  landmarks, props (instanced), collision (grid), roads (graph/lanes/signals/A*)
- `game/js/entities/` character-model (rig + animator), player, camera-controller, vehicle-model, vehicle,
  car-entry

## Open bugs / todo
- Skid marks / tyre smoke need the particle system (step 7).
- Check seated pose vs roof after roof/seat change.
