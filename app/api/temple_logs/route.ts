import { NextResponse } from 'next/server'
import { getServerSupabaseClient } from '@/lib/serverAuth'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import {
  invalidateTempleFeedCache,
  resolveTempleFeed,
} from '@/lib/temple/feed.server'
import { resolveTempleIdentity } from '@/lib/temple/identity'
import {
  CALM_COMPLETION_THRESHOLD_SECONDS,
  calmCompletionMessage,
  isCalmRitualComplete,
} from '@/lib/temple/calm'
import {
  publicTempleTraceAuthor,
  publicTempleTraceMessage,
  publicTempleTraceUserId,
} from '@/lib/temple/publicTrace'

export const runtime = 'nodejs'

// VIGIL_SPARK and TRIBUTE are deliberately absent: only their trusted server
// routes may write them (after identity/cooldown or verified payment).
const EVENT_TYPES = new Set(['VIGIL', 'ASH', 'CAST', 'ABSOLUTION', 'MODAL_OPEN', 'INTENSITY', 'WHISPER', 'MEDITATION', 'SILENCE', 'HEARTANDANGEL'])

function feedHeaders(cache: string) {
  return {
    // The route owns a documented TTL and the browser hook owns its own cache.
    // Do not let an intermediary keep a permanent copy.
    'Cache-Control': 'no-store',
    'X-Temple-Feed-Cache': cache,
  }
}

export async function GET() {
  try {
    const result = await resolveTempleFeed({
      getClient: () => getServerSupabaseClient({ useServiceRole: true }),
    })

    if (!result.payload) {
      return NextResponse.json(
        {
          ok: false,
          data: [],
          stats: null,
          meta: null,
          error: result.error || 'Temple feed unavailable',
        },
        { status: 503, headers: feedHeaders(result.cache) }
      )
    }

    return NextResponse.json(result.payload, {
      status: 200,
      headers: feedHeaders(result.cache),
    })
  } catch (e) {
    console.error('API GET /api/temple_logs unexpected', e)
    return NextResponse.json(
      {
        ok: false,
        data: [],
        stats: null,
        meta: null,
        error: e instanceof Error ? e.message : String(e),
      },
      { status: 500, headers: feedHeaders('error') }
    )
  }
}

export async function POST(req: Request) {
  const limited = checkRateLimit(getClientIp(req), {
    interval: 60 * 1000,
    maxRequests: 20,
    keyPrefix: 'temple-log',
  })
  if (limited) return limited

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

    const metadata =
      body.metadata && typeof body.metadata === 'object'
        ? (body.metadata as Record<string, unknown>)
        : {}
    const durationSeconds = Number(
      metadata.durationSeconds ?? body.durationSeconds
    )

    // Calm is only complete after the shared ritual threshold. A client that
    // leaves early (or omits its duration) cannot create a public completion
    // event. The duration is not trusted as proof of attendance; it is a
    // consistency guard so the public journal cannot claim a ritual that the
    // scene itself would not have completed.
    if (
      eventType === 'MEDITATION' &&
      !isCalmRitualComplete(durationSeconds)
    ) {
      return NextResponse.json(
        {
          ok: false,
          data: null,
          error: `Calm requires at least ${CALM_COMPLETION_THRESHOLD_SECONDS} seconds of presence`,
        },
        { status: 400 }
      )
    }

    const supabase = getServerSupabaseClient({ useServiceRole: true })

    // Ritual traces are public, but a claimed identity is only ever taken from
    // a verified Telegram session or Supabase token. The body's `author` is a
    // display hint for anonymous visitors and never grants rights or matches a
    // real account automatically.
    const identity = await resolveTempleIdentity(req, supabase)
    const userId =
      identity?.source === 'supabase' ? identity.userId : null
    const claimedAuthor =
      typeof body.author === 'string' ? body.author.trim().slice(0, 120) : ''
    const rawAuthor = identity?.displayName || claimedAuthor || 'Anonymous'
    const rawMessage =
      eventType === 'MEDITATION'
        ? calmCompletionMessage(durationSeconds)
        : String(body.message || '')

    // Write-side allowlist: Absolution is anonymous completion-only and Cast
    // never journals raw answers. Read-side redaction in lib/temple/feed.ts
    // protects legacy rows as well.
    const authorName = publicTempleTraceAuthor(eventType, rawAuthor)
    const publicMessage = publicTempleTraceMessage(eventType, rawMessage)
    const publicUserId = publicTempleTraceUserId(eventType, userId)

    const { data, error } = await supabase.from('temple_log').insert({
      user_id: publicUserId,
      author: authorName,
      event_type: eventType,
      message: publicMessage,
      audio_url: body.audio_url || null,
      created_at: new Date().toISOString(),
    }).select().single()

    if (error) {
      console.error('API POST /api/temple_logs error', error)
      return NextResponse.json({ ok: false, data: null, error: error.message || String(error) }, { status: 500 })
    }

    // A successful write safely invalidates the read cache on this instance.
    // Other instances/cold starts remain bounded by the documented TTL.
    invalidateTempleFeedCache()

    return NextResponse.json({ ok: true, data, error: null }, { status: 201 })
  } catch (e) {
    console.error('API POST /api/temple_logs unexpected', e)
    return NextResponse.json({ ok: false, data: null, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}
