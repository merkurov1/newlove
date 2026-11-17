import { NextResponse } from 'next/server';

import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rateLimit';
import { unsubscribeQuestionToken } from '@/lib/question/subscriptions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function statusRedirect(request: Request, params: Record<string, string>) {
  const url = new URL('/question/subscription', request.url);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  return NextResponse.redirect(url, {
    status: 303,
    headers: {
      'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
    },
  });
}

/**
 * Tokenized unsubscribe. The link is intentionally simple: it works for
 * anonymous subscribers, is single use, expiring and cannot be enumerated.
 */
export async function GET(request: Request) {
  const limited = checkRateLimit(
    getClientIp(request),
    RATE_LIMITS.QUESTION_SUBSCRIPTION
  );
  if (limited) return limited;

  const token = new URL(request.url).searchParams.get('token') || '';

  if (!token) {
    return statusRedirect(request, { state: 'invalid' });
  }

  const result = await unsubscribeQuestionToken(token);

  if (result.status === 'unsubscribed') {
    return statusRedirect(request, {
      state:
        result.channel === 'email'
          ? 'email_unsubscribed'
          : result.channel === 'telegram'
            ? 'telegram_unsubscribed'
            : 'unsubscribed',
      q: result.questionId,
    });
  }

  return statusRedirect(request, { state: result.status });
}
