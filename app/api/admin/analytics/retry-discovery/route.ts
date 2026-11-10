import { NextResponse } from 'next/server';

import { requireAdminFromRequest, getServerSupabaseClient } from '@/lib/serverAuth';
import {
  resolveGoogleRefreshCredential,
  runGoogleDiscovery,
} from '@/lib/analytics/website/discovery';
import { refreshGoogleAccessToken } from '@/lib/analytics/website/providers/oauth';
import {
  AnalyticsProviderError,
  diagnosticFromError,
} from '@/lib/analytics/website/providers/http';
import { getStoredConnection, markConnectionError } from '@/lib/analytics/website/store';
import { openSecret } from '@/lib/analytics/website/tokenCrypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type GoogleProvider = 'google_analytics' | 'search_console';

function isGoogleProvider(value: unknown): value is GoogleProvider {
  return value === 'google_analytics' || value === 'search_console';
}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function errorReason(error: unknown): string {
  if (error instanceof AnalyticsProviderError) return error.code;
  return 'discovery_failed';
}

export async function POST(request: Request) {
  try {
    await requireAdminFromRequest(request);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const form = await request.formData().catch(() => null);
  const body: Record<string, unknown> = form
    ? Object.fromEntries(form.entries())
    : await request.json().catch(() => ({}));

  const requested = isGoogleProvider(body.provider) ? [body.provider] : null;
  const providers: GoogleProvider[] = requested ?? ['google_analytics', 'search_console'];

  const store = getServerSupabaseClient({ useServiceRole: true });
  const [gaConnection, gscConnection] = await Promise.all([
    getStoredConnection(store, 'google_analytics').catch(() => null),
    getStoredConnection(store, 'search_console').catch(() => null),
  ]);

  const credential =
    gaConnection?.token_ciphertext || gscConnection?.token_ciphertext
      ? gaConnection?.token_ciphertext
        ? gaConnection
        : gscConnection
      : null;

  if (!credential) {
    for (const provider of providers) {
      await markConnectionError(
        store,
        provider,
        'needs_reauthorization',
        'No stored Google authorization. Reconnect Google before retrying discovery.'
      );
    }

    if (form) {
      return NextResponse.redirect(
        new URL(
          `/admin/pierrot/analytics?discovery=error&reason=needs_reauthorization`,
          request.url
        )
      );
    }

    return json({ ok: false, error: 'needs_reauthorization' }, 409);
  }

  const refreshToken =
    credential.token_ciphertext && credential.token_iv && credential.token_tag ? credential : null;

  if (!refreshToken) {
    if (form) {
      return NextResponse.redirect(
        new URL(
          `/admin/pierrot/analytics?discovery=error&reason=needs_reauthorization`,
          request.url
        )
      );
    }

    return json({ ok: false, error: 'needs_reauthorization' }, 409);
  }

  try {
    const plaintext = openSecret({
      ciphertext: refreshToken.token_ciphertext,
      iv: refreshToken.token_iv,
      tag: refreshToken.token_tag,
    });

    if (!plaintext) {
      for (const provider of providers) {
        await markConnectionError(
          store,
          provider,
          'needs_reauthorization',
          'The stored Google authorization cannot be decrypted. Reconnect Google.'
        );
      }

      if (form) {
        return NextResponse.redirect(
          new URL(
            `/admin/pierrot/analytics?discovery=error&reason=needs_reauthorization`,
            request.url
          )
        );
      }

      return json({ ok: false, error: 'needs_reauthorization' }, 409);
    }

    const tokens = await refreshGoogleAccessToken(plaintext);
    const grantedScopes =
      (tokens.scope || '').split(' ').filter(Boolean).length > 0
        ? (tokens.scope || '').split(' ').filter(Boolean)
        : [...(gaConnection?.scopes ?? []), ...(gscConnection?.scopes ?? [])];

    const nextCredential = resolveGoogleRefreshCredential({
      newRefreshToken: tokens.refreshToken,
      existing: credential,
    });

    const results = await runGoogleDiscovery(store, {
      accessToken: tokens.accessToken,
      scopes: [...new Set(grantedScopes)],
      sealed: nextCredential.sealed,
      providers,
    });

    if (form) {
      const summary = results.map((result) => `${result.provider}:${result.status}`).join(',');
      return NextResponse.redirect(
        new URL(`/admin/pierrot/analytics?discovery=${encodeURIComponent(summary)}`, request.url)
      );
    }

    return json({ ok: true, results });
  } catch (error) {
    const diagnostic = diagnosticFromError(error, {
      provider: 'google_oauth',
      stage: 'refresh',
    });

    for (const provider of providers) {
      await markConnectionError(store, provider, diagnostic.code, diagnostic.message);
    }

    if (form) {
      return NextResponse.redirect(
        new URL(
          `/admin/pierrot/analytics?discovery=error&reason=${encodeURIComponent(
            errorReason(error)
          )}`,
          request.url
        )
      );
    }

    return json({ ok: false, error: diagnostic.code }, 502);
  }
}
