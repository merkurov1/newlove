import { NextResponse } from 'next/server';

import { requireAdminFromRequest } from '@/lib/serverAuth';
import { getAnalyticsTimezone } from '@/lib/analytics/website/config';
import { runAnalyticsSync, type SyncMode } from '@/lib/analytics/website/sync';
import type { AnalyticsProvider } from '@/lib/analytics/website/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PROVIDERS: AnalyticsProvider[] = ['google_analytics', 'search_console', 'umami'];
const MODES: SyncMode[] = ['manual', 'incremental', 'backfill', 'repair'];

function isProvider(value: unknown): value is AnalyticsProvider {
  return typeof value === 'string' && PROVIDERS.includes(value as AnalyticsProvider);
}

function isMode(value: unknown): value is SyncMode {
  return typeof value === 'string' && MODES.includes(value as SyncMode);
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

function daysAgoIso(days: number): string {
  const timezone = getAnalyticsTimezone();
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - (days - 1));
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: getAnalyticsTimezone(),
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
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

  const rawProvider = body.provider;
  const providers = isProvider(rawProvider) ? [rawProvider] : PROVIDERS;

  const rawMode = body.mode;
  const mode: SyncMode = isMode(rawMode) ? rawMode : 'manual';

  const rawDays = Number(body.days);
  const days = Number.isFinite(rawDays) && rawDays >= 1 && rawDays <= 365 ? Math.floor(rawDays) : null;

  const today = todayIso();
  const range = days
    ? { start: daysAgoIso(days), end: today }
    : undefined;

  try {
    const results = await runAnalyticsSync({
      mode: mode === 'manual' ? (days ? 'manual' : 'incremental') : mode,
      providers,
      range,
    });

    if (form) {
      const summary = results
        .map((result) => `${result.provider}:${result.status}`)
        .join(',');
      return NextResponse.redirect(
        new URL(`/admin/pierrot/analytics?sync=${encodeURIComponent(summary)}`, request.url)
      );
    }

    return json({ ok: true, results });
  } catch (error) {
    return json(
      {
        ok: false,
        error: error instanceof Error ? error.message.slice(0, 200) : 'sync_failed',
      },
      500
    );
  }
}
