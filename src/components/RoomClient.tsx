"use client"

import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { SnakesBoard } from "@/components/SnakesBoard"
import { PlayerState, RoomSnapshot } from "@/lib/gameTypes"
import { StreamChatEvent } from "@/lib/chatTypes"

type ChatScope = "global" | "game"

interface ChatMessage {
  id: string
  scope: ChatScope
  text: string
  playerId?: string
  at: number
  system?: boolean
  type?: "MESSAGE" | "DELETE" | "JOINED" | "SYSTEM"
}

const PLAYER_NAME_KEY = "frayit_player_name"
const PLAYER_ID_KEY = "frayit_player_id"

const colorMap: Record<string, string> = {
  crimson: "#ff6d7d",
  emerald: "#2ce5a7",
  amber: "#ffc15a",
  azure: "#57b9ff",
}

interface RoomClientProps {
  roomId: string
}

export function RoomClient({ roomId }: RoomClientProps) {
  const [playerId, setPlayerId] = useState("")
  const [playerName, setPlayerName] = useState("")
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState(false)
  const [error, setError] = useState("")
  const [chatInput, setChatInput] = useState("")
  const [chatScope, setChatScope] = useState<ChatScope>("game")
  const [globalChat, setGlobalChat] = useState<ChatMessage[]>([])
  const [gameChat, setGameChat] = useState<ChatMessage[]>([])
  const [chatLatencyMs, setChatLatencyMs] = useState<number | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const startedRef = useRef(false)
  const seenChatIdsRef = useRef<Set<string>>(new Set())

  const me = room?.me
  const canStart = room?.players?.[0]?.id === playerId && room.status !== "active" && (room.players.length ?? 0) >= 2
  const canRoll = room?.status === "active" && room.turnPlayerId === playerId

  const activeChat = chatScope === "global" ? globalChat : gameChat

  const playerById = useMemo(() => {
    const map = new Map<string, PlayerState>()
    for (const player of room?.players ?? []) {
      map.set(player.id, player)
    }
    return map
  }, [room?.players])

  useEffect(() => {
    const name = localStorage.getItem(PLAYER_NAME_KEY)?.trim()
    const id = ensurePlayerId()

    if (!name) {
      setError("Set your name from lobby first, then join the room.")
      setLoading(false)
      return
    }

    setPlayerId(id)
    setPlayerName(name)

    const joinAndLoad = async () => {
      try {
        await joinRoomApi(roomId, id, name)
        await refreshState(roomId, id, setRoom)
        setLoading(false)
      } catch (caught: unknown) {
        setError(caught instanceof Error ? caught.message : "Unable to join room.")
        setLoading(false)
      }
    }

    void joinAndLoad()
  }, [roomId])

  useEffect(() => {
    if (!playerId) {
      return
    }

    const poll = setInterval(() => {
      void refreshState(roomId, playerId, setRoom).catch(() => undefined)
    }, 2000)

    return () => clearInterval(poll)
  }, [playerId, roomId])

  useEffect(() => {
    if (!playerId || startedRef.current) {
      return
    }

    startedRef.current = true
    const streamUrl = `/api/chat/stream?playerId=${encodeURIComponent(playerId)}&roomId=${encodeURIComponent(roomId)}`
    const source = new EventSource(streamUrl)
    eventSourceRef.current = source

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as StreamChatEvent
        const mapped = mapChatEvent(payload)

        if (mapped.id) {
          if (seenChatIdsRef.current.has(mapped.id)) {
            return
          }
          seenChatIdsRef.current.add(mapped.id)
        }

        if (mapped.scope === "global") {
          setGlobalChat((prev) => [mapped, ...prev].slice(0, 120))
        } else {
          setGameChat((prev) => [mapped, ...prev].slice(0, 120))
        }

        if (payload.sentAt) {
          setChatLatencyMs(Date.now() - payload.sentAt)
        }
      } catch {
        // ignore malformed stream packets
      }
    }

    source.onerror = () => {
      setError((prev) => prev || "Realtime chat disconnected. Trying to recover...")
    }

    return () => {
      source.close()
      eventSourceRef.current = null
      startedRef.current = false
    }
  }, [playerId, roomId])

  const onStartGame = async () => {
    if (!playerId) return
    setBusyAction(true)
    setError("")

    try {
      const response = await fetch("/api/rooms/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, playerId }),
      })

      const payload = (await response.json()) as { room?: RoomSnapshot; error?: string }
      if (!response.ok || !payload.room) {
        throw new Error(payload.error ?? "Could not start game")
      }

      setRoom(payload.room)
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not start game")
    } finally {
      setBusyAction(false)
    }
  }

  const onRoll = async () => {
    if (!playerId) return
    setBusyAction(true)
    setError("")

    try {
      const response = await fetch("/api/rooms/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, playerId }),
      })

      const payload = (await response.json()) as { room?: RoomSnapshot; error?: string }
      if (!response.ok || !payload.room) {
        throw new Error(payload.error ?? "Could not roll dice")
      }

      setRoom(payload.room)
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not roll dice")
    } finally {
      setBusyAction(false)
    }
  }

  const onSendChat = async (event: FormEvent) => {
    event.preventDefault()

    const text = chatInput.trim()
    if (!text || !playerId) {
      return
    }

    setError("")

    try {
      const response = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId,
          roomId,
          message: text,
          scope: chatScope,
        }),
      })

      const payload = (await response.json()) as {
        result?: {
          allowed: boolean
          is_fail_open?: boolean
          fail_open_reason?: string
          block_reason_codes?: string[]
          redacted?: boolean
        }
        error?: string
      }

      if (!response.ok || !payload.result) {
        throw new Error(payload.error ?? "Could not send message.")
      }

      if (!payload.result.allowed) {
        const reason = payload.result.block_reason_codes?.join(", ") || "Blocked by policy"
        pushSystem(chatScope, `Message blocked: ${reason}`)
      } else if (payload.result.redacted) {
        pushSystem(chatScope, "Message was redacted by moderation.")
      } else if (payload.result.is_fail_open) {
        pushSystem(chatScope, `Fail-open active: ${payload.result.fail_open_reason ?? "unknown"}`)
      }

      setChatInput("")
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not send chat message")
    }
  }

  const pushSystem = (scope: ChatScope, text: string) => {
    const event: ChatMessage = {
      id: `${Date.now()}-${Math.random()}`,
      scope,
      text,
      at: Date.now(),
      system: true,
      type: "SYSTEM",
    }

    if (scope === "global") {
      setGlobalChat((prev) => [event, ...prev].slice(0, 120))
    } else {
      setGameChat((prev) => [event, ...prev].slice(0, 120))
    }
  }

  if (loading) {
    return (
      <main style={{ display: "grid", placeItems: "center" }}>
        <section className="panel" style={{ padding: 20 }}>
          Loading room...
        </section>
      </main>
    )
  }

  if (!room) {
    return (
      <main style={{ display: "grid", placeItems: "center" }}>
        <section className="panel" style={{ padding: 20, maxWidth: 600 }}>
          <p style={{ marginTop: 0, color: "var(--danger)" }}>{error || "Room unavailable."}</p>
          <Link href="/" style={{ color: "var(--accent)", fontWeight: 700 }}>
            Back to lobby
          </Link>
        </section>
      </main>
    )
  }

  return (
    <main>
      <header className="panel" style={{ padding: 14, marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
          <div>
            <p style={{ margin: "0 0 4px", color: "var(--muted)" }}>Room</p>
            <h1 style={{ margin: 0, letterSpacing: 1.2 }}>{room.roomId}</h1>
          </div>
          <div>
            <p style={{ margin: "0 0 4px", color: "var(--muted)" }}>Player</p>
            <strong>{playerName}</strong>
          </div>
          <div>
            <p style={{ margin: "0 0 4px", color: "var(--muted)" }}>Status</p>
            <strong style={{ textTransform: "capitalize" }}>{room.status}</strong>
          </div>
          <div>
            <p style={{ margin: "0 0 4px", color: "var(--muted)" }}>Turn</p>
            <strong>{playerById.get(room.turnPlayerId ?? "")?.name ?? "-"}</strong>
          </div>
        </div>
      </header>

      <section className="grid-layout">
        <div style={{ display: "grid", gap: 14 }}>
          <SnakesBoard players={room.players} />

          <div className="panel" style={{ padding: 14 }}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={onStartGame}
                disabled={!canStart || busyAction}
                style={{ background: "#7ea2ff", color: "#04112c", fontWeight: 700 }}
              >
                Start Match
              </button>
              <button
                type="button"
                onClick={onRoll}
                disabled={!canRoll || busyAction}
                style={{ background: "var(--accent)", color: "#02261c", fontWeight: 700 }}
              >
                Roll Dice
              </button>
              <Link href="/" style={{ alignSelf: "center", color: "var(--muted)", marginLeft: "auto" }}>
                Leave Room
              </Link>
            </div>

            {room.status === "finished" ? (
              <p style={{ marginTop: 12, color: "var(--accent)", fontWeight: 700 }}>
                Winner: {playerById.get(room.winnerId ?? "")?.name ?? "Unknown"}
              </p>
            ) : null}

            {error ? (
              <p role="alert" style={{ marginTop: 12, color: "var(--danger)", fontWeight: 600 }}>
                {error}
              </p>
            ) : null}
          </div>
        </div>

        <aside style={{ display: "grid", gap: 14 }}>
          <section className="panel" style={{ padding: 14 }}>
            <h2 style={{ marginTop: 0 }}>Player Dashboards</h2>
            <div style={{ display: "grid", gap: 8 }}>
              {room.players.map((player) => {
                const isTurn = room.turnPlayerId === player.id
                const isSelf = me?.id === player.id

                return (
                  <article
                    key={player.id}
                    style={{
                      border: "1px solid rgba(130, 164, 245, 0.25)",
                      borderRadius: 12,
                      padding: 10,
                      background: isTurn ? "rgba(126, 162, 255, 0.16)" : "rgba(8, 16, 31, 0.55)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <strong>
                        {player.name}
                        {isSelf ? " (You)" : ""}
                      </strong>
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: 999,
                          background: colorMap[player.color],
                        }}
                      />
                    </div>
                    <p style={{ margin: "6px 0", color: "var(--muted)", fontSize: 13 }}>
                      Position: {player.position} | Wins: {player.wins}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: isTurn ? "var(--accent)" : "var(--muted)" }}>
                      {isTurn ? "Current turn" : "Waiting"}
                    </p>
                  </article>
                )
              })}
            </div>
          </section>

          <section className="panel" style={{ padding: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <h2 style={{ marginTop: 0 }}>Chat</h2>
              {chatLatencyMs != null ? (
                <span style={{ fontSize: 12, color: "var(--muted)" }}>
                  Latency: {chatLatencyMs} ms
                </span>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button
                type="button"
                onClick={() => setChatScope("game")}
                style={{
                  flex: 1,
                  background: chatScope === "game" ? "#7ea2ff" : "rgba(17, 29, 55, 0.8)",
                  color: chatScope === "game" ? "#05142f" : "var(--text)",
                }}
              >
                Game Chat
              </button>
              <button
                type="button"
                onClick={() => setChatScope("global")}
                style={{
                  flex: 1,
                  background: chatScope === "global" ? "#7ea2ff" : "rgba(17, 29, 55, 0.8)",
                  color: chatScope === "global" ? "#05142f" : "var(--text)",
                }}
              >
                Global Chat
              </button>
            </div>

            <div
              style={{
                height: 270,
                overflowY: "auto",
                border: "1px solid rgba(131, 164, 243, 0.25)",
                borderRadius: 12,
                padding: 10,
                display: "flex",
                flexDirection: "column-reverse",
                gap: 8,
                background: "rgba(7, 14, 28, 0.66)",
              }}
            >
              {activeChat.length === 0 ? (
                <p style={{ color: "var(--muted)", margin: 0 }}>No messages yet.</p>
              ) : (
                activeChat.map((message) => {
                  const sender = message.playerId ? playerById.get(message.playerId)?.name ?? message.playerId : "System"
                  const mine = message.playerId === playerId

                  return (
                    <article
                      key={message.id}
                      style={{
                        borderRadius: 10,
                        padding: 8,
                        background: message.system
                          ? "rgba(255, 109, 125, 0.2)"
                          : mine
                            ? "rgba(44, 229, 167, 0.2)"
                            : "rgba(126, 162, 255, 0.18)",
                      }}
                    >
                      <p style={{ margin: "0 0 3px", fontSize: 12, color: "var(--muted)" }}>
                        {sender} · {new Date(message.at).toLocaleTimeString()}
                      </p>
                      <p style={{ margin: 0 }}>{message.text}</p>
                    </article>
                  )
                })
              )}
            </div>

            <form onSubmit={onSendChat} style={{ marginTop: 10, display: "grid", gap: 8 }}>
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                placeholder={`Message ${chatScope} chat...`}
                rows={2}
                maxLength={240}
              />
              <button type="submit" style={{ background: "var(--accent)", color: "#03281f", fontWeight: 700 }}>
                Send via Frayit Moderation
              </button>
            </form>
          </section>

          <section className="panel" style={{ padding: 14 }}>
            <h2 style={{ marginTop: 0 }}>Dice History</h2>
            <div style={{ maxHeight: 180, overflowY: "auto", display: "grid", gap: 6 }}>
              {room.diceHistory.length === 0 ? (
                <p style={{ margin: 0, color: "var(--muted)" }}>No rolls yet.</p>
              ) : (
                room.diceHistory.map((roll, index) => (
                  <div
                    key={`${roll.at}-${index}`}
                    style={{
                      fontSize: 13,
                      padding: 8,
                      borderRadius: 10,
                      background: "rgba(8, 15, 30, 0.7)",
                      border: "1px solid rgba(126, 162, 255, 0.2)",
                    }}
                  >
                    <strong>{playerById.get(roll.playerId)?.name ?? roll.playerId}</strong>
                    <span style={{ color: "var(--muted)" }}> rolled {roll.value}: {roll.from} → {roll.to}</span>
                    {roll.note ? <span style={{ color: "var(--accent)" }}> ({roll.note})</span> : null}
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>
      </section>
    </main>
  )
}

function mapChatEvent(event: StreamChatEvent): ChatMessage {
  const scope = event.scope === "global" ? "global" : "game"

  if (event.event === "DELETE") {
    return {
      id: `${event.messageId ?? "delete"}-${event.sentAt ?? Date.now()}`,
      scope,
      text: `Message ${event.messageId ?? "unknown"} was removed`,
      playerId: event.playerId,
      at: event.sentAt ?? Date.now(),
      type: "DELETE",
      system: true,
    }
  }

  if (event.event === "JOINED") {
    return {
      id: `joined-${event.scope}-${event.sentAt ?? Date.now()}`,
      scope,
      text: `Connected to ${event.scope} channel`,
      at: event.sentAt ?? Date.now(),
      type: "JOINED",
      system: true,
    }
  }

  return {
    id: `${event.messageId ?? Math.random().toString(36).slice(2)}-${event.sentAt ?? Date.now()}`,
    scope,
    text: event.message ?? "",
    playerId: event.playerId,
    at: event.sentAt ?? Date.now(),
    type: event.event,
    system: event.event === "SYSTEM",
  }
}

async function joinRoomApi(roomId: string, playerId: string, playerName: string): Promise<void> {
  const response = await fetch("/api/rooms/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ roomId, playerId, playerName }),
  })

  const payload = (await response.json()) as { error?: string }
  if (!response.ok) {
    throw new Error(payload.error ?? "Unable to join room.")
  }
}

async function refreshState(
  roomId: string,
  playerId: string,
  onRoom: (next: RoomSnapshot) => void
): Promise<void> {
  const response = await fetch(
    `/api/rooms/state?roomId=${encodeURIComponent(roomId)}&playerId=${encodeURIComponent(playerId)}`,
    { cache: "no-store" }
  )

  const payload = (await response.json()) as { room?: RoomSnapshot; error?: string }
  if (!response.ok || !payload.room) {
    throw new Error(payload.error ?? "Could not fetch room state")
  }

  onRoom(payload.room)
}

function ensurePlayerId(): string {
  const existing = localStorage.getItem(PLAYER_ID_KEY)
  if (existing) {
    return existing
  }

  const next = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `p_${Date.now()}`
  localStorage.setItem(PLAYER_ID_KEY, next)
  return next
}
