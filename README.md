# Frayit 4-Player Game

Production-ready multiplayer **Snakes & Ladders** (2-4 players) built to showcase Frayit moderated chat and voice control APIs.

## Features

- 2, 3, or 4 player rooms
- Turn-based game with ladders, snakes, dice history, and winner tracking
- Player dashboards (position, turn, wins)
- Two live chats per room:
  - `Global Chat` (shared across rooms)
  - `Game Chat` (room-specific)
- Team voice per room:
  - Auto-joins when player enters the room
  - Starts muted like common multiplayer games
  - Simple in-game controls for mic, voice audio, and per-player local mute
  - Live participant roster backed by Frayit voice state
- All chat + voice flows through local `@frayit/sdk` reference

## Stack

- Next.js 16 (App Router, webpack mode) + TypeScript
- In-memory room/game persistence (resets on server restart)
- Frayit SDK server-side for moderation and voice control

## Environment

Create `.env.local` from `.env.example`:

```bash
cp .env.example .env.local
```

Fill values:

- `FRAYIT_CLIENT_ID`
- `FRAYIT_CLIENT_SECRET`
- `FRAYIT_BASE_URL`
- `FRAYIT_CHAT_TIMEOUT_MS` (optional)
- `FRAYIT_VOICE_TIMEOUT_MS` (optional)

## Run

```bash
npm install
npm run dev
```

Open: `http://localhost:3000`

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

## Voice Flow (Frayit)

- Room UI auto-calls `POST /api/voice/join` when player enters the room
- Browser then connects to LiveKit using returned `livekit_url` + `livekit_token`
- Room UI uses `GET /api/voice/state` to keep the roster fresh
- Room UI uses `GET/POST /api/voice/local` for:
  - `setSelfMuted`, `setSelfDeafened`
  - `setPeerMutedLocally`
- `POST /api/voice/leave` is called on room cleanup

## Notes

- SDK is consumed locally from `file:../frayit_sdk_ts` in `package.json`, so publishing is not required for testing.
- Do not expose Frayit secrets to browser; all SDK usage stays server-side.
