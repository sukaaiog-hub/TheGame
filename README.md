# Red Eclipse 2 — Play in Browser + VPS & Stats Deploy

Self-contained **zero-download browser-playable** Red Eclipse 2 arena FPS (WebGL2 / Three.js + Impulse Parkour + 10 RE2 Weapons + AI Bots + Supabase Realtime Online Rooms + Persistent Leaderboard), alongside the dedicated native server build, VPS status bridge, and Supabase schema.

## Play Immediately (Zero Downloads)

Open the deployed Vercel portal (`https://redeclipse-deploy.vercel.app`) and click **PLAY NOW IN BROWSER**:
- **Modes**: Deathmatch, Team Deathmatch, Instagib (one-shot Laser Rifle), Parkour Impulse Trial
- **Maps**: `rift` (Rift Citadel), `processing` (Processing Plant), `ares` (Ares Orbital)
- **Movement**: Double jump, wall-run with camera tilt, wall-kick boost, `Shift` Impulse Dash, `C` crouch-slide, jump pads, rocket jumping
- **Online Multiplayer**: Create or join a 6-character room powered by Supabase Realtime (no VPS required)
- **Persistent Stats**: Completed browser matches automatically record to Supabase (`players`, `matches`, `match_players`, `leaderboard`) via `/api/record-browser-match`

## Repository Layout

- `src/` — Browser arena engine (`weapons.js`, `maps.js`, `physics.js`, `audio.js`, `bots.js`, `multiplayer.js`, `renderer.js`, `game-engine.js`, `game-entry.js`)
- `scripts/build.mjs` — `esbuild` bundler creating self-contained `public/game.bundle.js`
- `public/index.html` — Launcher portal, leaderboard, native VPS tab, and fullscreen FPS HUD
- `api/` — Vercel serverless handlers: `config.js`, `record-browser-match.js`, `status.js`, `leaderboard.js`
- `status-agent/` — UDP ping-port (`28802`) query parser (`query.js`) and HTTP bridge (`agent.js`) for optional native VPS
- `supabase/` — Postgres schema + `record-match` Edge Function
- `server/` — `servinit.cfg` & hardened `redeclipse.service` systemd unit
- `tools/enet_join.cpp` — Standalone ENet protocol 245 join verification harness
- `.github/workflows/build-server.yml` — CI building `redeclipse_server_linux` from `redeclipse/base@v2.0.0` and running browser/API tests
- `tests/` — End-to-end offline tests (`verify.js`) + Vitest unit suite (`game.test.js`)

## Local Development & Verification

```bash
npm install
npm run build
npm test
```
