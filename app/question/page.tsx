import type { Metadata } from 'next';
import { unstable_noStore as noStore } from 'next/cache';
import { notFound } from 'next/navigation';

import QuestionExperience from '@/components/question/QuestionExperience';
import { getCurrentUser } from '@/lib/serverAuth';
import { getPublicQuestion, getQuestionPageData } from '@/lib/question/store';
import { questionPageMetadata, questionShareMetadata } from '@/lib/question/metadata';
import { isQuestionId } from '@/lib/question/validation';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

type QuestionSearchParams = {
  q?: string | string[];
};

// Next.js 15+ (and 16) passes searchParams as a Promise. Reading it
// synchronously silently yields undefined, which used to turn every
// /question?q=… request into a random question lookup.
type QuestionPageProps = {
  searchParams?: Promise<QuestionSearchParams>;
};

type RequestedQuestion = {
  /** True when the URL explicitly carried a q parameter, even an empty one. */
  requested: boolean;
  /** The validated question id, or null when q is absent or malformed. */
  questionId: string | null;
};

async function resolveRequestedQuestion(
  searchParams: QuestionPageProps['searchParams']
): Promise<RequestedQuestion> {
  const params = (await searchParams) ?? {};
  const raw = params.q;

  // A request without q keeps the product behaviour: a random active question.
  if (raw === undefined) {
    return { requested: false, questionId: null };
  }

  // "?q=a&q=b" is not a normal share link, but the first value is the one the
  // browser displayed; use it rather than falling back to a random question.
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const trimmed = typeof candidate === 'string' ? candidate.trim() : '';

  return {
    requested: true,
    questionId: isQuestionId(trimmed) ? trimmed : null,
  };
}

export async function generateMetadata({ searchParams }: QuestionPageProps): Promise<Metadata> {
  const { requested, questionId } = await resolveRequestedQuestion(searchParams);

  if (!requested || !questionId) {
    return questionPageMetadata;
  }

  const { question } = await getPublicQuestion(questionId);

  return question ? questionShareMetadata(question) : questionPageMetadata;
}

export default async function QuestionPage({ searchParams }: QuestionPageProps) {
  noStore();

  const { requested, questionId } = await resolveRequestedQuestion(searchParams);

  // A malformed q must not silently fall back to a random question.
  if (requested && !questionId) {
    notFound();
  }

  const user = await getCurrentUser();

  const data = await getQuestionPageData({
    questionId,
    userId: user?.id || null,
  });

  // An explicitly requested question can be archived or deleted. Never replace
  // it with an unrelated random question: the URL promised a specific record.
  if (requested && !data.question) {
    notFound();
  }

  return (
    <QuestionExperience
      question={data.question}
      synthesis={data.synthesis}
      hasAnswers={data.hasAnswers}
      isAuthenticated={data.isAuthenticated}
      hasAnswered={data.hasAnswered}
      isAdmin={user?.role === 'ADMIN'}
      requestedQuestionId={questionId}
    />
  );
}
