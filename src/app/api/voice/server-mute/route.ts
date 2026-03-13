import { fail, ok } from "@/lib/api"
import { ensureFrayitInitialized, getVoiceChannelId } from "@/lib/frayit"

export const runtime = "nodejs"

interface VoiceServerMuteBody {
  roomId?: string
  targetPlayerId?: string
  muted?: boolean
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VoiceServerMuteBody
    const roomId = body.roomId?.trim()
    const targetPlayerId = body.targetPlayerId?.trim()

    if (!roomId || !targetPlayerId || typeof body.muted !== "boolean") {
      return fail("roomId, targetPlayerId, and boolean muted are required.")
    }

    const client = await ensureFrayitInitialized()
    const result = await client.setServerMute({
      channel_id: getVoiceChannelId(roomId),
      player_id: targetPlayerId,
      muted: body.muted,
    })

    return ok({ result })
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : "Unable to update server mute.", 500)
  }
}
