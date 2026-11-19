# Red Eclipse 2 — Cloud Portal, CI Build & VPS Deployment

Complete **GitHub → Supabase → Vercel** deployment stack for **Red Eclipse 2 (v2.0.0 Jupiter Edition, protocol 245)**.

## Architecture & Honest Constraints

- **Game server (`redeclipse_server_linux`) requires a VPS** with a public IPv4 and inbound **UDP 28801 & 28802** open. Neither Vercel nor Supabase can host UDP sockets.
- **Native desktop client is required** ([redeclipse.net/download](https://www.redeclipse.net/download)). Red Eclipse 2's C++/OpenGL renderer uses 144 `GL_TEXTURE_RECTANGLE` call sites and has no WebGL2/GLES3 browser path.
- **Vercel (`public/index.html`, `api/status.js`, `api/leaderboard.js`)** hosts the portal, status proxy, and Supabase leaderboard reader.
- **Supabase (`supabase/schema.sql`, `supabase/functions/record-match/index.ts`)** stores persistent `players`, `matches`, `match_players`, the `leaderboard` view, and the `record-match` Edge Function.
- **GitHub Actions (`.github/workflows/build-server.yml`)** builds `redeclipse_server_linux` from `redeclipse/base@v2.0.0` via `make server`.

## Repository Layout

- `.github/workflows/build-server.yml` — GitHub Actions CI building `redeclipse_server_linux`
- `api/status.js` — Vercel serverless status proxy (`STATUS_AGENT_URL`)
- `api/leaderboard.js` — Vercel serverless leaderboard & recent matches reader (`SUPABASE_URL`, `SUPABASE_ANON_KEY`)
- `public/index.html` — self-contained status + leaderboard portal (inline CSS/JS, `redeclipse://` join button)
- `status-agent/query.js` — UDP port `28802` status query client (v2.0.0 binary wire protocol)
- `status-agent/agent.js` — HTTP-to-UDP status bridge for the VPS
- `supabase/schema.sql` — idempotent Postgres schema + `record_match` RPC + RLS policies
- `supabase/functions/record-match/index.ts` — Edge Function ingesting match summaries using `GAME_SERVER_TOKEN`
- `server/servinit.cfg` & `server/redeclipse.service` — verified server config (`0` unknown commands) & systemd unit
- `tools/enet_join.cpp` — ENet `N_CONNECT` / `N_SERVERINIT` / `N_WELCOME` verification harness
- `tests/verify.js` — offline end-to-end verification test (`npm test`)

## Quick Verification

```bash
npm test
```

## Connecting a VPS Game Server

1. Download the `redeclipse-server` artifact from GitHub Actions (`build-server`), or build `make -j$(nproc) server` from `redeclipse/base@v2.0.0`.
2. Deploy `server/servinit.cfg` to `/home/rede/.redeclipse/servinit.cfg` and `server/redeclipse.service` to `/etc/systemd/system/`.
3. Open UDP ports `28801` (game) and `28802` (status/ping), and start `status-agent/agent.js` on the VPS.
4. Set `STATUS_AGENT_URL` in Vercel Project Settings to point to your VPS status agent (behind HTTPS or firewall).
5. Post completed match JSON to your Supabase `record-match` Edge Function with header `x-server-token: <GAME_SERVER_TOKEN>`.
