import {
  DiceRoll,
  GameMoveResult,
  LADDERS,
  PLAYER_COLORS,
  RoomSnapshot,
  RoomState,
  SNAKES,
} from "./gameTypes"
import { initDb, isDbEnabled, getDbPool } from "./db"

const roomStore = getRoomStore()

export async function createRoom(playerId: string, playerName: string): Promise<RoomSnapshot> {
  const roomId = await generateRoomId()
  const now = Date.now()

  const room: RoomState = {
    roomId,
    status: "lobby",
    players: [
      {
        id: playerId,
        name: sanitizeName(playerName),
        color: PLAYER_COLORS[0],
        position: 0,
        wins: 0,
        connected: true,
        joinedAt: now,
        lastSeenAt: now,
      },
    ],
    turnIndex: 0,
    createdAt: now,
    updatedAt: now,
    diceHistory: [],
  }

  await persistRoom(room)
  return snapshotFor(room, playerId)
}

export async function joinRoom(roomId: string, playerId: string, playerName: string): Promise<RoomSnapshot> {
  const room = await getRoomOrThrow(roomId)

  const now = Date.now()
  const existing = room.players.find((player) => player.id === playerId)
  if (existing) {
    existing.name = sanitizeName(playerName)
    existing.connected = true
    existing.lastSeenAt = now
    room.updatedAt = now
    await persistRoom(room)
    return snapshotFor(room, playerId)
  }

  if (room.players.length >= 4) {
    throw new Error("Room is full. Max 4 players allowed.")
  }

  room.players.push({
    id: playerId,
    name: sanitizeName(playerName),
    color: PLAYER_COLORS[room.players.length],
    position: 0,
    wins: 0,
    connected: true,
    joinedAt: now,
    lastSeenAt: now,
  })

  room.updatedAt = now
  await persistRoom(room)
  return snapshotFor(room, playerId)
}

export async function getRoomSnapshot(roomId: string, playerId?: string): Promise<RoomSnapshot> {
  const room = await getRoomOrThrow(roomId)

  if (playerId) {
    const player = room.players.find((entry) => entry.id === playerId)
    if (player) {
      player.connected = true
      player.lastSeenAt = Date.now()
      room.updatedAt = Date.now()
      await persistRoom(room)
    }
  }

  return snapshotFor(room, playerId)
}

export async function startGame(roomId: string, playerId: string): Promise<RoomSnapshot> {
  const room = await getRoomOrThrow(roomId)

  if (room.players.length < 2) {
    throw new Error("Need at least 2 players to start.")
  }

  if (room.players[0]?.id !== playerId) {
    throw new Error("Only room host can start the game.")
  }

  const now = Date.now()
  room.status = "active"
  room.winnerId = undefined
  room.turnIndex = 0
  room.diceHistory = []
  for (const player of room.players) {
    player.position = 0
  }
  room.updatedAt = now

  await persistRoom(room)
  return snapshotFor(room, playerId)
}

export async function rollDice(roomId: string, playerId: string): Promise<GameMoveResult> {
  const room = await getRoomOrThrow(roomId)

  if (room.status !== "active") {
    throw new Error("Game is not active.")
  }

  const turnPlayer = room.players[room.turnIndex]
  if (!turnPlayer || turnPlayer.id !== playerId) {
    throw new Error("Not your turn.")
  }

  const roll = Math.floor(Math.random() * 6) + 1
  const from = turnPlayer.position
  let to = from + roll
  let movedBySnakeOrLadder = false
  let note: string | undefined

  if (to > 100) {
    to = from
    note = "Need exact roll to reach 100"
  } else {
    if (LADDERS[to]) {
      to = LADDERS[to]
      movedBySnakeOrLadder = true
      note = "Ladder boost"
    } else if (SNAKES[to]) {
      to = SNAKES[to]
      movedBySnakeOrLadder = true
      note = "Snake bite"
    }
  }

  turnPlayer.position = to

  const rollEntry: DiceRoll = {
    playerId,
    value: roll,
    from,
    to,
    movedBySnakeOrLadder,
    note,
    at: Date.now(),
  }
  room.diceHistory = [rollEntry, ...room.diceHistory].slice(0, 20)

  if (to === 100) {
    room.status = "finished"
    room.winnerId = playerId
    turnPlayer.wins += 1
  } else {
    room.turnIndex = (room.turnIndex + 1) % room.players.length
  }

  room.updatedAt = Date.now()
  await persistRoom(room)

  return {
    room: snapshotFor(room, playerId),
    roll: rollEntry,
  }
}

function snapshotFor(room: RoomState, playerId?: string): RoomSnapshot {
  const players = room.players.map((player) => ({ ...player }))
  const me = playerId ? players.find((player) => player.id === playerId) : undefined

  return {
    roomId: room.roomId,
    status: room.status,
    players,
    turnIndex: room.turnIndex,
    createdAt: room.createdAt,
    updatedAt: room.updatedAt,
    winnerId: room.winnerId,
    diceHistory: room.diceHistory.map((item) => ({ ...item })),
    me,
    turnPlayerId: players[room.turnIndex]?.id,
  }
}

function sanitizeName(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) {
    throw new Error("Player name is required.")
  }

  return trimmed.slice(0, 24)
}

async function generateRoomId(): Promise<string> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

  for (let attempt = 0; attempt < 10; attempt += 1) {
    let roomId = ""
    for (let i = 0; i < 6; i += 1) {
      roomId += alphabet[Math.floor(Math.random() * alphabet.length)]
    }

    if (!(await roomExists(roomId))) {
      return roomId
    }
  }

  throw new Error("Unable to allocate room right now.")
}

async function roomExists(roomId: string): Promise<boolean> {
  const safeRoomId = roomId.toUpperCase()

  if (!isDbEnabled()) {
    return roomStore.has(safeRoomId)
  }

  await initDb()
  const result = await getDbPool().query<{ exists: boolean }>(
    "SELECT EXISTS(SELECT 1 FROM rooms WHERE id = $1) AS exists",
    [safeRoomId]
  )

  return result.rows[0]?.exists ?? false
}

async function getRoomOrThrow(roomId: string): Promise<RoomState> {
  const safeRoomId = roomId.toUpperCase()

  if (!isDbEnabled()) {
    const cached = roomStore.get(safeRoomId)
    if (cached) {
      return cached
    }
    throw new Error("Room not found.")
  }

  await initDb()
  const result = await getDbPool().query<{ state: RoomState }>(
    "SELECT state FROM rooms WHERE id = $1",
    [safeRoomId]
  )

  const row = result.rows[0]
  if (!row) {
    throw new Error("Room not found.")
  }

  return row.state
}

async function persistRoom(room: RoomState): Promise<void> {
  const safeRoomId = room.roomId.toUpperCase()

  if (!isDbEnabled()) {
    roomStore.set(safeRoomId, room)
    return
  }

  await initDb()
  await getDbPool().query(
    `
      INSERT INTO rooms (id, state, updated_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (id) DO UPDATE
      SET state = EXCLUDED.state,
          updated_at = NOW()
    `,
    [safeRoomId, room]
  )
}

function getRoomStore(): Map<string, RoomState> {
  const globalRef = globalThis as typeof globalThis & {
    __frayitRoomStore?: Map<string, RoomState>
  }

  if (!globalRef.__frayitRoomStore) {
    globalRef.__frayitRoomStore = new Map<string, RoomState>()
  }

  return globalRef.__frayitRoomStore
}
