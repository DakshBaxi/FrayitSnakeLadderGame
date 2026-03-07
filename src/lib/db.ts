import { Pool } from "pg"

let pool: Pool | null = null
let initPromise: Promise<void> | null = null

export function getDbPool(): Pool {
  if (pool) return pool

  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) {
    throw new Error("Missing DATABASE_URL environment variable. Set DATABASE_URL to your PostgreSQL connection string.")
  }

  pool = new Pool({ connectionString: databaseUrl })
  return pool
}

export function isDbEnabled(): boolean {
  return Boolean(process.env.DATABASE_URL)
}

export async function initDb(): Promise<void> {
  if (!isDbEnabled()) {
    return
  }

  if (initPromise) {
    return initPromise
  }

  initPromise = (async () => {
    const db = getDbPool()

    // Keep this small and simple so the app can start without migrations.
    await db.query(`
      CREATE TABLE IF NOT EXISTS rooms (
        id TEXT PRIMARY KEY,
        state JSONB NOT NULL,
        updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
      )
    `)
  })()

  return initPromise
}
