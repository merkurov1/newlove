import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import crypto from 'crypto'
import { signSession } from '@/lib/session'

export const dynamic = 'force-dynamic'

function parseQuery(str: string) {
  return str.split('&').reduce<Record<string,string>>((acc, pair) => {
    const [k, v] = pair.split('=')
    if (!k) return acc
    acc[decodeURIComponent(k)] = decodeURIComponent(v || '')
    return acc
  }, {})
}

function buildDataCheckString(obj: Record<string,string>) {
  return Object.keys(obj).sort().map(k => `${k}=${obj[k]}`).join('\n')
}

function verifyTelegramInitData(initData: string, botToken: string) {
  try {
    const params = parseQuery(initData)
    const providedHash = params['hash']
    if (!providedHash) return false
    delete params['hash']
    const dataCheckString = buildDataCheckString(params)
    const secret = crypto.createHash('sha256').update(botToken).digest()
    const hmac = crypto.createHmac('sha256', secret).update(dataCheckString).digest('hex')
    return hmac === providedHash
  } catch (e) {
    return false
  }
}

export async function POST(req: Request) {
  console.log('API: /api/temple/auth hit')

  const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const sbServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const botToken = process.env.TEMPLE_BOT_TOKEN

  if (!sbUrl || !sbServiceKey) {
    console.error('API Error: Missing Supabase Env Vars')
    return NextResponse.json({ error: 'Server misconfiguration' }, { status: 500 })
  }

  const supabaseAdmin = createClient(sbUrl, sbServiceKey, { auth: { persistSession: false } })

  try {
    const body = await req.json()
    console.log('API: Received body:', body)

    // If Telegram initData provided, verify it
    if (body?.initData) {
      if (!botToken) {
        console.error('Temple bot token missing (TEMPLE_BOT_TOKEN)')
        return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })
      }
      const ok = verifyTelegramInitData(body.initData, botToken)
      if (!ok) {
        console.warn('Telegram initData verification failed')
        return NextResponse.json({ error: 'invalid telegram initData' }, { status: 401 })
      }
    }

    const id = String(body?.id || body?.user?.id || '')
    const username = body?.username || body?.user?.username || body?.user?.first_name || ''
    const first_name = body?.first_name || body?.user?.first_name || ''

    if (!id) {
      console.error('API: No ID in body')
      return NextResponse.json({ error: 'No ID provided' }, { status: 400 })
    }

    // Upsert в таблицу temple_users
    const { data, error } = await supabaseAdmin
      .from('temple_users')
      .upsert({
        telegram_id: id,
        username: username || '',
        first_name: first_name || '',
        last_seen_at: new Date().toISOString()
      }, { onConflict: 'telegram_id' })
      .select()

    if (error) {
      console.error('API: Supabase Insert Error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Prepare a display name (prefer username, then first_name)
    const displayName = username || first_name || `user_${String(id).slice(-6)}`

    // Логируем в temple_log только имя пользователя (без telegram id)
    await supabaseAdmin.from('temple_log').insert({ event_type: 'enter', message: `${displayName} entered` })

    // Create signed JWT session
    const token = signSession({ userId: id, displayName })
    const maxAge = 60 * 60 * 24 * 30 // 30 days
    const isProd = process.env.NODE_ENV === 'production'
    
    // If initData provided (Telegram flow), set SameSite=None to allow WebView cookies.
    // Important for cross-site cookie availability within the Telegram iframe.
    const sameSite = body?.initData ? 'None' : 'Lax'
    const cookie = `temple_session=${token}; Path=/; Max-Age=${maxAge}; SameSite=${sameSite}; HttpOnly${isProd ? '; Secure' : ''}`

    // Construct response body
    // CRITICAL FIX: Always return the token.
    // The client (Telegram Mini App) needs this token to store in localStorage
    // because cookies often fail in iFrames/WebViews due to strict privacy settings.
    const resBody: any = { 
      success: true, 
      userId: id, 
      displayName, 
      token: token // <--- Always included now
    }

    return NextResponse.json(resBody, { 
      status: 200, 
      headers: { 'Set-Cookie': cookie } 
    })
  } catch (e: any) {
    console.error('API: Critical Error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}