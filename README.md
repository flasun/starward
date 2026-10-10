# Starward

Fly a real solar system, then the near stars, the Milky Way, and the galaxy clusters beyond. A WebGL2 flight game that runs in the browser.

## The game

- **Five chapters:** Round the Sun, The Near Stars, The Milky Way, Out of the Galaxy, and The Web. Chart every place in a chapter to open the next one.
- **Real places.** Sizes and orbital periods are real. Distances are compressed so a flight can cross them.
- **Flight log.** Twenty challenges, a set for every chapter: an eclipse and a ring cut round the Sun, a corona skim in the near stars, a dive to the galactic core, a postcard of home from beyond Andromeda, a brush past the Great Attractor, and a run to the edge of the map. Each is logged with your time.
- **Daily trial.** One course a day for everyone: five worlds round the Sun, flown by hand against the clock. Post your time to the day's board under a callsign. The board runs on the Cloudflare build; anywhere else the trial still flies and keeps your best on the device.
- **Trade and stations.** Every place you can chart has a market: buy goods where they are cheap and sell where they are dear. Every chapter's open space takes stations that pay while you fly. Prices, station costs, and station pay rise chapter by chapter.
- **Cameras and steering.** Cockpit, chase, either wing, and overhead views. Three orbit heights, autopilot, gamepads, and optional hands-free flying by gaze, which runs on the device (MediaPipe).
- **No account.** Progress saves in the browser, in one versioned `starward-save` entry. The trial keeps its callsign, best, and pilot key in `starward-trial`.

### Controls

| Input | Action |
| --- | --- |
| Drag the sky | Steer |
| A / D | Turn |
| W / S | Pitch |
| Space | Warp |
| Escape | Pause |
| Double-tap a world | Fly there and orbit it |

With a gamepad (any pad the browser maps to the standard layout; press a button to wake it):

| Button | Action |
| --- | --- |
| Left stick | Steer |
| A | Go / Stop; Next on a help card; resume from pause |
| B | Close the open panel, or resume |
| X | Orbit |
| Y | Camera |
| LB / RB, D-pad left / right | Previous / next place |
| D-pad up / down | Faster / slower (hold to keep stepping) |
| RT | Warp |
| LT | Level the nose |
| Back / View | Flight log |
| Start / Menu | Pause (like Escape) |

Hands-free, with Gaze on in More (the camera stays on the device):

| Do this | And |
| --- | --- |
| Look | Steer |
| Hold a world in the sights for a moment and a ring fills | It becomes the target |
| Close your eyes for about a second, then open them | Go / Stop; also Next on a help card, and resume from pause |
| Look well aside for about a second | Take the controls back from autopilot, an orbit, or a held target |

## Run it

Needs Node 22.

```sh
npm install
npm run dev        # http://localhost:8080
```

Always start Vite through the npm scripts. They run it through `scripts/with-app-env.mjs`, which loads `.grok/app-env.json`.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server on port 8080 |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run test:game` | Unit tests for the game logic (`src/components/**/*.test.ts`) |
| `npm run check:render` | Load the served build in headless Chromium and fail if it doesn't render or chart Earth |
| `npm run build` | Production build for Vercel, into `.vercel/output` |
| `npm run preview:restart` | Serve the Vercel build on `127.0.0.1:8081` |
| `npm run build:cloudflare` | Production build for Cloudflare Workers, into `.output` |
| `npm run preview:cloudflare` | Build for Workers and serve it locally in workerd on port 8787 |
| `npm run deploy:cloudflare` | Build for Workers, create or update the leaderboard tables in D1, and deploy with Wrangler |

CI (`.github/workflows/ci.yml`) runs typecheck, lint, the game tests, and both builds on every pull request. A second job serves the build and runs `check:render`, because a broken shader passes typecheck and build.

## Code map

```
src/components/starfield/
  Starward.tsx   Runs the engine, loads and saves, and turns each frame into game events
  panels/        The UI, one file per panel: TopBar, Markers, Plot, Lesson, FlightLog,
                 Chrome (hints and toasts), Brief (facts and market), Dock, OrbitLevels
  kit.ts         What the panels share: the store, the engine, and per-frame painters
  store.ts       Game state and its actions, in one zustand store
  engine.ts      Simulation: flight model, autopilot, orbits, laps, HUD projection
  renderer.ts    Draws each frame: WebGL2, or a 2D canvas fallback
  shaders/       GLSL for the background, stars, planets, ship, and trail
  input.ts       Pointer, keys, wheel, gaze, and gamepads, turned into a steering stick
  gamepad.ts     Gamepad reading: dead zone, button presses, the button map
  handsfree.ts   Hands-free gaze: what is in the sights, the dwell, the long blink
  camera.ts      Where the camera sits for each view
  flight.ts      Orbit and capture geometry
  hud.ts         Range text and the minimap plot
  types.ts       The engine's public types
  gl.ts, ship-mesh.ts, math.ts   Shader linking, the ship model, shared math
  system.ts      Solar-system bodies, chapters, orbit math
  journey.ts     Places beyond the Sun
  tasks.ts       Flight-log challenges for every chapter, and their detection
  trade.ts       Prices and station income
  saves.ts       The versioned save, and reading the older per-part keys
  gaze.ts        Webcam gaze steering
  audio.ts       Engine sound, chapter ambience, and cues
  lessons.ts     The help cards' text
  trial.ts       The daily trial: the day's course, the flight record, and its scoring
  board.ts       The trial's leaderboard: callsigns, posting rules, D1 and in-memory stores
  leaderboard.ts Server functions for the board
  *.test.ts      Unit tests for the logic files, run with Node's test runner
