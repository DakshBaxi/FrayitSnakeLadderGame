import { fail, ok } from "@/lib/api"
import {
  disposeVoiceClient,
  ensureFrayitInitialized,
  ensureVoiceClientInitialized,
  getVoiceChannelId,
} from "@/lib/frayit"
import { leaveRoom } from "@/lib/gameStore"

export const runtime = "nodejs"

interface LeaveRoomBody {
  playerId?: string
  roomId?: string
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as LeaveRoomBody
    const playerId = body.playerId?.trim()
    const roomId = body.roomId?.trim()

    if (!playerId || !roomId) {
      return fail("playerId and roomId are required.")
    }

    await leaveVoiceParticipant(playerId, roomId)

    const result = await leaveRoom(roomId, playerId)
    if (result.roomClosed) {
      await closeVoiceChannel(roomId)
    }

    return ok(result)
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : "Unable to leave room.", 500)
  }
}

async function leaveVoiceParticipant(playerId: string, roomId: string): Promise<void> {
  try {
    const client = await ensureVoiceClientInitialized(playerId, roomId)
    await client.leaveVoiceChannel({
      channel_id: getVoiceChannelId(roomId),
      player_id: playerId,
    })
  } catch {
    // Ignore voice leave failures so room cleanup can still complete.
  } finally {
    disposeVoiceClient(playerId, roomId)
  }
}

async function closeVoiceChannel(roomId: string): Promise<void> {
  try {
    const client = await ensureFrayitInitialized()
    await client.closeVoiceChannel(getVoiceChannelId(roomId))
  } catch {
    // Ignore close failures if the channel is already gone.
  }
}
