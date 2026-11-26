import { isAuthenticationError } from '@/lib/auth/errors';
import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { getDevCostLedger } from '@/lib/pierrot/dev/workbench/ledgerData';

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

export async function GET(req: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;
  try {
    admin = await requireAdminFromRequest(req);
  } catch (error) {
    if (!isAuthenticationError(error)) {
      console.error('[admin-auth]', error);
      throw error;
    }

    return json({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(req.url);
  const parsed = Number(url.searchParams.get('days') || '30');
  const days = Number.isFinite(parsed) ? Math.min(Math.max(Math.trunc(parsed), 1), 365) : 30;

  try {
    const ledger = await getDevCostLedger(admin.id, { days });
    return json({ ledger });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'DEV_COST_LEDGER_FAILED';
    console.error('[Pierrot Dev Workbench] cost ledger failed', { code });
    return json({ error: 'The cost ledger is unavailable.', code }, 500);
  }
}
