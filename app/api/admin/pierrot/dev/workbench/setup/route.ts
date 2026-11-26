import { isAuthenticationError } from '@/lib/auth/errors';
import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { getSetupReport } from '@/lib/pierrot/dev/workbench/setup';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 30;

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

  try {
    const setup = await getSetupReport();
    return json({ setup, checkedBy: admin.id });
  } catch (error) {
    console.error('[Pierrot Dev Workbench] setup check failed', {
      code: error instanceof Error ? error.name : 'unknown',
    });
    return json(
      {
        error:
          'Setup check failed. The Workbench may require the additive migration or GitHub access.',
        code: 'SETUP_CHECK_FAILED',
      },
      502
    );
  }
}

export async function POST(req: Request) {
  // Re-check is the only supported POST; it is intentionally side-effect free.
  return GET(req);
}
