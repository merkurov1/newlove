import { isAuthenticationError } from '@/lib/auth/errors';
import { NextResponse } from 'next/server';

import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';
import { analyticsEncryptionKeySource } from '@/lib/analytics/website/tokenCrypto';
import {
  WEBSITE_ANALYTICS_MEASUREMENT_ID,
  getAnalyticsTimezone,
  getGoogleAccountOverride,
  getGoogleOAuthConfig,
  getGooglePropertyOverride,
  getSearchConsoleSiteOverride,
  getSiteUrl,
  getUmamiConfig,
} from '@/lib/analytics/website/config';
import { loadSourceHealth } from '@/lib/analytics/website/dataset';
import { getYouTubeChannelId, getYouTubeDataApiKey } from '@/lib/youtube/config';
import { loadYouTubeConnectionState } from '@/lib/youtube/connection';

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

  const health = await loadSourceHealth();
  const google = getGoogleOAuthConfig();
  const umami = getUmamiConfig();
  const store = getServerSupabaseClient({ useServiceRole: true });
  const youtube = await loadYouTubeConnectionState(store).catch(() => null);

  return json({
    ok: true,
    generatedAt: new Date().toISOString(),
    timezone: getAnalyticsTimezone(),
    measurementId: WEBSITE_ANALYTICS_MEASUREMENT_ID,
    sources: health.sources,
    coverage: health.coverage,
    runs: health.runs.map((run) => ({
      id: run.id,
      provider: run.provider,
      mode: run.mode,
      status: run.status,
      rangeStart: run.range_start,
      rangeEnd: run.range_end,
      rowsWritten: run.rows_written,
      errorCode: run.error_code,
      errorMessage: run.error_message,
      startedAt: run.started_at,
      finishedAt: run.finished_at,
    })),
    configuration: {
      googleOAuthConfigured: google.configured,
      googleMissing: google.missing,
      redirectUri: google.redirectUri,
      siteUrl: getSiteUrl(),
      ga4AccountOverride: getGoogleAccountOverride(),
      ga4PropertyOverride: getGooglePropertyOverride(),
      gscSiteOverride: getSearchConsoleSiteOverride(),
      measurementId: WEBSITE_ANALYTICS_MEASUREMENT_ID,
      encryptionKeySource: analyticsEncryptionKeySource(),
      umamiConfigured: umami.configured,
      umamiMissing: umami.missing,
      youtubeChannelId: getYouTubeChannelId(),
      youtubeDataApiKeyConfigured: Boolean(getYouTubeDataApiKey()),
      youtube,
    },
  });
}
