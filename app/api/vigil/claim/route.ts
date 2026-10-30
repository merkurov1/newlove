/* ===== FILE: app/api/vigil/claim/route.ts ===== */

import { NextResponse } from 'next/server'
import { createClient, type User } from '@supabase/supabase-js'
import { verifySession } from '@/lib/session'

export const runtime = 'nodejs'

// Проверка формата UUID
function isUUID(str: string) {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(str);
}

function displayNameFromUser(user: User, profileName?: string | null) {
  return (
    profileName?.trim() ||
    (typeof user.user_metadata?.name === 'string' ? user.user_metadata.name.trim() : '') ||
    user.email?.split('@')[0]?.trim() ||
    ''
  )
}

export async function POST(req: Request) {
  try {
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!sbUrl || !sbKey) return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })

    const supabase = createClient(sbUrl, sbKey)

    const body = await req.json().catch(() => ({}))
    const { id, intention } = body || {}
    if (!id) return NextResponse.json({ error: 'missing params' }, { status: 400 })

    const heartId = Number(id)
    if (!Number.isInteger(heartId) || heartId < 1 || heartId > 5) {
      return NextResponse.json({ error: 'invalid heart id' }, { status: 400 })
    }

    // 1. Auth check — temple session cookie/token or a Supabase access token.
    const cookie = req.headers.get('cookie') || ''
    const cookieMatch = cookie.match(/(?:^|; )temple_session=([^;]+)/)
    const authHeader = req.headers.get('authorization') || ''
    const bearerMatch = authHeader.match(/Bearer (.+)/)
    const bearerToken = bearerMatch?.[1] || (body?.token ? String(body.token) : null)

    let userId: string | null = null
    let ownerName = ''

    const templeToken =
      bearerToken || (cookieMatch ? decodeURIComponent(cookieMatch[1]) : null)
    if (templeToken) {
      const session = verifySession(templeToken)
      if (session?.userId) {
        userId = session.userId
        ownerName = (session.displayName || '').trim()
      }
    }

    // Web/email users authenticate with Supabase, not the Telegram temple session.
    if (!userId && bearerToken) {
      const { data: { user }, error } = await supabase.auth.getUser(bearerToken)
      if (error) {
        console.error('vigil claim auth error:', error.message)
      } else if (user) {
        userId = user.id
        const { data: profile } = await supabase
          .from('users')
          .select('name')
          .eq('id', user.id)
          .maybeSingle()
        ownerName = displayNameFromUser(user, profile?.name)
      }
    }

    if (!userId || !ownerName) {
      return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
    }

    ownerName = ownerName.slice(0, 120)

    // 2. SINGLE TENANCY PROTOCOL (Закон Одной Искры)
    // Прежде чем занять новое, гасим старое.
    if (isUUID(userId)) {
        // Если это Supabase юзер - чистим по ID
        await supabase
            .from('vigil_hearts')
            .update({ owner_id: null, owner_name: null, intention: null, last_lit_at: null })
            .eq('owner_id', userId)
            .neq('id', heartId) // Не трогаем текущее (на всякий случай, хотя upsert перепишет)
    } else {
        // Если это Telegram юзер (у него нет UUID в базе) - чистим по Имени
        // Это компромисс, пока в базе нет колонки telegram_id
        await supabase
            .from('vigil_hearts')
            .update({ owner_id: null, owner_name: null, intention: null, last_lit_at: null })
            .eq('owner_name', ownerName)
            .neq('id', heartId)
    }

    // 3. Prepare Owner Logic
    let ownerIdToWrite: string | null = null;
    if (isUUID(userId)) {
        ownerIdToWrite = userId;
    }

    const up: Record<string, unknown> = {
      id: heartId,
      owner_name: ownerName,
      owner_id: ownerIdToWrite,
      last_lit_at: new Date().toISOString()
    }

    // Preserve an existing intention if the caller didn't send a new one.
    if (typeof intention === 'string' && intention.trim()) {
      up.intention = intention.trim().slice(0, 280)
    }

    // 4. Claim new vessel
    const { data, error } = await supabase.from('vigil_hearts').upsert(up, { onConflict: 'id' }).select().single()

    if (error) {
      console.error('vigil claim error:', error)
      return NextResponse.json({ error: 'db error', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, record: data })
  } catch (e: any) {
    console.error('vigil claim unexpected', e)
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
