import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(sbUrl, sbKey)
const EVENT_TYPES = new Set(['VIGIL', 'VIGIL_SPARK', 'ASH', 'CAST', 'ABSOLUTION', 'TRIBUTE', 'MODAL_OPEN', 'INTENSITY', 'WHISPER', 'MEDITATION', 'SILENCE', 'HEARTANDANGEL'])

export async function GET(req: Request) {
  try {
    const { data, error } = await supabase
      .from('temple_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('API GET /api/temple_logs error', error)
      return NextResponse.json({ ok: false, data: [], error: error.message || String(error) }, { status: 500 })
    }

    return NextResponse.json({ ok: true, data: data ?? [], error: null })
  } catch (e: any) {
    console.error('API GET /api/temple_logs unexpected', e)
    return NextResponse.json({ ok: false, data: [], error: String(e?.message || e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ ok: false, data: null, error: 'JSON object required' }, { status: 400 })
    }
    const eventType = String(body.event_type || 'WHISPER').toUpperCase()
    if (!EVENT_TYPES.has(eventType)) {
      return NextResponse.json({ ok: false, data: null, error: 'Unsupported event_type' }, { status: 400 })
    }
    if ((!body.message || typeof body.message !== 'string') && !body.audio_url) {
      return NextResponse.json({ ok: false, data: null, error: 'message or audio required' }, { status: 400 })
    }
    if (String(body.message || '').length > 4000 || String(body.author || '').length > 120) {
      return NextResponse.json({ ok: false, data: null, error: 'Log fields are too long' }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization')
    let userId: string | null = null
    let authorName = body.author || 'Anonymous'

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '')
      const { data: { user } } = await supabase.auth.getUser(token)
      if (user) {
        userId = user.id
        const { data: profile } = await supabase
          .from('users')
          .select('name')
          .eq('id', userId)
          .maybeSingle()

        if (profile?.name) {
          authorName = profile.name
        } else if (user.user_metadata?.name) {
          authorName = user.user_metadata.name
        } else if (user.email) {
          authorName = user.email.split('@')[0]
        }
      }
    }

    const { data, error } = await supabase.from('temple_log').insert({
      user_id: userId,
      author: authorName,
      event_type: eventType,
      message: String(body.message || ''),
      audio_url: body.audio_url || null,
      created_at: new Date().toISOString(),
    }).select().single()

    if (error) {
      console.error('API POST /api/temple_logs error', error)
      return NextResponse.json({ ok: false, data: null, error: error.message || String(error) }, { status: 500 })
    }

    return NextResponse.json({ ok: true, data, error: null }, { status: 201 })
  } catch (e: any) {
    console.error('API POST /api/temple_logs unexpected', e)
    return NextResponse.json({ ok: false, data: null, error: String(e?.message || e) }, { status: 500 })
  }
}
