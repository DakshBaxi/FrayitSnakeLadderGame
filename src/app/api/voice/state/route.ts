import { fail, ok } from "@/lib/api"
import { ensureFrayitInitialized, getVoiceChannelId } from "@/lib/frayit"

export const runtime = "nodejs"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const roomId = searchParams.get("roomId")?.trim()
    if (!roomId) {
      return fail("roomId is required.")
    }

    const client = await ensureFrayitInitialized()
    const voice = await client.getVoiceRoomState(getVoiceChannelId(roomId))
    return ok({ voice })
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : "Unable to load voice state.", 500)
  }
}
