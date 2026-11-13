import { NextResponse } from 'next/server';

import { getPublicQuestion } from '@/lib/question/store';
import { isQuestionId } from '@/lib/question/validation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Public Question endpoint.
 *
 * Returns only the active question, its saved Pierrot synthesis and whether any
 * human answer exists. It never returns answer text, answer ids or authors.
 */
export async function GET(request: Request) {
  const questionId = new URL(request.url).searchParams.get('questionId');
  const { question, synthesis, hasAnswers } = await getPublicQuestion(
    isQuestionId(questionId) ? questionId : null
  );

  return NextResponse.json(
    {
      question,
      synthesis,
      hasAnswers,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      },
    }
  );
}
