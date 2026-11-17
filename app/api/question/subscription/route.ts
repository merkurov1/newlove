import { NextResponse } from 'next/server';

import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rateLimit';
import { getCurrentUser } from '@/lib/serverAuth';
import {
  createQuestionEmailSubscription,
  createQuestionTelegramLink,
  getQuestionChannelAvailability,
  getQuestionSubscriptionStatusForUser,
  type QuestionChannelStatus,
  type QuestionSubscriptionStatus,
} from '@/lib/question/subscriptions';
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
 * Returns channel availability and, for a signed-in caller, their own channel
 * states for one question. It never returns an email or a Telegram identifier.
 */
export async function GET(request: Request) {
  const questionId = new URL(request.url).searchParams.get('questionId') || '';
  if (!isQuestionId(questionId)) {
    return noStoreJson({ error: 'invalid_question' }, 400);
  }

  let userId: string | null = null;
  try {
    const user = await getCurrentUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  const status = await getQuestionSubscriptionStatusForUser({ questionId, userId });
  return noStoreJson(status);
}

/**
 * Opt-in endpoint. Email requires double opt-in; Telegram returns a one-time
 * bot deep link. Nothing is delivered until the channel is confirmed.
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

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return noStoreJson({ error: 'invalid_request' }, 400);
  }

  const record =
    payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : {};

  const questionId = typeof record.questionId === 'string' ? record.questionId.trim() : '';
  if (!isQuestionId(questionId)) {
    return noStoreJson({ error: 'invalid_question' }, 400);
  }

  const wantsEmail = typeof record.email === 'string' && record.email.trim().length > 0;
  const wantsTelegram = record.telegram === true;

  if (!wantsEmail && !wantsTelegram) {
    return noStoreJson({ error: 'no_channel' }, 400);
  }

  let userId: string | null = null;
  try {
    const user = await getCurrentUser();
    userId = user?.id ?? null;
  } catch {
    userId = null;
  }

  const availability = getQuestionChannelAvailability();

  const response: QuestionSubscriptionStatus = {
    email: { state: 'none', available: availability.email },
    telegram: { state: 'none', available: availability.telegram },
  };

  if (wantsEmail) {
    response.email = await createQuestionEmailSubscription({
      questionId,
      email: String(record.email),
      userId,
    });
  }

  if (wantsTelegram) {
    response.telegram = await createQuestionTelegramLink({ questionId, userId });
  }

  const errorCode = [response.email, response.telegram]
    .map((channel: QuestionChannelStatus) => channel.code)
    .find((code) => code === 'invalid_email' || code === 'question_unavailable');

  if (errorCode === 'invalid_email') {
    return noStoreJson({ ...response, error: 'invalid_email' }, 400);
  }

  if (errorCode === 'question_unavailable') {
    return noStoreJson({ ...response, error: 'question_unavailable' }, 404);
  }

  return noStoreJson(response);
}
