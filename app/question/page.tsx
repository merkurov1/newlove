import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';

import QuestionExperience from '@/components/question/QuestionExperience';
import { getCurrentUser } from '@/lib/serverAuth';
import { getQuestionPageData } from '@/lib/question/store';
import { questionPageMetadata } from '@/lib/question/metadata';
import { isQuestionId } from '@/lib/question/validation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

export const metadata: Metadata = questionPageMetadata;

type QuestionPageProps = {
  searchParams?: {
    q?: string | string[];
  };
};

export default async function QuestionPage({ searchParams }: QuestionPageProps) {
  noStore();

  const requested = Array.isArray(searchParams?.q) ? searchParams?.q[0] : searchParams?.q;
  const requestedQuestionId = isQuestionId(requested) ? requested : null;

  const user = await getCurrentUser();

  let data = await getQuestionPageData({
    questionId: requestedQuestionId,
    userId: user?.id || null,
  });

  // An old return link may point to an archived question. Fall back to the
  // current random question instead of showing a dead page.
  if (!data.question && requestedQuestionId) {
    data = await getQuestionPageData({ questionId: null, userId: user?.id || null });
  }

  return (
    <QuestionExperience
      question={data.question}
      synthesis={data.synthesis}
      hasAnswers={data.hasAnswers}
      isAuthenticated={data.isAuthenticated}
      hasAnswered={data.hasAnswered}
      requestedQuestionId={requestedQuestionId}
    />
  );
}
