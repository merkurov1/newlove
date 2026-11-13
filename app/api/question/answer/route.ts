import { NextResponse } from 'next/server';

import { requireUser } from '@/lib/serverAuth';
import { QUESTION_MIN_WORDS } from '@/lib/question/constants';
import { submitQuestionAnswer } from '@/lib/question/store';
import { requestQuestionSynthesis } from '@/lib/question/synthesis';
import { isQuestionId, validateQuestionAnswer } from '@/lib/question/validation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

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

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return noStoreJson({ error: 'forbidden' }, 403);
  }

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

  if (!isQuestionId(questionId)) {
    return noStoreJson({ error: 'invalid_question' }, 400);
  }

  const validation = validateQuestionAnswer(record.content);

  if (!validation.ok) {
    if (validation.reason === 'too_short') {
      return noStoreJson(
        { error: 'too_short', minWords: QUESTION_MIN_WORDS, wordCount: validation.wordCount },
        400
      );
    }

    if (validation.reason === 'too_long') {
      return noStoreJson({ error: 'too_long' }, 400);
    }

    return noStoreJson({ error: 'empty_answer' }, 400);
  }

  const saved = await submitQuestionAnswer({
    questionId,
    userId: user.id,
    content: validation.content,
    wordCount: validation.wordCount,
  });

  if (!saved.ok) {
    if (saved.reason === 'already_answered') {
      return noStoreJson({ error: 'already_answered' }, 409);
    }

    if (saved.reason === 'inactive') {
      return noStoreJson({ error: 'question_unavailable' }, 404);
    }

    if (saved.reason === 'invalid') {
      return noStoreJson({ error: 'invalid_answer' }, 400);
    }

    return noStoreJson({ error: 'save_failed' }, 500);
  }

  // Generation is triggered by the corpus change, never by a page view. A
  // provider failure is contained here: the human answer is already committed
  // and the response still confirms it.
  const synthesis = await requestQuestionSynthesis(questionId);

  return noStoreJson({
    ok: true,
    savedAt: new Date().toISOString(),
    synthesisState:
      synthesis.status === 'ready'
        ? 'ready'
        : synthesis.status === 'failed'
          ? 'deferred'
          : 'pending',
    synthesis:
      synthesis.status === 'ready' && synthesis.content
        ? { content: synthesis.content }
        : null,
  });
}
