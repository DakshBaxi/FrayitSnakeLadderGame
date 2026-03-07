import { joinRoom } from "@/lib/gameStore"
import { fail, ok } from "@/lib/api"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomId?: string
      playerId?: string
      playerName?: string
    }

    if (!body.roomId?.trim() || !body.playerId?.trim() || !body.playerName?.trim()) {
      return fail("roomId, playerId and playerName are required.")
    }

    const room = await joinRoom(body.roomId.trim(), body.playerId.trim(), body.playerName.trim())
    return ok({ room })
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : "Unable to join room.", 400)
  }
}
