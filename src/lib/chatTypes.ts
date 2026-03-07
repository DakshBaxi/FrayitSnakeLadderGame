export type ChatScope = "global" | "game"

export interface StreamChatEvent {
  scope: ChatScope
  event: "MESSAGE" | "DELETE" | "JOINED" | "SYSTEM"
  messageId?: string
  playerId?: string
  channelId?: string
  message?: string
  sentAt?: number
  gameId?: string
}
