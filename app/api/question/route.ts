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
  const searchParams = new URL(request.url).searchParams;
  const questionId = searchParams.get('questionId');
  const excludeQuestionId = searchParams.get('excludeQuestionId');

  let result = await getPublicQuestion(isQuestionId(questionId) ? questionId : null);

  // "Next question" asks for a random question that is not the one already on
  // screen. Retry a few times rather than adding exclusion to the SQL contract.
  if (!isQuestionId(questionId) && isQuestionId(excludeQuestionId)) {
    for (let attempt = 0; attempt < 4 && result.question?.id === excludeQuestionId; attempt += 1) {
      result = await getPublicQuestion(null);
    }
  }

  return NextResponse.json(
    {
      question: result.question,
      synthesis: result.synthesis,
      hasAnswers: result.hasAnswers,
    },
    {
      headers: {
        'Cache-Control': 'private, no-store, max-age=0, must-revalidate',
      },
    }
  );
}
