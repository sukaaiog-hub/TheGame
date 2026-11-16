# TuxKart Rush

A **SuperTuxKart-inspired 3D WebGL multiplayer arcade kart racing game** built for **3–4 players**, powered by **Next.js (App Router + TypeScript)**, **Three.js**, **Supabase (Postgres + Realtime Broadcast & Presence)**, and hosted on **Vercel**.

## Features

- **3–4 Player Online Multiplayer Lobbies**
  - Create or join rooms via 6-character invite codes (`?room=XXXXXX` direct link support) or the live public room browser.
  - Concurrent-safe Postgres seat reservation (`create_lobby_room`, `join_room_seat`, `leave_room_seat`, `reset_lobby_room`) supporting 2–4 human players plus optional AI bot backfill.
  - Sub-50ms state sync via **Supabase Realtime Broadcast & Presence** with smooth velocity extrapolation and packet reconciliation.
  - Synchronized countdown (`3 - 2 - 1 - GO!`), shared item box pickups, projectile combat, and post-race rematch flow.
- **3 Playable 3D Circuits**
  - **Lighthouse Bay** (Beginner) — sun-drenched coastal island loop
  - **Frozen Tundra** (Intermediate) — alpine snowways & rapid S-bends
  - **Magma Caldera** (Expert) — volcanic switchbacks above glowing lava
- **6 Iconic Karts & Arcade Physics**
  - **Tux**, **Wilber**, **Konqi**, **Sara**, **Hexley**, and **Puffy** with unique speed, acceleration, handling, drift boost, and weight stats.
  - Hop & drift charging (Blue → Orange → Purple Mini-Turbos), boost pads, off-road friction, smooth wall-scrape recovery, and checkpoint-validated laps.
- **SuperTuxKart-Style Power-Ups**
  - **Nitro Zipper**, **Bowling Ball**, **Homing Plunger**, **Bubblegum Shield**, and **Shockwave Swatter**.
- **Global Track Leaderboard**
  - Persisted in Supabase Postgres (`race_results`) via `/api/leaderboard`.

## Controls

- **Drive:** `WASD` or `Arrow Keys` (plus automatic on-screen touch controls on mobile)
- **Drift & Mini-Turbo:** `Space` or `Shift` while steering
- **Use Item:** `E` or `Enter`
- **Rescue onto Track:** `R`
- **Switch Camera:** `C`

## Local Development

1. Copy `.env.example` to `.env.local` and fill in your Supabase credentials:
   ```bash
   cp .env.example .env.local
   ```
2. Install dependencies and run tests:
   ```bash
   npm install
   npm run typecheck
   npm test
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
