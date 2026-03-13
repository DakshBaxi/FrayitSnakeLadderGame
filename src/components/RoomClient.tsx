"use client"

import { FormEvent, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Room as LiveKitRoom, RoomEvent, Track, type RemoteTrack } from "livekit-client"
import { SnakesBoard } from "@/components/SnakesBoard"
import { PlayerState, RoomSnapshot } from "@/lib/gameTypes"
import { StreamChatEvent } from "@/lib/chatTypes"
import { VoiceJoinPayload, VoiceLocalStatePayload, VoiceRoomStatePayload } from "@/lib/voiceTypes"

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

interface RemoteAudioBinding {
  participantId: string
  element: HTMLAudioElement
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
  const router = useRouter()
  const [playerId, setPlayerId] = useState("")
  const [playerName, setPlayerName] = useState("")
  const [room, setRoom] = useState<RoomSnapshot | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState(false)
  const [leavingRoom, setLeavingRoom] = useState(false)
  const [error, setError] = useState("")
  const [chatInput, setChatInput] = useState("")
  const [chatScope, setChatScope] = useState<ChatScope>("game")
  const [globalChat, setGlobalChat] = useState<ChatMessage[]>([])
  const [gameChat, setGameChat] = useState<ChatMessage[]>([])
  const [chatLatencyMs, setChatLatencyMs] = useState<number | null>(null)
  const [voiceBusy, setVoiceBusy] = useState(false)
  const [voiceStatus, setVoiceStatus] = useState("")
  const [voiceJoin, setVoiceJoin] = useState<VoiceJoinPayload | null>(null)
  const [voiceRoomState, setVoiceRoomState] = useState<VoiceRoomStatePayload | null>(null)
  const [voiceLocalState, setVoiceLocalState] = useState<VoiceLocalStatePayload | null>(null)

  const eventSourceRef = useRef<EventSource | null>(null)
  const startedRef = useRef(false)
  const seenChatIdsRef = useRef<Set<string>>(new Set())
  const livekitRoomRef = useRef<LiveKitRoom | null>(null)
  const remoteAudioBindingsRef = useRef<Map<string, RemoteAudioBinding>>(new Map())
  const voiceLocalStateRef = useRef<VoiceLocalStatePayload | null>(null)
  const playerIdRef = useRef("")
  const roomIdRef = useRef(roomId)
  const voiceAutoJoinRef = useRef(false)
  const roomLeaveStartedRef = useRef(false)
  const [livekitConnected, setLivekitConnected] = useState(false)

  const me = room?.me
  const canStart = room?.players?.[0]?.id === playerId && room.status !== "active" && (room.players.length ?? 0) >= 2
  const canRoll = room?.status === "active" && room.turnPlayerId === playerId

  const activeChat = chatScope === "global" ? globalChat : gameChat
  const voiceParticipants = (room?.players ?? []).map((player) => {
    const voiceParticipant = voiceRoomState?.participants.find((entry) => entry.player_id === player.id)
    const isSelf = player.id === playerId
    return {
      player,
      isSelf,
      inVoice: !!voiceParticipant,
      serverMuted: voiceParticipant?.is_muted ?? false,
      locallyMuted: isSelf
        ? (voiceLocalState?.selfMuted ?? true)
        : (voiceLocalState?.peerMuteMap[player.id] ?? false),
    }
  })

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
    if (!playerId || leavingRoom) {
      return
    }

    const poll = setInterval(() => {
      void refreshState(roomId, playerId, setRoom).catch(() => undefined)
    }, 2000)

