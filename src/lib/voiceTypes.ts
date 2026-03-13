export interface VoiceJoinPayload {
  livekit_token: string
  livekit_url: string
  room_id: string
  channel_id: string
  max_participants: number
}

export interface VoiceParticipantSnapshot {
  id: string
  voice_room_id: string
  session_id: string
  player_id: string
  game_session_id: string
  is_muted: boolean
  joined_at: string
  left_at?: string
  duration_seconds: number
}

export interface VoiceRoomStatePayload {
  room_id: string
  game_id: string
  channel_id: string
  max_participants: number
  participant_count: number
  participants: VoiceParticipantSnapshot[]
  is_active: boolean
}

export interface VoiceLocalStatePayload {
  playerId: string
  roomId: string
  selfMuted: boolean
  selfDeafened: boolean
  peerMuteMap: Record<string, boolean>
  isPeerMuted?: boolean
  shouldPlayAudio?: boolean
}
