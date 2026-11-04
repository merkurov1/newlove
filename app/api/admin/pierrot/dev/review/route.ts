import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { getClientIp } from '@/lib/rateLimit';
import { checkPierrotRateLimit } from '@/lib/pierrot/rateLimit';
import { formatReviewMarkdown, reviewDevTask } from '@/lib/pierrot/dev/review';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function POST(req: Request) {
  let admin: Awaited<ReturnType<typeof requireAdminFromRequest>>;
  try {
    admin = await requireAdminFromRequest(req);
  } catch {
    return json({ error: 'Unauthorized' }, 401);
  }

  const limited = await checkPierrotRateLimit({
    identifier: `dev-review:${admin.id || getClientIp(req)}`,
    intervalMs: 60 * 1000,
    maxRequests: 10,
    keyPrefix: 'pierrot-dev-review',
  });
  if (limited) return limited;

  const body = await req.json().catch(() => ({}));
  const taskId = body && typeof body.taskId === 'string' ? body.taskId : '';
  const head = body && typeof body.head === 'string' ? body.head : undefined;
  const base = body && typeof body.base === 'string' ? body.base : undefined;

  if (!UUID_PATTERN.test(taskId)) {
    return json({ error: 'A valid taskId is required.' }, 400);
  }

  try {
    const result = await reviewDevTask(admin.id, taskId, { head, base });
    if (!result) return json({ error: 'Task not found.' }, 404);

    return json({
      task: result.task,
      report: result.report,
      markdown: formatReviewMarkdown(result.report),
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'DEV_REVIEW_FAILED';
    console.error('[Pierrot Dev] review failed', { code });
    return json(
      {
        error: 'Engineering review failed.',
        code,
        detail: error instanceof Error ? error.message.slice(0, 500) : null,
      },
      500
    );
  }
}
