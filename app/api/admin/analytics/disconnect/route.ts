import { NextResponse } from 'next/server';

import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';
import { openSecret } from '@/lib/analytics/website/tokenCrypto';
import { revokeGoogleToken } from '@/lib/analytics/website/providers/oauth';
import { disableConnection, getStoredConnection } from '@/lib/analytics/website/store';
import type { AnalyticsProvider } from '@/lib/analytics/website/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PROVIDERS: AnalyticsProvider[] = ['google_analytics', 'search_console', 'umami'];

function isProvider(value: unknown): value is AnalyticsProvider {
  return typeof value === 'string' && PROVIDERS.includes(value as AnalyticsProvider);
}

export async function POST(request: Request) {
  try {
    await requireAdminFromRequest(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  const url = new URL(request.url);
  const rawProvider = form?.get('provider') ?? url.searchParams.get('provider');
  const provider = isProvider(rawProvider) ? rawProvider : null;

  if (!provider) {
    return NextResponse.json({ error: 'Unknown provider' }, { status: 400 });
  }

  const store = getServerSupabaseClient({ useServiceRole: true });
  const connection = await getStoredConnection(store, provider).catch(() => null);
  const googleProvider = provider === 'google_analytics' || provider === 'search_console';

  if (googleProvider && connection) {
    const refreshToken = openSecret({
      ciphertext: connection.token_ciphertext,
      iv: connection.token_iv,
      tag: connection.token_tag,
    });

    if (refreshToken) {
      // GA4 and Search Console share one Google grant. Revoking it affects
      // both sources, so both stored tokens are disabled together.
      await revokeGoogleToken(refreshToken);
    }
  }

  await disableConnection(store, provider);

  if (googleProvider) {
    await disableConnection(store, provider === 'google_analytics' ? 'search_console' : 'google_analytics');
  }

  if (form) {
    return NextResponse.redirect(
      new URL(`/admin/pierrot/analytics?disconnected=${provider}`, request.url)
    );
  }

  return NextResponse.json(
    { ok: true, provider },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}
