import { startGame } from "@/lib/gameStore"
import { fail, ok } from "@/lib/api"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      roomId?: string
      playerId?: string
    }

    if (!body.roomId?.trim() || !body.playerId?.trim()) {
      return fail("roomId and playerId are required.")
    }

    const room = await startGame(body.roomId.trim(), body.playerId.trim())
    return ok({ room })
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : "Unable to start game.", 400)
  }
}
