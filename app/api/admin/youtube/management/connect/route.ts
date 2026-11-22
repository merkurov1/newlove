import crypto from 'node:crypto';
import { NextResponse } from 'next/server';

import { getGoogleOAuthConfig, getSyncOwnerSecret } from '@/lib/analytics/website/config';
import {
  buildYouTubeManagementConsentUrl,
  probeGoogleConsentUrl,
} from '@/lib/analytics/website/providers/oauth';
import { signState } from '@/lib/analytics/website/tokenCrypto';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { YOUTUBE_MANAGEMENT_CONSENT_SCOPES } from '@/lib/youtube/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATE_COOKIE = 'pierrot_youtube_management_oauth';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function projectFrom(value: string | null): 'pierrot' | 'unframed' {
  return value === 'unframed' ? 'unframed' : 'pierrot';
}

/**
 * Starts a separate incremental consent for YouTube management scopes.
 * Analytics-only grants remain untouched; `include_granted_scopes` keeps any
 * previously granted read scopes for the selected Google account.
 */
export async function GET(request: Request) {
  let user;
  try {
    user = await requireAdminFromRequest(request);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const config = getGoogleOAuthConfig();

  if (!config.configured) {
    return json(
      {
        error: 'google_oauth_not_configured',
        missing: config.missing,
      },
      503
    );
  }

  const url = new URL(request.url);
  const project = projectFrom(url.searchParams.get('project'));
  const loginHint = url.searchParams.get('login_hint')?.trim() || null;
  const selectAccount = url.searchParams.get('select_account') !== 'false';
  const nonce = crypto.randomBytes(18).toString('base64url');

  const state = signState(
    {
      uid: user.id,
      purpose: 'youtube_management',
      project,
      nonce,
      exp: Date.now() + 10 * 60 * 1000,
    },
    getSyncOwnerSecret()
  );

  const consentUrl = buildYouTubeManagementConsentUrl({
    state,
    loginHint,
    selectAccount,
    scopes: YOUTUBE_MANAGEMENT_CONSENT_SCOPES,
  });

  const probe = await probeGoogleConsentUrl(consentUrl);

  if (!probe.ok) {
    return NextResponse.redirect(
      new URL(
        `/admin/pierrot/analytics?youtube_management=error&reason=${encodeURIComponent(
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
    path: '/api/auth/youtube-management',
    maxAge: 600,
  });

  return response;
}
