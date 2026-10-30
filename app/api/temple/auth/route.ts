import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { signSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

/**
 * Validates the data received from the Telegram Mini App.
 * https://core.telegram.org/bots/webapps#validating-data-received-via-the-web-app
 */
function verifyTelegramInitData(initData: string, botToken: string): boolean {
  if (!initData || !botToken) return false

  try {
    const urlParams = new URLSearchParams(initData)
    const hash = urlParams.get('hash')

    if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) return false

    const authDateRaw = urlParams.get('auth_date')

    if (!authDateRaw || !/^\d+$/.test(authDateRaw)) return false

    const authDate = Number(authDateRaw)
    const now = Math.floor(Date.now() / 1000)

    // Reject stale or future-dated initData (one day, like serverAuth).
    if (
      !Number.isSafeInteger(authDate) ||
      authDate > now + 60 ||
      now - authDate > 24 * 60 * 60
    ) {
      return false
    }

    urlParams.delete('hash')

    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}=${value}`)
      .join('\n')

    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest()

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex')

    const expected = Buffer.from(calculatedHash, 'hex')
    const received = Buffer.from(hash.toLowerCase(), 'hex')

    if (expected.length !== received.length) return false

    return crypto.timingSafeEqual(expected, received)
  } catch {
    return false
  }
}

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
    if (!initData || !verifyTelegramInitData(initData, botToken)) {
      return NextResponse.json({ error: 'Invalid Telegram InitData' }, { status: 401 })
    }

    let telegramUser: { id?: number | string; username?: string; first_name?: string } | null = null

    try {
      const userStr = new URLSearchParams(initData).get('user')
      telegramUser = userStr ? JSON.parse(userStr) : null
    } catch {
      telegramUser = null
    }

    const id = String(telegramUser?.id || '')

    if (!/^\d+$/.test(id)) {
      return NextResponse.json({ error: 'No User ID found' }, { status: 400 })
    }

    const username = typeof telegramUser?.username === 'string' ? telegramUser.username : ''
    const first_name = typeof telegramUser?.first_name === 'string' ? telegramUser.first_name : ''

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
