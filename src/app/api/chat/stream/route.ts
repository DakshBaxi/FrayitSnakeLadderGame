import { ChatChannel, ChatEvent } from "@frayit/sdk"
import { ensureFrayitInitialized } from "@/lib/frayit"
import { ChatScope, StreamChatEvent } from "@/lib/chatTypes"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const playerId = searchParams.get("playerId")?.trim()
  const roomId = searchParams.get("roomId")?.trim()

  if (!playerId || !roomId) {
    return new Response("playerId and roomId are required", { status: 400 })
  }

  const encoder = new TextEncoder()
  let globalChannel: ChatChannel | null = null
  let gameChannel: ChatChannel | null = null
  let heartbeat: ReturnType<typeof setInterval> | null = null
  let closed = false

  const closeConnections = async (): Promise<void> => {
    if (closed) {
      return
    }

    closed = true

    if (heartbeat) {
      clearInterval(heartbeat)
      heartbeat = null
    }

    await Promise.all([
      globalChannel?.dispose().catch(() => undefined),
      gameChannel?.dispose().catch(() => undefined),
    ])

    globalChannel = null
    gameChannel = null
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (payload: StreamChatEvent): void => {
        if (closed) {
          return
        }
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`))
      }

      const sendSystem = (message: string): void => {
        send({
          scope: "global",
          event: "SYSTEM",
          message,
          sentAt: Date.now(),
        })
      }

      const connect = async (): Promise<void> => {
        try {
          const client = await ensureFrayitInitialized()

          globalChannel = await client.connectChat(playerId, "global-chat", {
            onMessage: (event) => send(toStreamEvent("global", event)),
            onDelete: (event) => send(toStreamEvent("global", event)),
            onJoined: (event) => send(toStreamEvent("global", event)),
            onError: (error) => sendSystem(`Global chat error: ${error.message}`),
          })

          gameChannel = await client.connectChat(playerId, `game-${roomId}`, {
            onMessage: (event) => send(toStreamEvent("game", event)),
            onDelete: (event) => send(toStreamEvent("game", event)),
            onJoined: (event) => send(toStreamEvent("game", event)),
            onError: (error) => sendSystem(`Game chat error: ${error.message}`),
          })

          heartbeat = setInterval(() => {
            if (!closed) {
              controller.enqueue(encoder.encode(`: ping ${Date.now()}\n\n`))
            }
          }, 20000)

          sendSystem("Connected to Frayit global and game channels.")
        } catch (error: unknown) {
          sendSystem(error instanceof Error ? error.message : "Unable to connect chat.")
          await closeConnections()
          controller.close()
        }
      }

      void connect()

      const onAbort = (): void => {
        void closeConnections().finally(() => {
          controller.close()
        })
      }

      request.signal.addEventListener("abort", onAbort, { once: true })
    },
    async cancel() {
      await closeConnections()
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  })
}

function toStreamEvent(scope: ChatScope, event: ChatEvent): StreamChatEvent {
  return {
    scope,
    event: event.type === "DELETE" ? "DELETE" : event.type === "JOINED" ? "JOINED" : "MESSAGE",
    messageId: event.message_id,
    playerId: event.player_id,
    channelId: event.channel_id,
    message: event.message,
    sentAt: event.sent_at,
    gameId: event.game_id,
  }
}
