import { NextResponse } from 'next/server'

// This route reads request headers (cookies) and must be dynamic.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const cookie = req.headers.get('cookie') || ''
    const match = cookie.match(/(?:^|; )temple_user=([^;]+)/)
    if (!match) return NextResponse.json({ displayName: null })

    const displayName = decodeURIComponent(match[1])
    return NextResponse.json({ displayName })
  } catch (e: any) {
    console.error('GET /api/temple/me unexpected', e)
    return NextResponse.json({ displayName: null }, { status: 500 })
  }
}
