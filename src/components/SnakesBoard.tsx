"use client"

import { PlayerState, SNAKES, LADDERS } from "@/lib/gameTypes"

interface SnakesBoardProps {
  players: PlayerState[]
}

const tokenColors: Record<string, string> = {
  crimson: "#ff6d7d",
  emerald: "#2ce5a7",
  amber: "#ffc15a",
  azure: "#57b9ff",
}

export function SnakesBoard({ players }: SnakesBoardProps) {
  const order = buildBoardOrder()

  return (
    <div className="panel" style={{ padding: 14 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(10, minmax(0, 1fr))",
          borderRadius: 12,
          overflow: "hidden",
          border: "1px solid rgba(128, 162, 247, 0.24)",
        }}
      >
        {order.map((cell, index) => {
          const playersInCell = players.filter((player) => player.position === cell)
          const isSnake = !!SNAKES[cell]
          const isLadder = !!LADDERS[cell]

          return (
            <div
              key={`${cell}-${index}`}
              style={{
                minHeight: 60,
                borderRight: index % 10 === 9 ? "none" : "1px solid rgba(132, 165, 243, 0.2)",
                borderBottom: index >= 90 ? "none" : "1px solid rgba(132, 165, 243, 0.2)",
                background: isSnake
                  ? "linear-gradient(160deg, rgba(255, 109, 125, 0.25), rgba(29, 16, 25, 0.85))"
                  : isLadder
                    ? "linear-gradient(160deg, rgba(44, 229, 167, 0.2), rgba(16, 29, 29, 0.86))"
                    : "rgba(9, 18, 37, 0.76)",
                padding: 6,
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                gap: 4,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{cell}</span>
                {isSnake ? <span style={{ fontSize: 11 }}>🐍</span> : null}
                {isLadder ? <span style={{ fontSize: 11 }}>🪜</span> : null}
              </div>

              <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {playersInCell.map((player) => (
                  <span
                    key={player.id}
                    title={player.name}
                    style={{
                      width: 14,
                      height: 14,
                      borderRadius: 999,
                      background: tokenColors[player.color],
                      boxShadow: "0 0 0 2px rgba(6, 9, 22, 0.85)",
                    }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function buildBoardOrder(): number[] {
  const cells: number[] = []

  for (let row = 9; row >= 0; row -= 1) {
    const rowStart = row * 10 + 1
    const rowCells = Array.from({ length: 10 }, (_, index) => rowStart + index)

    const shouldReverse = (9 - row) % 2 === 1
    if (shouldReverse) {
      rowCells.reverse()
    }

    cells.push(...rowCells)
  }

  return cells
}
