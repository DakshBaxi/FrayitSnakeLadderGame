import { FrayitClient } from "@frayit/sdk"

interface ClientState {
  client: FrayitClient
  initialized: boolean
  initializePromise: Promise<void> | null
}

interface FrayitRuntimeConfig {
  clientId: string
  clientSecret: string
  baseUrl: string
  chatTimeoutMs: number
  voiceTimeoutMs: number
}

const DEFAULT_CHAT_TIMEOUT_MS = 5000
const DEFAULT_VOICE_TIMEOUT_MS = 5000

let defaultClientState: ClientState | null = null
const voiceClientStates = new Map<string, ClientState>()

export function getVoiceChannelId(roomId: string): string {
  return `voice-game-${normalizeRoomId(roomId)}`
}

export function getVoiceSessionId(roomId: string): string {
  return `room-${normalizeRoomId(roomId)}`
}

export function getFrayitClient(): FrayitClient {
  if (!defaultClientState) {
    defaultClientState = createClientState()
  }

  return defaultClientState.client
}

export async function ensureFrayitInitialized(): Promise<FrayitClient> {
  if (!defaultClientState) {
    defaultClientState = createClientState()
  }

  await initializeClientState(defaultClientState)
  return defaultClientState.client
}

export async function ensureVoiceClientInitialized(playerId: string, roomId: string): Promise<FrayitClient> {
  const normalizedPlayerId = playerId.trim()
  const normalizedRoomId = normalizeRoomId(roomId)

  if (!normalizedPlayerId) {
    throw new Error("playerId is required.")
  }

  const key = `${normalizedRoomId}:${normalizedPlayerId}`
  let state = voiceClientStates.get(key)
  if (!state) {
    state = createClientState()
    voiceClientStates.set(key, state)
  }

  await initializeClientState(state)
  return state.client
}

export function disposeVoiceClient(playerId: string, roomId: string): void {
  const normalizedPlayerId = playerId.trim()
  if (!normalizedPlayerId) {
    return
  }

  const key = `${normalizeRoomId(roomId)}:${normalizedPlayerId}`
  const state = voiceClientStates.get(key)
  if (!state) {
    return
  }

  state.client.dispose()
  voiceClientStates.delete(key)
}

function createClientState(): ClientState {
  const config = readRuntimeConfig()
  return {
    client: new FrayitClient(config),
    initialized: false,
    initializePromise: null,
  }
}

async function initializeClientState(state: ClientState): Promise<void> {
  if (state.initialized) {
    return
  }

  if (!state.initializePromise) {
    state.initializePromise = state.client.initialize().then(() => {
      state.initialized = true
    })
  }

  await state.initializePromise
}

function readRuntimeConfig(): FrayitRuntimeConfig {
  const clientId = process.env.FRAYIT_CLIENT_ID?.trim()
  const clientSecret = process.env.FRAYIT_CLIENT_SECRET?.trim()
  const baseUrl = process.env.FRAYIT_BASE_URL?.trim()
  const chatTimeoutMs = toPositiveInt(process.env.FRAYIT_CHAT_TIMEOUT_MS, DEFAULT_CHAT_TIMEOUT_MS)
  const voiceTimeoutMs = toPositiveInt(process.env.FRAYIT_VOICE_TIMEOUT_MS, DEFAULT_VOICE_TIMEOUT_MS)

  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error("Missing Frayit env vars. Set FRAYIT_CLIENT_ID, FRAYIT_CLIENT_SECRET, FRAYIT_BASE_URL.")
  }

  return {
    clientId,
    clientSecret,
    baseUrl,
    chatTimeoutMs,
    voiceTimeoutMs,
  }
}

function normalizeRoomId(roomId: string): string {
  const normalized = roomId.trim().toUpperCase()
  if (!normalized) {
    throw new Error("roomId is required.")
  }
  return normalized
}

function toPositiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback
  }
  return Math.floor(parsed)
}
