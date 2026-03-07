# Frayit 4-Player Game

Production-ready multiplayer **Snakes & Ladders** (2-4 players) built to showcase Frayit moderated chat.

## Features

- 2, 3, or 4 player rooms
- Turn-based game with ladders, snakes, dice history, and winner tracking
- Player dashboards (position, turn, wins)
- Two live chats per room:
  - `Global Chat` (shared across rooms)
  - `Game Chat` (room-specific)
- All chat send + stream flow through `@frayit/sdk`

## Stack

- Next.js 16 (App Router, webpack mode) + TypeScript
- Postgres-backed room/game persistence (survives server restarts)
- Frayit SDK server-side for moderation and chat channel connection

## Environment

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Fill values:

- `FRAYIT_CLIENT_ID`
- `FRAYIT_CLIENT_SECRET`
- `FRAYIT_BASE_URL`
- `DATABASE_URL` (Postgres connection string)

## Run

```bash
npm install
npm run dev
```

Open: `http://localhost:3000`

## Postgres Setup

- Schema file: `db/schema.sql`
- Tables are also auto-created on first API access if `DATABASE_URL` is set.
- If `DATABASE_URL` is not set, app falls back to in-memory rooms (non-persistent).

## Game Flow

1. Player creates a room from lobby.
2. Friends join with room code.
3. Host starts game when at least 2 players are present.
4. Players roll only on their turn.
5. First to reach tile 100 wins.

## Chat Flow (Frayit)

- `POST /api/chat/send` uses `frayit.sendMessage(...)`
- `GET /api/chat/stream` uses `frayit.connectChat(...)` for:
  - `global-chat`
  - `game-<ROOM_ID>`
- Browser receives SSE events and renders chat live.

## Notes

- Do not expose Frayit secrets to browser; all SDK usage stays server-side.