    return () => clearInterval(poll)
  }, [leavingRoom, playerId, roomId])

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

  useEffect(() => {
    if (!playerId) {
      return
    }

    void loadVoiceLocalSnapshot().catch(() => undefined)
  }, [playerId, roomId])

  useEffect(() => {
    playerIdRef.current = playerId
  }, [playerId])

  useEffect(() => {
    roomIdRef.current = roomId
  }, [roomId])

  useEffect(() => {
    voiceLocalStateRef.current = voiceLocalState
  }, [voiceLocalState])

  useEffect(() => {
    return () => {
      void leaveRoomGracefully({ keepalive: true })
    }
  }, [])

  useEffect(() => {
    voiceAutoJoinRef.current = false
    setVoiceJoin(null)
    setVoiceRoomState(null)
  }, [playerId, roomId])

  useEffect(() => {
    if (!playerId || loading || leavingRoom || voiceAutoJoinRef.current) {
      return
    }

    voiceAutoJoinRef.current = true
    void autoJoinVoiceSession().catch(() => undefined)
  }, [leavingRoom, loading, playerId, roomId])

  useEffect(() => {
    if (!playerId || !voiceJoin || leavingRoom) {
      return
    }

    const timer = setInterval(() => {
      void refreshVoiceRoomState().catch(() => undefined)
    }, 5000)

    return () => clearInterval(timer)
  }, [leavingRoom, playerId, voiceJoin])

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

  const closeChatStream = () => {
    eventSourceRef.current?.close()
    eventSourceRef.current = null
    startedRef.current = false
  }

  const detachAllRemoteAudio = () => {
    for (const binding of remoteAudioBindingsRef.current.values()) {
      try {
        binding.element.srcObject = null
        binding.element.remove()
      } catch {
        // ignore detach failures during teardown
      }
    }
    remoteAudioBindingsRef.current.clear()
  }

  const applyRemoteAudioPolicy = () => {
    const local = voiceLocalStateRef.current
    const selfDeafened = local?.selfDeafened ?? false
    const peerMuteMap = local?.peerMuteMap ?? {}

    for (const binding of remoteAudioBindingsRef.current.values()) {
      const peerMuted = peerMuteMap[binding.participantId] === true
      binding.element.muted = selfDeafened || peerMuted
      binding.element.volume = selfDeafened || peerMuted ? 0 : 1
    }
  }

  const disconnectLivekit = async () => {
    const room = livekitRoomRef.current
    livekitRoomRef.current = null

    detachAllRemoteAudio()

    if (room) {
      try {
        room.disconnect()
      } catch {
        // ignore disconnect failures during cleanup
      }
    }

    setLivekitConnected(false)
  }

  const leaveRoomGracefully = async ({
    keepalive = false,
    throwOnError = false,
  }: {
    keepalive?: boolean
    throwOnError?: boolean
  } = {}): Promise<void> => {
    const currentPlayerId = playerIdRef.current
    const currentRoomId = roomIdRef.current

    if (!currentPlayerId || roomLeaveStartedRef.current) {
      return
    }

    roomLeaveStartedRef.current = true
    closeChatStream()
    await disconnectLivekit()

    try {
      const response = await fetch("/api/rooms/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId: currentPlayerId, roomId: currentRoomId }),
        keepalive,
      })

      if (!response.ok && throwOnError) {
        const payload = (await response.json()) as { error?: string }
        throw new Error(payload.error ?? "Unable to leave room.")
      }
    } catch (caught: unknown) {
      roomLeaveStartedRef.current = false
      if (throwOnError) {
        throw caught
      }
    }
  }

  const onLeaveRoom = async () => {
    if (leavingRoom) {
      return
    }

    setLeavingRoom(true)
    setError("")

    try {
      await leaveRoomGracefully({ throwOnError: true })
      router.push("/")
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Unable to leave room.")
      setLeavingRoom(false)
    }
  }

  const connectLivekit = async (join: VoiceJoinPayload) => {
    await disconnectLivekit()

    const room = new LiveKitRoom()
    room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack, publication, participant) => {
      if (track.kind !== Track.Kind.Audio) {
        return
      }

      const attached = track.attach()
      if (!(attached instanceof HTMLAudioElement)) {
        return
      }

      attached.autoplay = true
      attached.style.display = "none"
      document.body.appendChild(attached)

      remoteAudioBindingsRef.current.set(publication.trackSid, {
        participantId: participant.identity,
        element: attached,
      })

      applyRemoteAudioPolicy()
    })

    room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack, publication) => {
      const binding = remoteAudioBindingsRef.current.get(publication.trackSid)
      if (!binding) {
        return
      }

      track.detach(binding.element)
      binding.element.srcObject = null
      binding.element.remove()
      remoteAudioBindingsRef.current.delete(publication.trackSid)
    })

    room.on(RoomEvent.Disconnected, () => {
      detachAllRemoteAudio()
      setLivekitConnected(false)
    })

    await room.connect(join.livekit_url, join.livekit_token)
    await room.localParticipant.setMicrophoneEnabled(!(voiceLocalStateRef.current?.selfMuted ?? false))

    livekitRoomRef.current = room
    setLivekitConnected(true)
    applyRemoteAudioPolicy()
  }

  const loadVoiceLocalSnapshot = async () => {
    if (!playerId) {
      return
    }

    const response = await fetch(
      `/api/voice/local?playerId=${encodeURIComponent(playerId)}&roomId=${encodeURIComponent(roomId)}`,
      { cache: "no-store" }
    )
    const payload = (await response.json()) as { local?: VoiceLocalStatePayload; error?: string }
    if (!response.ok || !payload.local) {
      throw new Error(payload.error ?? "Unable to load local voice state.")
    }

    setVoiceLocalState(payload.local)
    voiceLocalStateRef.current = payload.local
    applyRemoteAudioPolicy()
  }

  const refreshVoiceRoomState = async () => {
    const response = await fetch(`/api/voice/state?roomId=${encodeURIComponent(roomId)}`, { cache: "no-store" })
    const payload = (await response.json()) as { voice?: VoiceRoomStatePayload; error?: string }
    if (!response.ok || !payload.voice) {
      throw new Error(payload.error ?? "Unable to load voice room state.")
    }

    setVoiceRoomState(payload.voice)
  }

  const withVoiceBusy = async (action: () => Promise<void>) => {
    setVoiceBusy(true)
    setVoiceStatus("")
    try {
      await action()
    } catch (caught: unknown) {
      setVoiceStatus(caught instanceof Error ? caught.message : "Voice action failed.")
    } finally {
      setVoiceBusy(false)
    }
  }

  const joinVoiceSession = async (startMuted: boolean) => {
    if (!playerId) {
      return
    }

    await withVoiceBusy(async () => {
      if (startMuted) {
        await postLocalVoiceAction("set_self_muted", { muted: true })
        await postLocalVoiceAction("set_self_deafened", { deafened: false })
      }

      const response = await fetch("/api/voice/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, roomId }),
      })
      const payload = (await response.json()) as { voice?: VoiceJoinPayload; error?: string }
      if (!response.ok || !payload.voice) {
        throw new Error(payload.error ?? "Unable to join team voice.")
      }

      setVoiceJoin(payload.voice)
      await connectLivekit(payload.voice)
      await refreshVoiceRoomState()
      setVoiceStatus(startMuted ? "Team voice ready. Your mic is muted." : "Team voice reconnected.")
    })
  }

  const autoJoinVoiceSession = async () => {
    await joinVoiceSession(true)
  }

  const onReconnectVoice = async () => {
    await joinVoiceSession(false)
  }

  const postLocalVoiceAction = async (
    action: "set_self_muted" | "set_self_deafened" | "set_peer_muted" | "snapshot",
    extra: Record<string, unknown> = {}
  ): Promise<VoiceLocalStatePayload> => {
    if (!playerId) {
      throw new Error("Player is not ready.")
    }

    const response = await fetch("/api/voice/local", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId,
        roomId,
        action,
        ...extra,
      }),
    })
    const payload = (await response.json()) as { local?: VoiceLocalStatePayload; error?: string }
    if (!response.ok || !payload.local) {
      throw new Error(payload.error ?? "Unable to update local voice state.")
    }

    setVoiceLocalState(payload.local)
    voiceLocalStateRef.current = payload.local
    applyRemoteAudioPolicy()
    return payload.local
  }

  const onSetSelfMuted = async (muted: boolean) => {
    await withVoiceBusy(async () => {
      const local = await postLocalVoiceAction("set_self_muted", { muted })
      const room = livekitRoomRef.current
      if (room) {
        await room.localParticipant.setMicrophoneEnabled(!local.selfMuted)
      }
      setVoiceStatus(`Self mute: ${local.selfMuted}`)
    })
  }

  const onSetSelfDeafened = async (deafened: boolean) => {
    await withVoiceBusy(async () => {
      const local = await postLocalVoiceAction("set_self_deafened", { deafened })
      setVoiceStatus(`Self deafen: ${local.selfDeafened}`)
    })
  }

  const onSetPeerMutedLocally = async (targetPlayerId: string, muted: boolean) => {
    if (!targetPlayerId) {
      return
    }

    await withVoiceBusy(async () => {
      const local = await postLocalVoiceAction("set_peer_muted", {
        targetPlayerId,
        muted,
      })
      setVoiceStatus(
        `${muted ? "Muted" : "Unmuted"} ${playerById.get(targetPlayerId)?.name ?? targetPlayerId} for your device.`
      )
    })
  }

  const sendChat = async () => {
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

  const onSendChat = async (event: FormEvent) => {
    event.preventDefault()
    await sendChat()
  }

  const onChatKeyDown = async (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) {
      return
    }

    event.preventDefault()
    await sendChat()
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
                disabled={!canStart || busyAction || leavingRoom}
                style={{ background: "#7ea2ff", color: "#04112c", fontWeight: 700 }}
              >
                Start Match
              </button>
              <button
                type="button"
                onClick={onRoll}
                disabled={!canRoll || busyAction || leavingRoom}
                style={{ background: "var(--accent)", color: "#02261c", fontWeight: 700 }}
              >
                Roll Dice
              </button>
              <button
                type="button"
                onClick={onLeaveRoom}
                disabled={leavingRoom}
                style={{ marginLeft: "auto", background: "transparent", color: "var(--muted)", paddingInline: 0 }}
              >
                {leavingRoom ? "Leaving..." : "Leave Room"}
              </button>
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
                onKeyDown={onChatKeyDown}
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
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
              <h2 style={{ marginTop: 0 }}>Team Voice</h2>
              <span style={{ fontSize: 12, color: livekitConnected ? "var(--accent)" : "var(--muted)" }}>
                {livekitConnected ? "Connected" : "Connecting..."}
              </span>
            </div>

            <div style={{ display: "grid", gap: 10 }}>
              <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
                You join squad voice automatically when you enter the room. Mic starts muted until you unmute.
              </p>

              <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}>
                <button
                  type="button"
                  onClick={() => onSetSelfMuted(!(voiceLocalState?.selfMuted ?? false))}
                  disabled={voiceBusy}
                  style={{
                    background: voiceLocalState?.selfMuted ? "#7ea2ff" : "var(--accent)",
                    color: voiceLocalState?.selfMuted ? "#04112c" : "#02261c",
                    fontWeight: 700,
                  }}
                >
                  {voiceLocalState?.selfMuted ? "Unmute Mic" : "Mute Mic"}
                </button>
                <button
                  type="button"
                  onClick={() => onSetSelfDeafened(!(voiceLocalState?.selfDeafened ?? false))}
                  disabled={voiceBusy}
                  style={{
                    background: voiceLocalState?.selfDeafened ? "#ff6d7d" : "rgba(17, 29, 55, 0.8)",
                    color: voiceLocalState?.selfDeafened ? "#2a0710" : "var(--text)",
                    fontWeight: 700,
                  }}
                >
                  {voiceLocalState?.selfDeafened ? "Enable Voice Audio" : "Mute Voice Audio"}
                </button>
              </div>

              {!livekitConnected ? (
                <button
                  type="button"
                  onClick={onReconnectVoice}
                  disabled={voiceBusy}
                  style={{ background: "#7ea2ff", color: "#04112c", fontWeight: 700 }}
                >
                  Reconnect Voice
                </button>
              ) : null}

              <div style={{ display: "grid", gap: 8 }}>
                {voiceParticipants.map(({ player, isSelf, inVoice, serverMuted, locallyMuted }) => (
                  <article
                    key={player.id}
                    style={{
                      borderRadius: 12,
                      padding: 10,
                      border: "1px solid rgba(130, 164, 245, 0.25)",
                      background: inVoice ? "rgba(8, 16, 31, 0.72)" : "rgba(8, 16, 31, 0.45)",
                      display: "grid",
                      gap: 6,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                      <strong>
                        {player.name}
                        {isSelf ? " (You)" : ""}
                      </strong>
                      <span style={{ fontSize: 12, color: inVoice ? "var(--accent)" : "var(--muted)" }}>
                        {inVoice ? "In voice" : "Not connected"}
                      </span>
                    </div>

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 12, color: "var(--muted)" }}>
                      <span>{serverMuted ? "Server muted" : "Server open"}</span>
                      <span>{locallyMuted ? "Local mute on" : "Local mute off"}</span>
                    </div>

                    {!isSelf ? (
                      <button
                        type="button"
                        onClick={() => onSetPeerMutedLocally(player.id, !locallyMuted)}
                        disabled={voiceBusy || !inVoice}
                        style={{
                          background: locallyMuted ? "#7ea2ff" : "rgba(17, 29, 55, 0.8)",
                          color: locallyMuted ? "#04112c" : "var(--text)",
                        }}
                      >
                        {locallyMuted ? "Unmute Player" : "Mute Player"}
                      </button>
                    ) : null}
                  </article>
                ))}
              </div>

              {voiceStatus ? (
                <p style={{ margin: 0, color: voiceStatus.includes("Unable") ? "var(--danger)" : "var(--muted)" }}>
                  {voiceStatus}
                </p>
              ) : null}
            </div>
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
