import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const runtime = 'nodejs'

const sbUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(sbUrl, sbKey)

export async function GET(req: Request) {
  try {
    const { data, error } = await supabase
      .from('temple_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)

    if (error) {
      console.error('API GET /api/temple_logs error', error)
      return NextResponse.json({ error: error.message || String(error) }, { status: 500 })
    }

    return NextResponse.json({ data: data ?? [] })
  } catch (e: any) {
    console.error('API GET /api/temple_logs unexpected', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    if (!body?.message && !body?.audio_url) {
      return NextResponse.json({ error: 'message or audio required' }, { status: 400 })
    }

    // Пытаемся извлечь пользователя из заголовка авторизации
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
      event_type: body.event_type || 'WHISPER',
      message: body.message || '',
      audio_url: body.audio_url || null,
      created_at: new Date().toISOString(),
    }).select().single()

    if (error) {
      console.error('API POST /api/temple_logs error', error)
      return NextResponse.json({ error: error.message || String(error) }, { status: 500 })
    }

    return NextResponse.json({ data }, { status: 201 })
  } catch (e: any) {
    console.error('API POST /api/temple_logs unexpected', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
