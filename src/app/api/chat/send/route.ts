import { ensureFrayitInitialized } from "@/lib/frayit"
import { fail, ok } from "@/lib/api"
import { ChatScope } from "@/lib/chatTypes"

interface SendChatBody {
  playerId?: string
  roomId?: string
  message?: string
  scope?: ChatScope
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as SendChatBody

    const playerId = body.playerId?.trim()
    const roomId = body.roomId?.trim()
    const message = body.message?.trim()
    const scope = body.scope

    if (!playerId || !message || !scope) {
      return fail("playerId, message and scope are required.")
    }

    if (scope === "game" && !roomId) {
      return fail("roomId is required for game chat.")
    }

    const channelId = scope === "global" ? "global-chat" : `game-${roomId}`
    const sessionId = scope === "global" ? "global-lobby" : `room-${roomId}`

    const client = await ensureFrayitInitialized()
    const result = await client.sendMessage({
      player_id: playerId,
      session_id: sessionId,
      channel_id: channelId,
      message,
    })
    console.log(result);
    return ok({ result })
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : "Unable to send message.", 500)
  }
}
