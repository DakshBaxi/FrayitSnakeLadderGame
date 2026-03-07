"use client"

import { FormEvent, useMemo, useState } from "react"
import { useRouter } from "next/navigation"

const PLAYER_NAME_KEY = "frayit_player_name"
const PLAYER_ID_KEY = "frayit_player_id"

export function LobbyClient() {
  const router = useRouter()
  const [playerName, setPlayerName] = useState("")
  const [roomCode, setRoomCode] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const subtitle = useMemo(
    () => "Snakes & Ladders for 2-4 players. Every chat message is moderated by Frayit before delivery.",
    []
  )

  const onCreate = async (event: FormEvent) => {
    event.preventDefault()
    setError("")

    const safeName = playerName.trim()
    if (!safeName) {
      setError("Enter your name first.")
      return
    }

    setBusy(true)
    try {
      const playerId = ensurePlayerId()
      localStorage.setItem(PLAYER_NAME_KEY, safeName)

      const response = await fetch("/api/rooms/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId, playerName: safeName }),
      })

      const payload = (await response.json()) as { room?: { roomId: string }; error?: string }
      if (!response.ok || !payload.room?.roomId) {
        throw new Error(payload.error ?? "Could not create room.")
      }

      router.push(`/room/${payload.room.roomId}`)
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not create room.")
    } finally {
      setBusy(false)
    }
  }

  const onJoin = async (event: FormEvent) => {
    event.preventDefault()
    setError("")

    const safeName = playerName.trim()
    const safeRoom = roomCode.trim().toUpperCase()

    if (!safeName || !safeRoom) {
      setError("Name and room code are required.")
      return
    }

    setBusy(true)
    try {
      const playerId = ensurePlayerId()
      localStorage.setItem(PLAYER_NAME_KEY, safeName)

      const response = await fetch("/api/rooms/join", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: safeRoom, playerId, playerName: safeName }),
      })

      const payload = (await response.json()) as { room?: { roomId: string }; error?: string }
      if (!response.ok || !payload.room?.roomId) {
        throw new Error(payload.error ?? "Could not join room.")
      }

      router.push(`/room/${safeRoom}`)
    } catch (caught: unknown) {
      setError(caught instanceof Error ? caught.message : "Could not join room.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <main style={{ display: "grid", placeItems: "center" }}>
      <section className="panel" style={{ width: "100%", maxWidth: 760, padding: 24 }}>
        <p style={{ margin: "0 0 8px", color: "var(--accent)", fontWeight: 700 }}>Frayit 4-Player Game</p>
        <h1 style={{ margin: 0, fontSize: "clamp(2rem, 5vw, 3rem)" }}>Snake Clash Arena</h1>
        <p style={{ marginTop: 12, color: "var(--muted)", lineHeight: 1.5 }}>{subtitle}</p>

        <div style={{ marginTop: 24 }}>
          <label htmlFor="playerName" style={{ display: "block", marginBottom: 8, color: "var(--muted)" }}>
            Player Name
          </label>
          <input
            id="playerName"
            placeholder="e.g. Daksh"
            value={playerName}
            onChange={(event) => setPlayerName(event.target.value)}
            autoComplete="nickname"
            maxLength={24}
          />
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginTop: 18 }}>
          <form onSubmit={onCreate}>
            <button
              type="submit"
              disabled={busy}
              style={{ width: "100%", background: "var(--accent)", color: "#02261c", fontWeight: 700 }}
            >
              {busy ? "Creating..." : "Create Room"}
            </button>
          </form>

          <form onSubmit={onJoin} style={{ display: "grid", gap: 10 }}>
            <input
              placeholder="Room Code"
              value={roomCode}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
              maxLength={6}
            />
            <button type="submit" disabled={busy} style={{ background: "#7ea2ff", color: "#071534", fontWeight: 700 }}>
              {busy ? "Joining..." : "Join Room"}
            </button>
          </form>
        </div>

        {error ? (
          <p style={{ marginTop: 14, color: "var(--danger)", fontWeight: 600 }} role="alert">
            {error}
          </p>
        ) : null}
      </section>
    </main>
  )
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