src/routes/      TanStack Start routes
d1/migrations/   The leaderboard's D1 schema
```

## Stack and deploy

React 19, TanStack Start, Tailwind v4, and raw WebGL2 (no engine). Nitro builds the server for one of two targets. `vite.config.ts` picks the target from the Vite mode:

- **Vercel** (default). `npm run build`, and every build Grok runs.
- **Cloudflare Workers** at `starward.<your-subdomain>.workers.dev`. `npm run build:cloudflare` builds with `--mode cloudflare`. Nitro merges `wrangler.jsonc` into the generated `.output/server/wrangler.json`, and `wrangler deploy` from the repo root uses that generated file.

### First Cloudflare deploy

Deploy either way:

- **From GitHub (Workers Builds).** In the dashboard, go to Workers & Pages, create a Worker named `starward`, and connect this repository. Set the build command to `npm run build:cloudflare` and leave the deploy command as `npx wrangler deploy`. Every push to `main` then deploys. The Worker name has to match `name` in `wrangler.jsonc`.
- **From your machine.** Run `npx wrangler login`, then `npm run deploy:cloudflare`.

### The daily trial's leaderboard (Cloudflare D1)

The board lives in the D1 database `starward`, bound as `STARWARD_DB` in `wrangler.jsonc`. Its tables are created by the migrations in `d1/migrations`:

- `npm run deploy:cloudflare` applies them before it deploys.
- With Workers Builds, set the deploy command to `npx wrangler d1 migrations apply STARWARD_DB --remote && npx wrangler deploy`. If the build token can't reach D1, run `npx wrangler d1 migrations apply STARWARD_DB --remote` once from your machine instead.
- Locally, `npx wrangler d1 migrations apply STARWARD_DB --local`, then `npm run preview:cloudflare`. `npm run dev` keeps a board in memory instead.

How a post is checked: the client records the flight (position every 0.2 game seconds) and the server scores that record with the same code the client uses (`scoreTrace` in `trial.ts`). It has to start at the course start, never fly faster or turn harder than the ship can, and reach every stop in order; the posted time is the server's. A callsign belongs to the browser that first posted with it. Posts are limited to 20 per network per 10 minutes. None of this stops a determined cheat; sign-in can come later without losing the board.

Optional bot check with [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/): create a widget for the Worker's hostname, then set its keys on the Worker. When both are set, posting needs the check.

```sh
npx wrangler secret put TURNSTILE_SECRET
# The site key is public; a plain variable is fine:
#   "vars": { "TURNSTILE_SITE_KEY": "0x4AAAAAA..." } in wrangler.jsonc, or a dashboard variable.
```

`TRIAL_SALT` (a secret, optional) salts the daily network hashes kept for rate limiting.

Moderating: remove a run, or free a callsign.

```sh
npx wrangler d1 execute STARWARD_DB --remote --command "DELETE FROM runs WHERE day = '2026-10-10' AND key = 'callsign'"
npx wrangler d1 execute STARWARD_DB --remote --command "DELETE FROM pilots WHERE key = 'callsign'"
```

`key` is the callsign in lower case without spaces, dots, dashes or underscores.

To add a custom domain later, put a `routes` entry with `"custom_domain": true` in `wrangler.jsonc`. The domain has to be a zone in the same Cloudflare account, and Cloudflare then creates the DNS record and certificate on the next deploy.

## Built with Grok

The game was made in Grok App Builder, and some files still belong to that platform:

- `AGENTS.md` and `.grok/` hold Grok's build-agent instructions and skills.
- `scripts/grok-pwa-*`, `server/`, and `public/__grok/` add the install page, share-card tags, and the "Created with Grok" pill. The pill is a Grok project setting.
- `src/lib/auth`, `src/lib/db`, `src/lib/app-data`, and `src/lib/multiplayer` are template helpers. Sign-in and the Postgres database are off; the trial's board uses Cloudflare D1 instead (above).

`npm test` runs Grok's template tests. Eight of them fail here, because they expect template defaults but read this project's share-card settings in `src/lib/og/site.json`.
