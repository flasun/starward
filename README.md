# Starward

Fly a real solar system, then the near stars, the Milky Way, and the galaxy clusters beyond. A WebGL2 flight game that runs in the browser.

## The game

- **Five chapters:** Round the Sun, The Near Stars, The Milky Way, Out of the Galaxy, and The Web. Chart every place in a chapter to open the next one.
- **Real places.** Sizes and orbital periods are real. Distances are compressed so a flight can cross them.
- **Flight log.** Eight challenges (soft arrival, slingshot, ring cut, eclipse, and more) are logged with your time.
- **Trade and stations.** Buy goods where they are cheap, sell where they are dear, and deploy stations that pay while you fly.
- **Cameras and steering.** Cockpit, chase, either wing, and overhead views. Three orbit heights, autopilot, and optional webcam gaze steering that runs on the device (MediaPipe).
- **No account.** Progress saves in the browser.

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
| `npm run build` | Production build into `.vercel/output` |
| `npm run preview:restart` | Serve the production build on `127.0.0.1:8081` |

CI (`.github/workflows/ci.yml`) runs typecheck, lint, and build on every pull request.

## Code map

```
src/components/starfield/
  Starward.tsx   React UI and game state: HUD, nav, briefings, market, log
  engine.ts      WebGL2 renderer, flight model, cameras, input
  system.ts      Solar-system bodies, chapters, orbit math
  journey.ts     Places beyond the Sun
  tasks.ts       Flight-log challenge detection
  trade.ts       Prices and station income
  saves.ts       Carries saves over from the old Slipstream name
  gaze.ts        Webcam gaze steering
  audio.ts       Engine sound
src/routes/      TanStack Start routes
```

## Stack and deploy

React 19, TanStack Start, Tailwind v4, and raw WebGL2 (no engine). Nitro builds for Vercel (`preset: "vercel"` in `vite.config.ts`).

## Built with Grok

The game was made in Grok App Builder, and some files still belong to that platform:

- `AGENTS.md` and `.grok/` hold Grok's build-agent instructions and skills.
- `scripts/grok-pwa-*`, `server/`, and `public/__grok/` add the install page, share-card tags, and the "Created with Grok" pill. The pill is a Grok project setting.
- `src/lib/auth`, `src/lib/db`, `src/lib/app-data`, and `src/lib/multiplayer` are template helpers. Sign-in and the database are off.

`npm test` runs Grok's template tests. Eight of them fail here, because they expect template defaults but read this project's share-card settings in `src/lib/og/site.json`.
