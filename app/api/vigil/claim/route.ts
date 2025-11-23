import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/session'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  try {
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!sbUrl || !sbKey) return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })

    const supabase = createClient(sbUrl, sbKey)

    const body = await req.json().catch(() => ({}))
    const { id, name, intention } = body || {}
    if (!id || !name) return NextResponse.json({ error: 'missing params' }, { status: 400 })

    // Verify temple session cookie or fallback token (for WebView/dev cases)
    let token: string | null = null
    const cookie = req.headers.get('cookie') || ''
    const m = cookie.match(/(?:^|; )temple_session=([^;]+)/)
    if (m) {
      token = decodeURIComponent(m[1])
    } else if (body && body.token) {
      token = String(body.token)
    } else {
      // Also accept Authorization: Bearer <token>
      const auth = req.headers.get('authorization') || ''
      const b = auth.match(/Bearer (.+)/)
      if (b) token = b[1]
    }

    if (!token) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
    const session = verifySession(token as string)
    if (!session || !session.userId) return NextResponse.json({ error: 'invalid session' }, { status: 401 })

    const ownerTelegramId = session.userId
    const ownerName = session.displayName || name

    const up = {
      id: Number(id),
      owner_name: ownerName,
      owner_id: `telegram:${ownerTelegramId}`,
      intention: intention || null,
      last_lit_at: new Date().toISOString()
    }

    const { data, error } = await supabase.from('vigil_hearts').upsert(up, { onConflict: 'id' }).select().single()
    if (error) {
      console.error('vigil claim error', error)
      return NextResponse.json({ error: 'db error' }, { status: 500 })
    }

    return NextResponse.json({ ok: true, record: data })
  } catch (e: any) {
    console.error('vigil claim unexpected', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
