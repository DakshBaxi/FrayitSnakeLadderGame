export type GameStatus = "lobby" | "active" | "finished"

export type PlayerColor = "crimson" | "emerald" | "amber" | "azure"

export interface PlayerState {
  id: string
  name: string
  color: PlayerColor
  position: number
  wins: number
  connected: boolean
  joinedAt: number
  lastSeenAt: number
}

export interface DiceRoll {
  playerId: string
  value: number
  from: number
  to: number
  movedBySnakeOrLadder: boolean
  note?: string
  at: number
}

export interface RoomState {
  roomId: string
  status: GameStatus
  players: PlayerState[]
  turnIndex: number
  createdAt: number
  updatedAt: number
  winnerId?: string
  diceHistory: DiceRoll[]
}

export interface RoomSnapshot extends RoomState {
  me?: PlayerState
  turnPlayerId?: string
}

export interface GameMoveResult {
  room: RoomSnapshot
  roll?: DiceRoll
}

export const PLAYER_COLORS: PlayerColor[] = ["crimson", "emerald", "amber", "azure"]

export const LADDERS: Record<number, number> = {
  3: 22,
  8: 30,
  28: 84,
  58: 77,
  75: 86,
  80: 99,
}

export const SNAKES: Record<number, number> = {
  17: 4,
  52: 29,
  57: 40,
  62: 22,
  88: 18,
  95: 51,
  97: 79,
}
