import { NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import {
  loadTempleChroniclesPage,
} from '@/lib/temple/chronicles.server';
import { loadTemplePublicAggregates } from '@/lib/temple/feed.server';
import { TEMPLE_CHRONICLES_PAGE_SIZE } from '@/lib/temple/feed';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store',
} as const;

function emptyPage(limit: number) {
  return {
    nextCursor: null,
    hasMore: false,
    limit,
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = url.searchParams.get('limit');
  const before = url.searchParams.get('before');
  const limit = requestedLimit
    ? Number(requestedLimit)
    : TEMPLE_CHRONICLES_PAGE_SIZE;

  try {
    const client = getServerSupabaseClient({ useServiceRole: true });
    const nowMs = Date.now();

    const result = await loadTempleChroniclesPage(client, {
      before,
      limit,
      nowMs,
    });

    if (result.badCursor) {
      return NextResponse.json(
        {
          ok: false,
          events: [],
          pageInfo: emptyPage(result.limit),
          aggregates: null,
          error: 'Invalid chronicle cursor',
        },
        { status: 400, headers: NO_STORE_HEADERS }
      );
    }

    // Aggregates describe the rolling window, so they only belong on the first
    // page. Loading older pages must not recompute or repeat them.
    const aggregates = before
      ? null
      : (await loadTemplePublicAggregates(client, nowMs)).aggregates;

    return NextResponse.json(
      {
        ok: true,
        events: result.page.events,
        pageInfo: {
          nextCursor: result.page.nextCursor,
          hasMore: result.page.hasMore,
          limit: result.limit,
        },
        aggregates,
        error: null,
      },
      { status: 200, headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('API GET /api/temple_logs/chronicles error', error);

    return NextResponse.json(
      {
        ok: false,
        events: [],
        pageInfo: emptyPage(Number.isFinite(limit) ? limit : TEMPLE_CHRONICLES_PAGE_SIZE),
        aggregates: null,
        error: 'The chronicle is temporarily unavailable',
      },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }
}
