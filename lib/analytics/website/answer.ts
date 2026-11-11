import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';

import { detectWebsiteQuestion } from './question';
import { runWebsiteAnalyticsTool, websiteToolForScope } from './tools';
import type { AnalyticsLanguage, AnalyticsReport } from './types';

assertServerOnly('lib/analytics/website/answer');

export type WebsiteAnswer = {
  answered: boolean;
  markdown: string;
  scope: string | null;
  /** Full structured report for the optional rich response renderer. */
  report?: AnalyticsReport | null;
};

export async function answerWebsiteAnalyticsQuestion(input: {
  message: string;
  language: AnalyticsLanguage;
  store?: SupabaseClient;
  now?: Date;
}): Promise<WebsiteAnswer> {
  const question = detectWebsiteQuestion(input.message, { now: input.now });

  if (!question) {
    return { answered: false, markdown: '', scope: null };
  }

  try {
    const report = await runWebsiteAnalyticsTool(websiteToolForScope(question.scope), {
      language: input.language,
      store: input.store,
      now: input.now,
      periodKey: question.periodKey,
      customPeriod: question.customPeriod,
      project: question.project,
      pagePath: question.pagePath ?? null,
    });

    return {
      answered: true,
      markdown: report.markdown,
      scope: report.scope,
      report,
    };
  } catch (error) {
    const code = error instanceof Error ? error.message.slice(0, 120) : 'analytics_failed';

    console.error('[website analytics] report failed', { code });

    return {
      answered: true,
      scope: question.scope,
      markdown:
        input.language === 'ru'
          ? [
              '## Состояние сайта',
              'Не удалось собрать аналитический отчёт. Это ошибка получения данных, а не отсутствие активности на сайте.',
              '',
              'Проверьте в Pierrot → Analytics:',
              '- статус подключения источников;',
              '- последнюю синхронизацию и её ошибку;',
              '- доступность Supabase.',
              '',
              `Технический код: \`${code}\`.`,
            ].join('\n')
          : [
              '## Website state',
              'The analytical report could not be built. This is a data retrieval error, not evidence that the site had no activity.',
              '',
              'Check Pierrot → Analytics:',
              '- source connection status;',
              '- the last sync and its error;',
              '- Supabase availability.',
              '',
              `Technical code: \`${code}\`.`,
            ].join('\n'),
    };
  }
}
