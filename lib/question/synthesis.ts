import { assertServerOnly } from '@/lib/serverOnly';
import { callPierrotModel } from '@/lib/pierrot/model';
import { buildQuestionSynthesisPrompt } from './prompt';
import { sanitizeQuestionSynthesis } from './sanitize';
import { getQuestionServiceClient, loadSynthesisCorpus } from './store';
import { isQuestionId } from './validation';

assertServerOnly('lib/question/synthesis');

export type SynthesisRunResult = {
  status: 'ready' | 'pending' | 'failed' | 'busy';
  content?: string;
};

type ClaimRow = {
  generation_token?: unknown;
  corpus_count?: unknown;
  attempts?: unknown;
};

type CompleteRow = {
  completed?: unknown;
  dirty?: unknown;
};

function firstRow<T>(value: unknown): T | null {
  if (Array.isArray(value)) return (value[0] as T) || null;
  if (value && typeof value === 'object') return value as T;
  return null;
}

function newGenerationToken(): string {
  return globalThis.crypto.randomUUID();
}

function safeErrorCode(error: unknown): string {
  if (error instanceof Error && error.name && error.name !== 'Error') {
    return error.name.replace(/[^A-Za-z0-9_:-]/g, '').slice(0, 80) || 'generation_failed';
  }

  return 'generation_failed';
}

/**
 * Runs at most two back-to-back synthesis passes.
 *
 * The second pass exists for answers that arrived while the first pass was
 * generating. The database lease and token guarantee that only one process can
 * write a synthesis for a question at a time.
 */
export async function requestQuestionSynthesis(
  questionId: string
): Promise<SynthesisRunResult> {
  if (!isQuestionId(questionId)) return { status: 'failed' };

  const supabase = getQuestionServiceClient();

  for (let pass = 0; pass < 2; pass += 1) {
    const token = newGenerationToken();
    const { data: claimData, error: claimError } = await supabase.rpc(
      'question_claim_synthesis',
      {
        p_question_id: questionId,
        p_generation_token: token,
      }
    );

    if (claimError) {
      console.error('[Question] Synthesis claim failed:', claimError.code || 'unknown');
      return { status: 'busy' };
    }

    const claim = firstRow<ClaimRow>(claimData);

    // Another request owns the job, or the backoff window has not elapsed.
    if (!claim) return { status: 'pending' };

    try {
      const corpus = await loadSynthesisCorpus(questionId);

      if (!corpus || corpus.answers.length === 0) {
        throw new Error('empty_corpus');
      }

      const prompt = buildQuestionSynthesisPrompt({
        question: corpus.question,
        answers: corpus.answers,
        totalAnswerCount: corpus.totalAnswerCount,
      });

      const model = await callPierrotModel(
        prompt.system,
        [{ role: 'user', content: prompt.user }],
        false,
        { maxOutputTokens: 1100, timeoutMs: 45_000 }
      );

      const content = sanitizeQuestionSynthesis(model.reply);

      if (!content) {
        throw new Error('empty_synthesis');
      }

      const { data: completeData, error: completeError } = await supabase.rpc(
        'question_complete_synthesis',
        {
          p_question_id: questionId,
          p_generation_token: token,
          p_content: content,
          p_answer_count: corpus.totalAnswerCount,
        }
      );

      if (completeError) {
        throw new Error('synthesis_write_failed');
      }

      const complete = firstRow<CompleteRow>(completeData);

      if (complete?.completed !== true) {
        // The lease expired and another worker owns the job now.
        return { status: 'pending' };
      }

      if (complete.dirty === true) {
        continue;
      }

      return { status: 'ready', content };
    } catch (error) {
      const code = safeErrorCode(error);

      await supabase.rpc('question_fail_synthesis', {
        p_question_id: questionId,
        p_generation_token: token,
        p_error_code: code,
      });

      console.error('[Question] Synthesis generation failed:', code);
      return { status: 'failed' };
    }
  }

  // A second pass completed, but more answers arrived during it. The synthesis
  // is saved and the question is queued for the next controlled update.
  return { status: 'pending' };
}
