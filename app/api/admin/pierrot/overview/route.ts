import { NextResponse } from 'next/server';

import { requireAdminFromRequest } from '@/lib/serverAuth';
import { createPierrotStore } from '@/lib/pierrot/serverStore';
import { loadBrainStatus } from '@/lib/pierrot/memory/brainStatus';
import { loadWorkspaceOverview } from '@/lib/pierrot/workspace/data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0, must-revalidate',
  'X-Robots-Tag': 'noindex, nofollow',
};

/**
 * One authenticated owner refresh for both aggregate overview and memory
 * status. It replaces a burst of independent client requests and forces a
 * fresh check on both sources.
 */
export async function POST(request: Request) {
  let user: Awaited<ReturnType<typeof requireAdminFromRequest>>;

  try {
    user = await requireAdminFromRequest(request);
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Unauthorized' },
      { status: 401, headers: NO_STORE_HEADERS }
    );
  }

  const store = createPierrotStore();

  const [overviewResult, brainResult] = await Promise.allSettled([
    loadWorkspaceOverview(7),
    loadBrainStatus(store, user.id, { force: true, detailed: false }),
  ]);

  const overview = overviewResult.status === 'fulfilled' ? overviewResult.value : null;
  const brainStatus = brainResult.status === 'fulfilled' ? brainResult.value : null;
  const partial = overviewResult.status !== 'fulfilled' || brainResult.status !== 'fulfilled';

  if (!overview && !brainStatus) {
    return NextResponse.json(
      {
        ok: false,
        partial: true,
        error: 'refresh_failed',
        overview: null,
        brainStatus: null,
        refreshedAt: new Date().toISOString(),
      },
      { status: 503, headers: NO_STORE_HEADERS }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      partial,
      overview,
      brainStatus,
      refreshedAt: new Date().toISOString(),
    },
    { headers: NO_STORE_HEADERS }
  );
}
