import { FrayitClient } from "@frayit/sdk"
import { fail, ok } from "@/lib/api"
import { ensureVoiceClientInitialized } from "@/lib/frayit"
import { VoiceLocalStatePayload } from "@/lib/voiceTypes"

export const runtime = "nodejs"

type VoiceLocalAction =
  | "set_self_muted"
  | "set_self_deafened"
  | "set_peer_muted"
  | "check_peer_muted"
  | "check_peer_audio"
  | "snapshot"

interface VoiceLocalBody {
  playerId?: string
  roomId?: string
  action?: VoiceLocalAction
  targetPlayerId?: string
  muted?: boolean
  deafened?: boolean
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const playerId = searchParams.get("playerId")?.trim()
    const roomId = searchParams.get("roomId")?.trim()
    if (!playerId || !roomId) {
      return fail("playerId and roomId are required.")
    }

    const client = await ensureVoiceClientInitialized(playerId, roomId)
    return ok({ local: toLocalState(client, playerId, roomId) })
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : "Unable to load local voice state.", 500)
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as VoiceLocalBody
    const playerId = body.playerId?.trim()
    const roomId = body.roomId?.trim()
    const action = body.action

    if (!playerId || !roomId || !action) {
      return fail("playerId, roomId, and action are required.")
    }

    const client = await ensureVoiceClientInitialized(playerId, roomId)
    let isPeerMuted: boolean | undefined
    let shouldPlayAudio: boolean | undefined

    switch (action) {
      case "set_self_muted":
        if (typeof body.muted !== "boolean") {
          return fail("muted boolean is required for set_self_muted.")
        }
        client.setSelfMuted(body.muted)
        break
      case "set_self_deafened":
        if (typeof body.deafened !== "boolean") {
          return fail("deafened boolean is required for set_self_deafened.")
        }
        client.setSelfDeafened(body.deafened)
        break
      case "set_peer_muted":
        if (!body.targetPlayerId?.trim() || typeof body.muted !== "boolean") {
          return fail("targetPlayerId and muted boolean are required for set_peer_muted.")
        }
        client.setPeerMutedLocally(body.targetPlayerId, body.muted)
        break
      case "check_peer_muted":
        if (!body.targetPlayerId?.trim()) {
          return fail("targetPlayerId is required for check_peer_muted.")
        }
        isPeerMuted = client.isPeerMutedLocally(body.targetPlayerId)
        break
      case "check_peer_audio":
        if (!body.targetPlayerId?.trim()) {
          return fail("targetPlayerId is required for check_peer_audio.")
        }
        shouldPlayAudio = client.shouldPlayPeerAudio(body.targetPlayerId)
        break
      case "snapshot":
        break
      default:
        return fail("Unsupported local voice action.")
    }

    return ok({
      local: toLocalState(client, playerId, roomId, isPeerMuted, shouldPlayAudio),
    })
  } catch (error: unknown) {
    return fail(error instanceof Error ? error.message : "Unable to update local voice state.", 500)
  }
}

function toLocalState(
  client: FrayitClient,
  playerId: string,
  roomId: string,
  isPeerMuted?: boolean,
  shouldPlayAudio?: boolean
): VoiceLocalStatePayload {
  return {
    playerId,
    roomId: roomId.toUpperCase(),
    selfMuted: client.isSelfMuted,
    selfDeafened: client.isSelfDeafened,
    peerMuteMap: client.getPeerMuteMapSnapshot(),
    isPeerMuted,
    shouldPlayAudio,
  }
}
