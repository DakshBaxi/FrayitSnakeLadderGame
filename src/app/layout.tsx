import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: "Frayit Arena: Snakes & Ladders",
  description: "2-4 player board game with Frayit moderated global and game chat",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
