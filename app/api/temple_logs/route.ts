import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

export async function GET(req: Request) {
  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth')
    const srv = getServerSupabaseClient({ useServiceRole: true })

    const { data, error } = await srv
      .from('temple_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)

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
    if (!body?.message) return NextResponse.json({ error: 'message required' }, { status: 400 })

    const { getServerSupabaseClient } = await import('@/lib/serverAuth')
    const srv = getServerSupabaseClient({ useServiceRole: true })

    const { data, error } = await srv.from('temple_log').insert({
      event_type: body.event_type || 'nav',
      message: body.message,
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
