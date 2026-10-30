import { NextResponse } from 'next/server';

import { loadPierrotViewMetrics } from '@/lib/analytics/pierrotViews';
import { getServerSupabaseClient, requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    await requireAdminFromRequest(request);
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const store = getServerSupabaseClient({ useServiceRole: true });
    const metrics = await loadPierrotViewMetrics(store);

    return NextResponse.json(
      { status: 'ok', metrics },
      {
        headers: {
          'Cache-Control': 'no-store, max-age=0, must-revalidate',
          'X-Robots-Tag': 'noindex, nofollow',
        },
      }
    );
  } catch {
    return NextResponse.json({ error: 'Analytics views are unavailable.' }, { status: 503 });
  }
}
