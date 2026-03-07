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

  // Map board number -> normalized position (0..100) for line drawing
  const positions = new Map<number, { x: number; y: number }>()
  order.forEach((cell, index) => {
    const row = Math.floor(index / 10)
    const col = index % 10

    // Center of cell in percent (0..100)
    positions.set(cell, { x: col * 10 + 5, y: row * 10 + 5 })
  })

  const drawSnake = (from: number, to: number) => {
    const a = positions.get(from)
    const b = positions.get(to)
    if (!a || !b) return null

    const dx = b.x - a.x
    const dy = b.y - a.y
    const distance = Math.hypot(dx, dy)
    const angle = Math.atan2(dy, dx)

    const waveAmplitude = Math.min(6, distance * 0.1)
    const waveFrequency = 3

    const stepCount = 12
    const points = Array.from({ length: stepCount + 1 }, (_, i) => {
      const t = i / stepCount
      const baseX = a.x + dx * t
      const baseY = a.y + dy * t

      const offset = Math.sin(t * Math.PI * waveFrequency) * waveAmplitude
      const perpX = -Math.sin(angle)
      const perpY = Math.cos(angle)

      return {
        x: baseX + perpX * offset,
        y: baseY + perpY * offset,
      }
    })

    const pathData = points
      .map((pt, i) => `${i === 0 ? "M" : "L"} ${pt.x.toFixed(2)} ${pt.y.toFixed(2)}`)
      .join(" ")

    return (
      <path
        key={`snake-${from}-${to}`}
        d={pathData}
        stroke="#ff6d7d"
        strokeWidth={1.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={0.45}
        markerEnd="url(#snakeHead)"
      />
    )
  }

  const drawLadder = (from: number, to: number) => {
    const a = positions.get(from)
    const b = positions.get(to)
    if (!a || !b) return null

    // Ladder rails are slightly offset from the center line.
    const angle = Math.atan2(b.y - a.y, b.x - a.x)
    const offset = 2
    const sin = Math.sin(angle)
    const cos = Math.cos(angle)

    const leftA = { x: a.x + sin * offset, y: a.y - cos * offset }
    const rightA = { x: a.x - sin * offset, y: a.y + cos * offset }
    const leftB = { x: b.x + sin * offset, y: b.y - cos * offset }
    const rightB = { x: b.x - sin * offset, y: b.y + cos * offset }

    const rungCount = 5
    const rungs = Array.from({ length: rungCount }, (_, i) => {
      const t = (i + 1) / (rungCount + 1)
      const x1 = leftA.x + (leftB.x - leftA.x) * t
      const y1 = leftA.y + (leftB.y - leftA.y) * t
      const x2 = rightA.x + (rightB.x - rightA.x) * t
      const y2 = rightA.y + (rightB.y - rightA.y) * t
      return (
        <line
          key={`rung-${from}-${to}-${i}`}
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke="#2ce5a7"
          strokeWidth={1.2}
          opacity={0.8}
        />
      )
    })

    return (
      <g key={`ladder-${from}-${to}`} opacity={0.6}>
        <line
          x1={leftA.x}
          y1={leftA.y}
          x2={leftB.x}
          y2={leftB.y}
          stroke="#2ce5a7"
          strokeWidth={1.1}
          strokeLinecap="round"
        />
        <line
          x1={rightA.x}
          y1={rightA.y}
          x2={rightB.x}
          y2={rightB.y}
          stroke="#2ce5a7"
          strokeWidth={1.1}
          strokeLinecap="round"
        />
        {rungs}
      </g>
    )
  }

  return (
    <div className="panel" style={{ padding: 14 }}>
      <div style={{ position: "relative", aspectRatio: "1 / 1" }}>
        <svg
          viewBox="0 0 100 100"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            width: "100%",
            height: "100%",
          }}
        >
          <defs>
            <marker
              id="snakeHead"
              markerWidth="3"
              markerHeight="3"
              refX="2.5"
              refY="1.5"
              orient="auto"
            >
              <path d="M0,0 L3,1.5 L0,3 Z" fill="#ff6d7d" opacity={0.6} />
            </marker>
            <marker
              id="ladderTop"
              markerWidth="3"
              markerHeight="3"
              refX="2.5"
              refY="1.5"
              orient="auto"
            >
              <path d="M0,0.7 L3,0.7 L3,2.3 L0,2.3 Z" fill="#2ce5a7" opacity={0.6} />
            </marker>
          </defs>

          {Object.entries(SNAKES).map(([from, to]) => drawSnake(Number(from), to))}
          {Object.entries(LADDERS).map(([from, to]) => drawLadder(Number(from), to))}
        </svg>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(10, minmax(0, 1fr))",
            borderRadius: 12,
            overflow: "hidden",
            border: "1px solid rgba(128, 162, 247, 0.24)",
            width: "100%",
            height: "100%",
          }}
        >
          {order.map((cell, index) => {
            const playersInCell = players.filter((player) => player.position === cell)
            const isSnake = !!SNAKES[cell]
            const isLadder = !!LADDERS[cell]

            const row = Math.floor(index / 10)
            const col = index % 10
            const isDark = (row + col) % 2 === 1

            return (
              <div
                key={`${cell}-${index}`}
                style={{
                  minHeight: 60,
                  borderRight: index % 10 === 9 ? "none" : "1px solid rgba(132, 165, 243, 0.2)",
                  borderBottom: index >= 90 ? "none" : "1px solid rgba(132, 165, 243, 0.2)",
                  background: isSnake
                    ? "rgba(255, 109, 125, 0.12)"
                    : isLadder
                    ? "rgba(44, 229, 167, 0.12)"
                    : isDark
                    ? "rgba(12, 22, 41, 0.65)"
                    : "rgba(25, 35, 60, 0.55)",
                  padding: 6,
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: 4,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>{cell}</span>
                  {isSnake ? <span style={{ fontSize: 11, opacity: 0.85 }}>🐍</span> : null}
                  {isLadder ? <span style={{ fontSize: 11, opacity: 0.85 }}>🪜</span> : null}
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
