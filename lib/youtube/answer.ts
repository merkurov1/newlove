import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';

import { detectYouTubeQuestion, resolveYouTubePeriod, type YouTubeQuestion } from './question';
import { formatYouTubeReport } from './report';
import { runYouTubeAnalyticsTool, youtubeToolForScope } from './tools';
import type { YouTubeLanguage, YouTubeReport } from './types';

assertServerOnly('lib/youtube/answer');

export type YouTubeAnswer = {
  question: YouTubeQuestion | null;
  report: YouTubeReport | null;
  markdown: string;
};

export async function answerYouTubeAnalyticsQuestion(input: {
  message: string;
  language: YouTubeLanguage;
  store: SupabaseClient;
  now?: Date;
  fresh?: boolean;
}): Promise<YouTubeAnswer> {
  const question = detectYouTubeQuestion(input.message, {
    now: input.now,
  });

  if (!question) {
    return { question: null, report: null, markdown: '' };
  }

  const period = resolveYouTubePeriod(question, {
    now: input.now,
    language: input.language,
  });

  // An explicit "refresh/fresh" request bypasses the in-process cache; every
  // other report remains on-demand but may reuse a short-lived cached result.
  const fresh =
    input.fresh ??
    /(обнови|обновить|свеж[а-яё]*|актуал[а-яё]*|fresh|refresh|bypass\s+cache)/i.test(input.message);

  const report = await runYouTubeAnalyticsTool(youtubeToolForScope(question.scope), {
    store: input.store,
    period,
    language: input.language,
    videoIds: question.videoIds,
    fresh,
    now: input.now,
  });

  return {
    question,
    report,
    markdown: formatYouTubeReport(report),
  };
}
