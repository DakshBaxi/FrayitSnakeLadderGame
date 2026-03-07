import { Pool } from "pg"
import { RoomState } from "@/lib/gameTypes"

let pool: Pool | null = null
let schemaReady = false
let schemaPromise: Promise<void> | null = null

export function persistenceEnabled(): boolean {
  return !!process.env.DATABASE_URL
}

export async function ensurePersistenceSchema(): Promise<void> {
  if (!persistenceEnabled()) {
    return
  }

  if (schemaReady) {
    return
  }

  if (!schemaPromise) {
    schemaPromise = createSchema().then(() => {
      schemaReady = true
    })
  }

  await schemaPromise
}

export async function saveRoomState(room: RoomState): Promise<void> {
  if (!persistenceEnabled()) {
    return
  }

  await ensurePersistenceSchema()

  const client = getPool()
  await client.query(
    `
      INSERT INTO game_rooms (room_id, state, updated_at)
      VALUES ($1, $2::jsonb, NOW())
      ON CONFLICT (room_id)
      DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()
    `,
    [room.roomId, JSON.stringify(room)]
  )
}

export async function loadRoomState(roomId: string): Promise<RoomState | null> {
  if (!persistenceEnabled()) {
    return null
  }

  await ensurePersistenceSchema()

  const client = getPool()
  const result = await client.query<{ state: RoomState }>(
    `SELECT state FROM game_rooms WHERE room_id = $1 LIMIT 1`,
    [roomId]
  )

  const payload = result.rows[0]?.state
  return payload ?? null
}

async function createSchema(): Promise<void> {
  const client = getPool()

  await client.query(`
    CREATE TABLE IF NOT EXISTS game_rooms (
      room_id TEXT PRIMARY KEY,
      state JSONB NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await client.query(`
    CREATE INDEX IF NOT EXISTS idx_game_rooms_updated_at
    ON game_rooms (updated_at DESC)
  `)
}

function getPool(): Pool {
  if (pool) {
    return pool
  }

  const connectionString = process.env.DATABASE_URL
  if (!connectionString) {
    throw new Error("DATABASE_URL is not configured.")
  }

  pool = new Pool({
    connectionString,
    max: 12,
    idleTimeoutMillis: 30000,
  })

  return pool
}
