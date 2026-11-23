import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { getClientIp } from '@/lib/rateLimit';
import { checkPierrotRateLimit } from '@/lib/pierrot/rateLimit';
import { getReleaseOverview } from '@/lib/pierrot/dev/workbench/release';
import {
  advanceProductionRelease,
  ReleaseError,
  startProductionRelease,
} from '@/lib/pierrot/dev/workbench/productionRelease';
import { getActiveProductionRelease } from '@/lib/pierrot/dev/workbench/releaseLedger';
import { WorkbenchUnavailableError } from '@/lib/pierrot/dev/workbench/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function errorResponse(error: unknown) {
  if (error instanceof ReleaseError) {
    return json(
      {
        error: error.message,
        code: error.code,
        detail: error.detail,
      },
      error.status
    );
  }
  if (error instanceof WorkbenchUnavailableError) {
    return json({ error: error.message, code: error.code }, 503);
  }
  console.error('[Pierrot Dev Workbench] production release failed', {
    code: error instanceof Error ? error.name : 'unknown',
  });
  return json({ error: 'The production release action failed.', code: 'RELEASE_FAILED' }, 500);
}

export async function GET(req: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;
  try {
    admin = await requireAdminFromRequest(req);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const url = new URL(req.url);
  if (url.searchParams.get('advance') === '1') {
    try {
      const active = await getActiveProductionRelease();
      if (active) await advanceProductionRelease(active.id);
    } catch (error) {
      // A failed advancement is persisted in the ledger. The readiness response
      // still needs to render so the owner can see the exact blocker.
      console.error('[Pierrot Dev Workbench] release advancement failed', {
        code: error instanceof Error ? error.name : 'unknown',
      });
    }
  }

  try {
    const release = await getReleaseOverview('newlove');
    return json({ release, actorId: admin.id || null });
  } catch (error) {
    console.error('[Pierrot Dev Workbench] release overview failed', {
      code: error instanceof Error ? error.name : 'unknown',
    });
    return json({ error: 'Unable to load production release readiness.' }, 500);
  }
}

export async function POST(req: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;
  try {
    admin = await requireAdminFromRequest(req);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const limited = await checkPierrotRateLimit({
    identifier: `dev-release:${admin.id || getClientIp(req)}`,
    intervalMs: 60 * 1000,
    maxRequests: 20,
    keyPrefix: 'pierrot-dev-release',
  });
  if (limited) return limited;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body.action !== 'string') {
    return json({ error: 'A valid release action is required.' }, 400);
  }

  try {
    if (body.action === 'start') {
      const release = await startProductionRelease({
        actorId: admin.id || 'owner',
        expectedSha: typeof body.expectedSha === 'string' ? body.expectedSha.slice(0, 40) : null,
        confirm: body.confirm === true,
      });
      const overview = await getReleaseOverview('newlove');
      return json(
        { ok: true, release: overview, productionRelease: release },
        release.status === 'blocked' ? 409 : 202
      );
    }

    if (body.action === 'advance') {
      const releaseId = typeof body.releaseId === 'string' ? body.releaseId.slice(0, 80) : '';
      if (!releaseId) return json({ error: 'releaseId is required.' }, 400);
      const release = await advanceProductionRelease(releaseId);
      if (!release) return json({ error: 'Release not found.' }, 404);
      const overview = await getReleaseOverview('newlove');
      return json({ ok: true, release: overview, productionRelease: release });
    }

    return json({ error: 'Unknown release action.' }, 400);
  } catch (error) {
    return errorResponse(error);
  }
}
