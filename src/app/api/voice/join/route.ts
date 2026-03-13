import { fail, ok } from "@/lib/api"
import { ensureVoiceClientInitialized, getVoiceChannelId, getVoiceSessionId } from "@/lib/frayit"

export const runtime = "nodejs"

interface VoiceJoinBody {
  playerId?: string
  roomId?: string
  maxParticipants?: number
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VoiceJoinBody
    const playerId = body.playerId?.trim()
    const roomId = body.roomId?.trim()
    const maxParticipants = body.maxParticipants

    if (!playerId || !roomId) {
      return fail("playerId and roomId are required.")
    }

    const client = await ensureVoiceClientInitialized(playerId, roomId)
    const voice = await client.joinVoiceChannel({
      channel_id: getVoiceChannelId(roomId),
      player_id: playerId,
      session_id: getVoiceSessionId(roomId),
      max_participants:
        typeof maxParticipants === "number" && Number.isFinite(maxParticipants)
          ? maxParticipants
          : undefined,
    })

    return ok({ voice })
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : "Unable to join voice channel.", 500)
  }
}
