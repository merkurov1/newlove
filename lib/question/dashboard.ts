import { assertServerOnly } from '@/lib/serverOnly';
import { getQuestionServiceClient } from './store';

assertServerOnly('lib/question/dashboard');

export type QuestionDashboardRow = {
  id: string;
  text: string;
  status: 'active' | 'archived';
  answerCount: number;
  firstAnswerAt: string | null;
  lastAnswerAt: string | null;
  synthesis: {
    status: 'idle' | 'queued' | 'running' | 'error' | 'missing';
    version: number;
    answerCount: number;
    updatedAt: string | null;
    lastError: string | null;
  };
};

function numberValue(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : 0;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

/**
 * Aggregate-only dashboard read. The database function does not select content
 * or user identifiers from question_answers.
 */
export async function getQuestionDashboardRows(): Promise<QuestionDashboardRow[]> {
  const supabase = getQuestionServiceClient();
  const { data, error } = await supabase.rpc('question_dashboard_stats');

  if (error) {
    console.error('[Question dashboard] Stats lookup failed:', error.code || 'unknown');
    return [];
  }

  if (!Array.isArray(data)) return [];

  return data.flatMap((raw) => {
    if (!raw || typeof raw !== 'object') return [];

    const row = raw as Record<string, unknown>;
    if (typeof row.question_id !== 'string' || typeof row.question !== 'string') return [];

    const status = row.status === 'archived' ? 'archived' : 'active';
    const synthesisStatus =
      row.synthesis_status === 'idle' ||
      row.synthesis_status === 'queued' ||
      row.synthesis_status === 'running' ||
      row.synthesis_status === 'error'
        ? row.synthesis_status
        : 'missing';

    return [
      {
        id: row.question_id,
        text: row.question,
        status,
        answerCount: numberValue(row.answer_count),
        firstAnswerAt: stringValue(row.first_answer_at),
        lastAnswerAt: stringValue(row.last_answer_at),
        synthesis: {
          status: synthesisStatus,
          version: numberValue(row.synthesis_version),
          answerCount: numberValue(row.synthesis_answer_count),
          updatedAt: stringValue(row.synthesis_updated_at),
          lastError: stringValue(row.synthesis_last_error),
        },
      },
    ];
  });
}
