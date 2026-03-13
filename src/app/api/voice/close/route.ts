import { fail, ok } from "@/lib/api"
import { ensureFrayitInitialized, getVoiceChannelId } from "@/lib/frayit"

export const runtime = "nodejs"

interface VoiceCloseBody {
  roomId?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VoiceCloseBody
    const roomId = body.roomId?.trim()
    if (!roomId) {
      return fail("roomId is required.")
    }

    const client = await ensureFrayitInitialized()
    const result = await client.closeVoiceChannel(getVoiceChannelId(roomId))
    return ok({ result })
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : "Unable to close voice channel.", 500)
  }
}
