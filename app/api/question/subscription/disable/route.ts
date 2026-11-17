import { NextResponse } from 'next/server';

import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rateLimit';
import { requireUser } from '@/lib/serverAuth';
import { disableQuestionChannel } from '@/lib/question/subscriptions';
import { isQuestionId } from '@/lib/question/validation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    },
  });
}

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  if (!origin) return true;

  try {
    const host = request.headers.get('host');
    return Boolean(host) && new URL(origin).host === host;
  } catch {
    return false;
  }
}

/**
 * Disable one channel for a signed-in subscriber. The update is scoped by the
 * authenticated user id, so another user's subscription cannot be touched.
 */
export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return noStoreJson({ error: 'forbidden' }, 403);
  }

  const limited = checkRateLimit(
    getClientIp(request),
    RATE_LIMITS.QUESTION_SUBSCRIPTION
  );
  if (limited) return limited;

  let user;
  try {
    user = await requireUser();
  } catch {
    return noStoreJson({ error: 'unauthorized' }, 401);
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return noStoreJson({ error: 'invalid_request' }, 400);
  }

  const record =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

  const questionId = typeof record.questionId === 'string' ? record.questionId.trim() : '';
  const channel =
    record.channel === 'email' ||
    record.channel === 'telegram' ||
    record.channel === 'all'
      ? record.channel
      : null;

  if (!isQuestionId(questionId) || !channel) {
    return noStoreJson({ error: 'invalid_request' }, 400);
  }

  const result = await disableQuestionChannel({
    questionId,
    userId: user.id,
    channel,
  });

  if (result === 'not_found') {
    return noStoreJson({ error: 'not_found' }, 404);
  }

  if (result === 'error') {
    return noStoreJson({ error: 'disable_failed' }, 500);
  }

  return noStoreJson({ ok: true, channel });
}
