import { isAuthenticationError } from '@/lib/auth/errors';
import { NextResponse } from 'next/server';

import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';
import { getGoogleOAuthConfig } from '@/lib/analytics/website/config';
import {
  YOUTUBE_MANAGEMENT_SCOPES,
  YOUTUBE_REQUIRED_SCOPES,
  getYouTubeChannelId,
  getYouTubeDataApiKey,
  getYouTubeManagementRedirectUri,
  getYouTubeTimezone,
} from '@/lib/youtube/config';
import { checkYouTubeMultichannelSchema } from '@/lib/youtube/channels';
import { loadYouTubeConnectionState } from '@/lib/youtube/connection';
import { getYouTubeSharedProjects } from '@/lib/youtube/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
 * Owner-facing diagnostics. It returns connection state and timestamps only;
 * access tokens, refresh tokens and ciphertext never leave the server.
 */
export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request);
  } catch (error) {
    if (!isAuthenticationError(error)) {
      console.error('[admin-auth]', error);
      throw error;
    }

    return json({ error: 'Unauthorized' }, 401);
  }

  const store = getServerSupabaseClient({ useServiceRole: true });
  const schema = await checkYouTubeMultichannelSchema(store);
  const connection = await loadYouTubeConnectionState(store);
  const google = getGoogleOAuthConfig();

  const latest = await store
    .from('analytics_snapshots')
    .select('report_type,period_start,period_end,created_at')
    .eq('provider', 'youtube')
    .order('created_at', { ascending: false })
    .limit(1)
    .then(
      (result) => (result.error ? null : (result.data?.[0] ?? null)),
      () => null
    );

  return json({
    ok: true,
    generatedAt: new Date().toISOString(),
    // Multi-channel readiness is verified against every additive table with the
    // service-role client, so a stale PostgREST cache is visible here too.
    schemaReady: schema.ready,
    schema,
    timezone: getYouTubeTimezone(),
    sharedProjects: getYouTubeSharedProjects(),
    configured: {
      googleOAuth: google.configured,
      googleMissing: google.missing,
      channelIdSource: getYouTubeChannelId() ? 'environment' : 'oauth_connection',
      publicDataApiKey: Boolean(getYouTubeDataApiKey()),
    },
    requiredScopes: [...YOUTUBE_REQUIRED_SCOPES],
    management: {
      scopes: [...YOUTUBE_MANAGEMENT_SCOPES],
      authorized: connection.managementAuthorized,
      googleAccountEmail: connection.googleAccountEmail,
      authorizedAt: connection.managementAuthorizedAt,
      missingScopes: connection.missingManagementScopes,
      connectUrl: '/api/admin/youtube/management/connect?project=pierrot',
      requiredRedirectUri: getYouTubeManagementRedirectUri(),
    },
    connection: {
      ...connection,
      // Explicitly document that no secret is included.
      tokenPresentServerSide: connection.connected,
      lastReport: latest
        ? {
            reportType: latest.report_type,
            periodStart: latest.period_start,
            periodEnd: latest.period_end,
            createdAt: latest.created_at,
          }
        : null,
    },
    ownerOnly: true,
  });
}
