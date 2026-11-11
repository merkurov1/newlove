import type { SupabaseClient } from '@supabase/supabase-js';

import type { FeedbackErrorCategory } from '@/lib/pierrot/feedback/classify';

/**
 * Owner-only quality summary. It reads recent events and message metadata; it
 * never reads visitor text into the response. The goal is task correctness,
 * not a positive-rating percentage.
 */
export type PierrotQualitySummary = {
  windowDays: number;
  assistantReplies: number;
  structuredResponses: number;
  structuredShare: number | null;
  negativeFeedback: number;
  feedbackByCategory: Partial<Record<FeedbackErrorCategory, number>>;
  failedGenerations: number;
  unavailable: string[];
};

function sinceIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

export async function loadPierrotQualitySummary(
  store: SupabaseClient,
  windowDays = 30
): Promise<PierrotQualitySummary> {
  const since = sinceIso(windowDays);
  const unavailable: string[] = [];

  let assistantRows: Array<{ metadata?: unknown }> = [];
  let feedbackRows: Array<{ payload?: unknown }> = [];
  let failureRows: Array<{ id?: string }> = [];

  const [messagesResult, feedbackResult, failuresResult] = await Promise.all([
    store
      .from('pierrot_messages')
      .select('metadata')
      .eq('role', 'assistant')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2_000),
    store
      .from('pierrot_events')
      .select('payload')
      .eq('event_name', 'answer_feedback')
      .gte('created_at', since)
      .limit(2_000),
    store
      .from('pierrot_events')
      .select('id')
      .in('event_name', ['assistant_failed', 'assistant_failure'])
      .gte('created_at', since)
      .limit(2_000),
  ]);

  if (messagesResult.error) {
    // Older deployments without the metadata column: count replies only.
    unavailable.push('structured_responses');
    const fallback = await store
      .from('pierrot_messages')
      .select('id')
      .eq('role', 'assistant')
      .gte('created_at', since)
      .limit(2_000);
    assistantRows = Array.isArray(fallback.data)
      ? fallback.data.map(() => ({}))
      : [];
  } else {
    assistantRows = Array.isArray(messagesResult.data) ? messagesResult.data : [];
  }

  if (feedbackResult.error) unavailable.push('feedback');
  else feedbackRows = Array.isArray(feedbackResult.data) ? feedbackResult.data : [];

  if (failuresResult.error) unavailable.push('failures');
  else failureRows = Array.isArray(failuresResult.data) ? failuresResult.data : [];

  let structuredResponses = 0;
  for (const row of assistantRows) {
    const metadata =
      row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : null;
    if (metadata && metadata.response && typeof metadata.response === 'object') {
      structuredResponses += 1;
    }
  }

  let negativeFeedback = 0;
  const feedbackByCategory: Partial<Record<FeedbackErrorCategory, number>> = {};

  for (const row of feedbackRows) {
    const payload =
      row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
        ? (row.payload as Record<string, unknown>)
        : null;
    if (!payload || payload.rating !== 'down') continue;

    negativeFeedback += 1;
    const category =
      typeof payload.feedback_category === 'string' ? payload.feedback_category : 'OTHER';
    feedbackByCategory[category as FeedbackErrorCategory] =
      (feedbackByCategory[category as FeedbackErrorCategory] || 0) + 1;
  }

  return {
    windowDays,
    assistantReplies: assistantRows.length,
    structuredResponses,
    structuredShare:
      assistantRows.length > 0 ? structuredResponses / assistantRows.length : null,
    negativeFeedback,
    feedbackByCategory,
    failedGenerations: failureRows.length,
    unavailable,
  };
}
