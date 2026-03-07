import { NextResponse } from "next/server"

export function ok<T>(payload: T, status = 200): NextResponse {
  return NextResponse.json(payload, { status })
}

export function fail(message: string, status = 400): NextResponse {
  return NextResponse.json({ error: message }, { status })
}
