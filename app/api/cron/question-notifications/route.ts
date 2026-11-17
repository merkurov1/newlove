import { NextResponse } from 'next/server';

import { isCronAuthorized } from '@/lib/knowledge/brain/cronAuth';
import { processPendingQuestionNotifications } from '@/lib/question/subscriptions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const revalidate = 0;
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

/**
 * Retry/backlog endpoint for Question answer notifications.
 *
 * It is poked by the existing brain_worker_tick scheduler, not by a new cron.
 * The database queue is the source of truth: this handler only claims due rows.
 */
async function handle(request: Request) {
  if (!isCronAuthorized(request)) return json({ error: 'Unauthorized' }, 401);

  try {
    const result = await processPendingQuestionNotifications({ limit: 20 });
    return json({ status: 'ok', result });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'question_notifications_failed';
    console.error('[Question notifications cron]', { code });
    return json({ error: 'question_notifications_failed' }, 500);
  }
}

export async function GET(request: Request) {
  return handle(request);
}

export async function POST(request: Request) {
  return handle(request);
}
