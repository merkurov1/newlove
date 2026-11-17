import { NextResponse } from 'next/server';

import { checkRateLimit, getClientIp, RATE_LIMITS } from '@/lib/rateLimit';
import { confirmQuestionEmailToken } from '@/lib/question/subscriptions';

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
 * Email confirmation link. The token is single use and expiring; the response
 * is a redirect so the visitor sees a readable state page instead of JSON.
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

  const result = await confirmQuestionEmailToken(token);

  if (result.status === 'confirmed') {
    return statusRedirect(request, {
      state: 'email_confirmed',
      q: result.questionId,
    });
  }

  return statusRedirect(request, { state: result.status });
}
