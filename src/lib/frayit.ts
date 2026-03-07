import { FrayitClient } from "@frayit/sdk"

let client: FrayitClient | null = null
let initialized = false
let initializePromise: Promise<void> | null = null

export function getFrayitClient(): FrayitClient {
  if (client) {
    return client
  }

  const clientId = process.env.FRAYIT_CLIENT_ID
  const clientSecret = process.env.FRAYIT_CLIENT_SECRET
  const baseUrl = process.env.FRAYIT_BASE_URL
  const chatTimeoutMs = 500
  if (!clientId || !clientSecret || !baseUrl) {
    throw new Error("Missing Frayit env vars. Set FRAYIT_CLIENT_ID, FRAYIT_CLIENT_SECRET, FRAYIT_BASE_URL.")
  }
  

  client = new FrayitClient({
    clientId,
    clientSecret,
    baseUrl,
    chatTimeoutMs
  })

  return client
}

export async function ensureFrayitInitialized(): Promise<FrayitClient> {
  const frayit = getFrayitClient()

  if (initialized) {
    return frayit
  }

  if (!initializePromise) {
    initializePromise = frayit.initialize().then(() => {
      initialized = true
    })
  }

  await initializePromise
  return frayit
}
