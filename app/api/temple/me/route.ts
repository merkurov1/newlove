import { NextResponse } from 'next/server'

import {
  getCurrentUser,
  getServerSupabaseClient,
} from '@/lib/serverAuth'
import { resolveTempleIdentity } from '@/lib/temple/identity'

// This route reads request headers (cookies) and must be dynamic.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function supabaseDisplayName(
  user: { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined,
  profileName?: unknown
): string {
  if (typeof profileName === 'string' && profileName.trim()) {
    return profileName.trim()
  }

  const metadataName =
    typeof user?.user_metadata?.name === 'string'
      ? user.user_metadata.name.trim()
      : ''

  return metadataName || user?.email?.split('@')[0]?.trim() || ''
}

/**
 * Returns the display name of a verified Temple participant.
 *
 * The route deliberately ignores the legacy, non-HttpOnly `temple_user`
 * cookie: it is a display cache written by old clients and cannot prove an
 * identity. Only a verified Supabase cookie session or a signed
 * `temple_session` token is accepted.
 */
export async function GET(req: Request) {
  try {
    const current = await getCurrentUser()

    if (current) {
      const displayName = supabaseDisplayName(
        current.user ?? { email: current.email },
        current.profile?.name
      )

      if (displayName) {
        return NextResponse.json(
          { displayName, source: 'supabase' },
          { headers: { 'Cache-Control': 'no-store' } }
        )
      }
    }

    const supabaseAdmin = getServerSupabaseClient({ useServiceRole: true })
    const telegram = await resolveTempleIdentity(req, supabaseAdmin)

    if (telegram) {
      return NextResponse.json(
        { displayName: telegram.displayName, source: telegram.source },
        { headers: { 'Cache-Control': 'no-store' } }
      )
    }

    return NextResponse.json(
      { displayName: null, source: null },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  } catch (e) {
    console.error('GET /api/temple/me unexpected', e)
    return NextResponse.json({ displayName: null, source: null }, { status: 500 })
  }
}
