# Starward

Fly a real solar system, then the near stars, the Milky Way, and the galaxy clusters beyond. A WebGL2 flight game that runs in the browser.

## The game

- **Five chapters:** Round the Sun, The Near Stars, The Milky Way, Out of the Galaxy, and The Web. Chart every place in a chapter to open the next one.
- **Real places.** Sizes and orbital periods are real. Distances are compressed so a flight can cross them.
- **Flight log.** Twenty challenges, a set for every chapter: an eclipse and a ring cut round the Sun, a corona skim in the near stars, a dive to the galactic core, a postcard of home from beyond Andromeda, a brush past the Great Attractor, and a run to the edge of the map. Each is logged with your time.
- **Trade and stations.** Buy goods where they are cheap, sell where they are dear, and deploy stations that pay while you fly.
- **Cameras and steering.** Cockpit, chase, either wing, and overhead views. Three orbit heights, autopilot, and optional webcam gaze steering that runs on the device (MediaPipe).
- **No account.** Progress saves in the browser, in one versioned `starward-save` entry.

### Controls

| Input | Action |
| --- | --- |
| Drag the sky | Steer |
| A / D | Turn |
| W / S | Pitch |
| Space | Warp |
| Escape | Pause |
| Double-tap a world | Fly there and orbit it |

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
| `npm run deploy:cloudflare` | Build for Workers and deploy with Wrangler |

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
  input.ts       Pointer, keys, wheel, and gaze, turned into a steering stick
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
  audio.ts       Engine sound
  *.test.ts      Unit tests for the logic files, run with Node's test runner
src/routes/      TanStack Start routes
```

## Stack and deploy

React 19, TanStack Start, Tailwind v4, and raw WebGL2 (no engine). Nitro builds the server for one of two targets. `vite.config.ts` picks the target from the Vite mode:

- **Vercel** (default). `npm run build`, and every build Grok runs.
- **Cloudflare Workers** at `starward.<your-subdomain>.workers.dev`. `npm run build:cloudflare` builds with `--mode cloudflare`. Nitro merges `wrangler.jsonc` into the generated `.output/server/wrangler.json`, and `wrangler deploy` from the repo root uses that generated file.

### First Cloudflare deploy

Deploy either way:

- **From GitHub (Workers Builds).** In the dashboard, go to Workers & Pages, create a Worker named `starward`, and connect this repository. Set the build command to `npm run build:cloudflare` and leave the deploy command as `npx wrangler deploy`. Every push to `main` then deploys. The Worker name has to match `name` in `wrangler.jsonc`.
- **From your machine.** Run `npx wrangler login`, then `npm run deploy:cloudflare`.

To add a custom domain later, put a `routes` entry with `"custom_domain": true` in `wrangler.jsonc`. The domain has to be a zone in the same Cloudflare account, and Cloudflare then creates the DNS record and certificate on the next deploy.

## Built with Grok

The game was made in Grok App Builder, and some files still belong to that platform:

- `AGENTS.md` and `.grok/` hold Grok's build-agent instructions and skills.
- `scripts/grok-pwa-*`, `server/`, and `public/__grok/` add the install page, share-card tags, and the "Created with Grok" pill. The pill is a Grok project setting.
- `src/lib/auth`, `src/lib/db`, `src/lib/app-data`, and `src/lib/multiplayer` are template helpers. Sign-in and the database are off.

`npm test` runs Grok's template tests. Eight of them fail here, because they expect template defaults but read this project's share-card settings in `src/lib/og/site.json`.
