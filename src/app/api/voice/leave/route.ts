import { fail, ok } from "@/lib/api"
import { disposeVoiceClient, ensureVoiceClientInitialized, getVoiceChannelId } from "@/lib/frayit"

export const runtime = "nodejs"

interface VoiceLeaveBody {
  playerId?: string
  roomId?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VoiceLeaveBody
    const playerId = body.playerId?.trim()
    const roomId = body.roomId?.trim()

    if (!playerId || !roomId) {
      return fail("playerId and roomId are required.")
    }

    const client = await ensureVoiceClientInitialized(playerId, roomId)
    const result = await client.leaveVoiceChannel({
      channel_id: getVoiceChannelId(roomId),
      player_id: playerId,
    })

    disposeVoiceClient(playerId, roomId)
    return ok({ result })
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : "Unable to leave voice channel.", 500)
  }
}
