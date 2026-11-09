import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

import { requireAdminFromRequest } from '@/lib/serverAuth';
import { getGoogleOAuthConfig, getSyncOwnerSecret } from '@/lib/analytics/website/config';
import { buildGoogleConsentUrl, probeGoogleConsentUrl } from '@/lib/analytics/website/providers/oauth';
import { signState } from '@/lib/analytics/website/tokenCrypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'pierrot_analytics_oauth';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

/**
 * Starts a separate, incremental Google consent for read-only analytics.
 * It does not replace or modify the existing Supabase Google login.
 */
export async function GET(request: Request) {
  try {
    const user = await requireAdminFromRequest(request);
    const config = getGoogleOAuthConfig();

    if (!config.configured) {
      return json(
        {
          error: 'google_oauth_not_configured',
          missing: config.missing,
          redirectUri: config.redirectUri,
        },
        503
      );
    }

    const url = new URL(request.url);
    const provider = url.searchParams.get('provider') || 'google_analytics';
    const nonce = crypto.randomBytes(18).toString('base64url');

    const state = signState(
      {
        uid: user.id,
        provider,
        nonce,
        exp: Date.now() + 10 * 60 * 1000,
      },
      getSyncOwnerSecret()
    );

    const consentUrl = buildGoogleConsentUrl({
      state,
      loginHint: user.email ?? null,
    });

    const probe = await probeGoogleConsentUrl(consentUrl);

    if (!probe.ok) {
      return NextResponse.redirect(
        new URL(
          `/admin/pierrot/analytics?connect=error&reason=${encodeURIComponent(
            probe.reason || 'oauth_preflight_failed'
          )}`,
          request.url
        )
      );
    }

    const response = NextResponse.redirect(consentUrl);
    response.cookies.set(STATE_COOKIE, nonce, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/google-analytics',
      maxAge: 600,
    });

    return response;
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }
}
