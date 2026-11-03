import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { signSession } from '@/lib/session'
import { verifyTelegramInitData } from '@/lib/telegram/initData'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 30,
    keyPrefix: 'temple-auth',
  })
  if (limited) return limited

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const botToken = process.env.TEMPLE_BOT_TOKEN

  if (!sbUrl || !sbServiceKey || !botToken) {
    console.error('[temple/auth] Missing environment configuration')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const supabaseAdmin = createClient(sbUrl, sbServiceKey, {
    auth: { persistSession: false },
  })

  try {
    const body = await req.json().catch(() => ({}))
    const initData = typeof body?.initData === 'string' ? body.initData : ''

    // A body-supplied id/username is not an identity. Only verified initData
    // may create a session.
    const verified = verifyTelegramInitData(initData, botToken)

    if (!verified.ok) {
      return NextResponse.json({ error: 'Invalid Telegram InitData' }, { status: 401 })
    }

    const id = verified.user.id
    const username = verified.user.username ?? ''
    const first_name = verified.user.firstName ?? ''

    const { error: upsertError } = await supabaseAdmin
      .from('temple_users')
      .upsert(
        {
          telegram_id: id,
          username,
          first_name,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: 'telegram_id' },
      )

    if (upsertError) {
      console.error('[temple/auth] Supabase error', upsertError)
      return NextResponse.json({ error: 'Authentication unavailable' }, { status: 500 })
    }

    const displayName = username || first_name || `user_${id.slice(-4)}`

    void supabaseAdmin
      .from('temple_log')
      .insert({ event_type: 'enter', message: `${displayName} entered via Telegram` })
      .then(() => undefined, () => undefined)

    let token: string

    try {
      token = signSession({ userId: id, displayName })
    } catch (error) {
      console.error('[temple/auth] Session secret is not configured', error)
      return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
    }

    const maxAge = 60 * 60 * 24 * 30
    const isProd = process.env.NODE_ENV === 'production'
    const cookie = `temple_session=${token}; Path=/; Max-Age=${maxAge}; SameSite=None; HttpOnly${isProd ? '; Secure' : ''}`

    return NextResponse.json(
      { success: true, userId: id, displayName, token },
      { status: 200, headers: { 'Set-Cookie': cookie, 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    console.error('[temple/auth] Authentication error', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'Authentication failed' }, { status: 500 })
  }
}
