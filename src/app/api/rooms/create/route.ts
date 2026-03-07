import { createRoom } from "@/lib/gameStore"
import { fail, ok } from "@/lib/api"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { playerId?: string; playerName?: string }

    if (!body.playerId?.trim() || !body.playerName?.trim()) {
      return fail("playerId and playerName are required.")
    }

    const room = await createRoom(body.playerId.trim(), body.playerName.trim())
    return ok({ room })
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : "Unable to create room.", 500)
  }
}
