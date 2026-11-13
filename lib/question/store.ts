import type { SupabaseClient } from '@supabase/supabase-js';

import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import type { PublicQuestion, PublicSynthesis, QuestionPageData } from './constants';
import { isQuestionId } from './validation';

assertServerOnly('lib/question/store');

export function getQuestionServiceClient(): SupabaseClient {
  return getServerSupabaseClient({ useServiceRole: true });
}

type PublicQuestionRow = {
  id?: unknown;
  question?: unknown;
  synthesis_content?: unknown;
  synthesis_updated_at?: unknown;
  synthesis_version?: unknown;
  has_answers?: unknown;
};

function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) || null;
  if (value && typeof value === 'object') return value as T;
  return null;
}

function normalizePublicQuestion(row: PublicQuestionRow | null): {
  question: PublicQuestion | null;
  synthesis: PublicSynthesis | null;
  hasAnswers: boolean;
} {
  if (!row || !isQuestionId(row.id) || typeof row.question !== 'string') {
    return { question: null, synthesis: null, hasAnswers: false };
  }

  const content = typeof row.synthesis_content === 'string' ? row.synthesis_content.trim() : '';
  const version =
    typeof row.synthesis_version === 'number' && Number.isFinite(row.synthesis_version)
      ? Math.trunc(row.synthesis_version)
      : 0;

  return {
    question: { id: row.id, text: row.question },
    synthesis: content
      ? {
          content,
          updatedAt:
            typeof row.synthesis_updated_at === 'string' ? row.synthesis_updated_at : null,
          version,
        }
      : null,
    hasAnswers: row.has_answers === true,
  };
}

/**
 * Reads one active question and its public synthesis.
 *
 * A missing id means "random active question". The random choice happens in
 * Postgres, so a page refresh does not reuse a cached question. Only public
 * columns are returned; the human corpus never enters this result.
 */
export async function getPublicQuestion(
  questionId: string | null
): Promise<ReturnType<typeof normalizePublicQuestion>> {
  const supabase = getQuestionServiceClient();
  const { data, error } = await supabase.rpc('question_public_page', {
    p_question_id: isQuestionId(questionId) ? questionId : null,
  });

  if (error) {
    console.error('[Question] Public question lookup failed:', error.code || 'unknown');
    return { question: null, synthesis: null, hasAnswers: false };
  }

  return normalizePublicQuestion(firstRow<PublicQuestionRow>(data));
}

export async function hasUserAnsweredQuestion(
  questionId: string,
  userId: string
): Promise<boolean> {
  if (!isQuestionId(questionId) || !userId) return false;

  const supabase = getQuestionServiceClient();
  const { data, error } = await supabase
    .from('question_answers')
    .select('id')
    .eq('question_id', questionId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[Question] Answer state lookup failed:', error.code || 'unknown');
    return false;
  }

  return Boolean(data);
}

export async function getQuestionPageData(input: {
  questionId: string | null;
  userId: string | null;
}): Promise<QuestionPageData> {
  const { question, synthesis, hasAnswers } = await getPublicQuestion(input.questionId);

  const hasAnswered =
    question && input.userId
      ? await hasUserAnsweredQuestion(question.id, input.userId)
      : false;

  return {
    question,
    synthesis,
    hasAnswers,
    isAuthenticated: Boolean(input.userId),
    hasAnswered,
  };
}

export type SubmitAnswerResult =
  | { ok: true; corpusCount: number }
  | { ok: false; reason: 'inactive' | 'already_answered' | 'invalid' | 'error' };

export async function submitQuestionAnswer(input: {
  questionId: string;
  userId: string;
  content: string;
  wordCount: number;
}): Promise<SubmitAnswerResult> {
  const supabase = getQuestionServiceClient();
  const { data, error } = await supabase.rpc('question_submit_answer', {
    p_question_id: input.questionId,
    p_user_id: input.userId,
    p_content: input.content,
    p_word_count: input.wordCount,
  });

  if (error) {
    console.error('[Question] Answer insert failed:', error.code || 'unknown');
    return { ok: false, reason: 'error' };
  }

  const row = firstRow<{
    submitted?: unknown;
    reason?: unknown;
    corpus_count?: unknown;
  }>(data);

  if (!row || row.submitted !== true) {
    const reason =
      row?.reason === 'already_answered' || row?.reason === 'inactive' || row?.reason === 'invalid'
        ? row.reason
        : 'error';

    return { ok: false, reason };
  }

  const corpusCount =
    typeof row.corpus_count === 'number' && Number.isFinite(row.corpus_count)
      ? Math.max(0, Math.trunc(row.corpus_count))
      : 1;

  // Queueing the synthesis is deliberately a separate transaction. A failure
  // here must never roll back the human answer that was just saved.
  const { error: queueError } = await supabase.rpc('question_record_answer', {
    p_question_id: input.questionId,
  });

  if (queueError) {
    console.error('[Question] Synthesis queue update failed:', queueError.code || 'unknown');
  }

  return { ok: true, corpusCount };
}

export async function loadSynthesisCorpus(questionId: string): Promise<{
  question: PublicQuestion;
  answers: string[];
  totalAnswerCount: number;
} | null> {
  if (!isQuestionId(questionId)) return null;

  const supabase = getQuestionServiceClient();

  const { data: questionRow, error: questionError } = await supabase
    .from('questions')
    .select('id,question')
    .eq('id', questionId)
    .eq('status', 'active')
    .maybeSingle();

  if (questionError || !questionRow || typeof questionRow.question !== 'string') {
    return null;
  }

  const { data: answerRows, error: answersError, count } = await supabase
    .from('question_answers')
    .select('content', { count: 'exact' })
    .eq('question_id', questionId)
    .order('created_at', { ascending: true })
    .limit(300);

  if (answersError) {
    throw new Error('question_corpus_unavailable');
  }

  const answers = (answerRows || [])
    .map((row) => (typeof row.content === 'string' ? row.content : ''))
    .filter((content) => content.trim().length > 0);

  return {
    question: {
      id: String(questionRow.id),
      text: questionRow.question,
    },
    answers,
    totalAnswerCount:
      typeof count === 'number' && Number.isFinite(count) ? count : answers.length,
  };
}
