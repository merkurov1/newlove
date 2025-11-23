/* ===== FILE: app/api/vigil/claim/route.ts ===== */

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verifySession } from '@/lib/session'

export const runtime = 'nodejs'

// Проверка формата UUID
function isUUID(str: string) {
  const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return regex.test(str);
}

export async function POST(req: Request) {
  try {
    const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!sbUrl || !sbKey) return NextResponse.json({ error: 'server misconfigured' }, { status: 500 })

    const supabase = createClient(sbUrl, sbKey)

    const body = await req.json().catch(() => ({}))
    const { id, name, intention } = body || {}
    if (!id || !name) return NextResponse.json({ error: 'missing params' }, { status: 400 })

    // 1. Auth check
    let token: string | null = null
    const cookie = req.headers.get('cookie') || ''
    const m = cookie.match(/(?:^|; )temple_session=([^;]+)/)
    if (m) {
      token = decodeURIComponent(m[1])
    } else if (body && body.token) {
      token = String(body.token)
    } else {
      const auth = req.headers.get('authorization') || ''
      const b = auth.match(/Bearer (.+)/)
      if (b) token = b[1]
    }

    if (!token) return NextResponse.json({ error: 'not authenticated' }, { status: 401 })
    const session = verifySession(token as string)
    if (!session || !session.userId) return NextResponse.json({ error: 'invalid session' }, { status: 401 })

    const userId = session.userId
    const ownerName = session.displayName || name

    // 2. SINGLE TENANCY PROTOCOL (Закон Одной Искры)
    // Прежде чем занять новое, гасим старое.
    if (isUUID(userId)) {
        // Если это Supabase юзер - чистим по ID
        await supabase
            .from('vigil_hearts')
            .update({ owner_id: null, owner_name: null, intention: null, last_lit_at: null })
            .eq('owner_id', userId)
            .neq('id', Number(id)) // Не трогаем текущее (на всякий случай, хотя upsert перепишет)
    } else {
        // Если это Telegram юзер (у него нет UUID в базе) - чистим по Имени
        // Это компромисс, пока в базе нет колонки telegram_id
        await supabase
            .from('vigil_hearts')
            .update({ owner_id: null, owner_name: null, intention: null, last_lit_at: null })
            .eq('owner_name', ownerName)
            .neq('id', Number(id))
    }

    // 3. Prepare Owner Logic
    let ownerIdToWrite = null;
    if (isUUID(userId)) {
        ownerIdToWrite = userId;
    } 

    const up = {
      id: Number(id),
      owner_name: ownerName,
      owner_id: ownerIdToWrite,
      intention: intention || null,
      last_lit_at: new Date().toISOString()
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