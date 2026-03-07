import { getRoomSnapshot } from "@/lib/gameStore"
import { fail, ok } from "@/lib/api"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const roomId = searchParams.get("roomId")
  const playerId = searchParams.get("playerId") ?? undefined

  if (!roomId) {
    return fail("roomId is required.")
  }

  try {

    const room = await getRoomSnapshot(roomId, playerId)
    return ok({ room })
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : "Unable to load room.", 404)
  }
}
