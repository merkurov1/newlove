import { assertServerOnly } from '@/lib/serverOnly';
import { deltaPercent } from './dataset';
import type {
  AnalyticsDataset,
  AnalyticsReport,
  EvidenceSection,
  FunnelStage,
  MetricComparison,
} from './types';

assertServerOnly('lib/analytics/website/insights');

export type Finding = {
  key: string;
  title: string;
  severity: 'info' | 'opportunity' | 'problem';
  facts: string[];
  interpretation: string[];
  hypothesis: string[];
  recommendation: string[];
};

export function formatMetricValue(metric: MetricComparison, language: 'ru' | 'en'): string {
  if (!metric.available || metric.value === null) return '—';

  const locale = language === 'ru' ? 'ru-RU' : 'en-GB';

  if (metric.unit === 'percent') {
    return `${metric.value.toLocaleString(locale, { maximumFractionDigits: 1 })}%`;
  }

  if (metric.unit === 'position') {
    return metric.value.toLocaleString(locale, { maximumFractionDigits: 1 });
  }

  if (metric.unit === 'seconds') {
    const seconds = Math.round(metric.value);
    if (seconds < 60) return `${seconds} ${language === 'ru' ? 'сек' : 's'}`;
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    return `${minutes} ${language === 'ru' ? 'мин' : 'm'} ${rest} ${language === 'ru' ? 'сек' : 's'}`;
  }

  return metric.value.toLocaleString(locale, { maximumFractionDigits: 0 });
}

export function formatDelta(metric: MetricComparison, language: 'ru' | 'en'): string {
  if (metric.deltaPercent === null || !Number.isFinite(metric.deltaPercent)) return '—';
  const sign = metric.deltaPercent > 0 ? '+' : '';
  const arrow = metric.deltaPercent > 0 ? '▲' : metric.deltaPercent < 0 ? '▼' : '·';

  return `${arrow} ${sign}${metric.deltaPercent.toLocaleString(
    language === 'ru' ? 'ru-RU' : 'en-GB',
    { maximumFractionDigits: 1 }
  )}%`;
}

export function formatNumber(value: number | null | undefined, language: 'ru' | 'en'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return value.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-GB', {
    maximumFractionDigits: 0,
  });
}

export function formatPercent(value: number | null | undefined, language: 'ru' | 'en'): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  return `${value.toLocaleString(language === 'ru' ? 'ru-RU' : 'en-GB', {
    maximumFractionDigits: 1,
  })}%`;
}

export function formatMoney(
  amountMinor: number | null,
  currency: string | null,
  language: 'ru' | 'en'
): string {
  if (amountMinor === null || !Number.isFinite(amountMinor)) return '—';

  try {
    return new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
      style: 'currency',
      currency: currency || 'GBP',
      maximumFractionDigits: 2,
    }).format(amountMinor / 100);
  } catch {
    return `${(amountMinor / 100).toFixed(2)} ${currency || ''}`.trim();
  }
}

export function buildFunnel(dataset: AnalyticsDataset, language: 'ru' | 'en'): FunnelStage[] {
  const { ga4, gsc, internal } = dataset;
  const engaged = ga4.totals.engagementRate;
  const sessions = ga4.totals.sessions;

  const submitted =
    internal.subscriptionEvents.find((row) => row.key === 'subscription_submitted')?.value ?? null;
  const confirmed =
    internal.subscriptionEvents.find((row) => row.key === 'subscription_confirmed')?.value ?? null;
  const failed =
    internal.subscriptionEvents.find((row) => row.key === 'subscription_failed')?.value ?? null;

  return [
    {
      key: 'search_impressions',
      label: language === 'ru' ? 'Показы в Google' : 'Google impressions',
      value: gsc.totals.impressions.available ? gsc.totals.impressions.value : null,
      unit: 'count',
      source: 'search_console',
      definition: 'Сколько раз ссылка сайта была показана в результатах поиска.',
      note: 'Показ — не посещение и не пользователь.',
    },
    {
      key: 'search_clicks',
      label: language === 'ru' ? 'Клики из Google' : 'Google clicks',
      value: gsc.totals.clicks.available ? gsc.totals.clicks.value : null,
      unit: 'count',
      source: 'search_console',
      definition: 'Клики по результатам поиска.',
      note: 'Клик не равен сессии GA4 и не гарантирует действие.',
    },
    {
      key: 'sessions',
      label: language === 'ru' ? 'Сессии GA4' : 'GA4 sessions',
      value: sessions.available ? sessions.value : null,
      unit: 'count',
      source: 'google_analytics',
      definition: 'Сессии GA4.',
      note: 'Другое определение, чем клики, визиты Umami и диалоги Pierrot.',
    },
    {
      key: 'engaged_sessions',
      label: language === 'ru' ? 'Вовлечённые сессии' : 'Engaged sessions',
      value:
        engaged.available && sessions.value !== null
          ? Math.round((sessions.value * (engaged.value ?? 0)) / 100)
          : null,
      unit: 'count',
      source: 'google_analytics',
      definition: 'Сессии, которые GA4 считает engaged.',
      note: 'Определение задаётся GA4 (>10 сек, конверсия или 2+ просмотра).',
    },
    {
      key: 'ga4_conversions',
      label: language === 'ru' ? 'Конверсии GA4' : 'GA4 conversions',
      value: ga4.totals.conversions.available ? ga4.totals.conversions.value : null,
      unit: 'count',
      source: 'google_analytics',
      definition: 'События, помеченные как конверсии в GA4.',
      note: 'Набор конверсионных событий задаётся в настройках GA4.',
    },
    {
      key: 'subscription_submitted',
      label: language === 'ru' ? 'Подписка начата' : 'Subscription submitted',
      value: submitted,
      unit: 'count',
      source: 'internal',
      definition: 'Событие subscription_submitted во внутренней базе.',
      note: 'Начатая подписка не равна подтверждённой.',
    },
    {
      key: 'subscription_confirmed',
      label: language === 'ru' ? 'Подписка подтверждена' : 'Subscription confirmed',
      value: confirmed,
      unit: 'count',
      source: 'internal',
      definition: 'Событие subscription_confirmed во внутренней базе.',
      note: 'Подтверждение — реальное действие; источник перехода неизвестен.',
    },
    {
      key: 'confirmed_donations',
      label: language === 'ru' ? 'Подтверждённые пожертвования' : 'Confirmed donations',
      value: internal.donations.count,
      unit: 'count',
      source: 'internal',
      definition: 'Строки в pierrot_v_donations за период.',
      note: 'Сумма и количество подтверждены платёжным провайдером; атрибуция источнику неизвестна.',
    },
  ];
}

export function detectAnomalies(dataset: AnalyticsDataset, language: 'ru' | 'en'): Finding[] {
  const findings: Finding[] = [];
  const { ga4, gsc, internal } = dataset;

  const split = <T>(rows: T[]): { recent: T[]; baseline: T[] } => {
    const half = Math.max(1, Math.floor(rows.length / 2));
    return { baseline: rows.slice(0, half), recent: rows.slice(half) };
  };

  if (ga4.available && ga4.series.length >= 4) {
    const { baseline, recent } = split(ga4.series);
    const baselineSessions = baseline.reduce((sum, row) => sum + row.sessions, 0);
    const recentSessions = recent.reduce((sum, row) => sum + row.sessions, 0);
    const delta =
      baselineSessions > 0
        ? ((recentSessions - baselineSessions) / baselineSessions) * 100
        : null;

    if (delta !== null && Math.abs(delta) >= 40 && baselineSessions >= 10) {
      findings.push({
        key: 'ga4_sessions_shift',
        title:
          language === 'ru'
            ? 'Сессии GA4 заметно изменились внутри периода'
            : 'GA4 sessions shifted inside the period',
        severity: 'problem',
        facts: [
          language === 'ru'
            ? `Вторая половина периода: ${formatNumber(recentSessions, language)} сессий против ${formatNumber(
                baselineSessions,
                language
              )} в первой половине (${delta > 0 ? '+' : ''}${delta.toFixed(1)}%).`
            : `Second half: ${formatNumber(recentSessions, language)} sessions vs ${formatNumber(
                baselineSessions,
                language
              )} in the first half (${delta > 0 ? '+' : ''}${delta.toFixed(1)}%).`,
        ],
        interpretation: [
          language === 'ru'
            ? 'Это изменение внутри периода, а не сравнение с предыдущим периодом.'
            : 'This is a within-period shift, not a period-over-period comparison.',
        ],
        hypothesis: [
          language === 'ru'
            ? 'Возможная причина — публикация, внешняя ссылка, кампания или изменение отслеживания. Данные не подтверждают конкретную причину.'
            : 'A publication, external link, campaign or tracking change is possible. The data does not confirm a cause.',
        ],
        recommendation: [
          language === 'ru'
            ? 'Проверьте дату перелома и сопоставьте её с публикациями и внешними упоминаниями.'
            : 'Check the break date against publications and external mentions.',
        ],
      });
    }
  }

  if (gsc.available && gsc.series.length >= 4) {
    const { baseline, recent } = split(gsc.series);
    const baselineClicks = baseline.reduce((sum, row) => sum + row.clicks, 0);
    const recentClicks = recent.reduce((sum, row) => sum + row.clicks, 0);
    const delta =
      baselineClicks > 0 ? ((recentClicks - baselineClicks) / baselineClicks) * 100 : null;

    if (delta !== null && Math.abs(delta) >= 40 && baselineClicks >= 5) {
      findings.push({
        key: 'gsc_clicks_shift',
        title:
          language === 'ru'
            ? 'Поисковые клики заметно изменились внутри периода'
            : 'Search clicks shifted inside the period',
        severity: 'problem',
        facts: [
          language === 'ru'
            ? `Вторая половина: ${formatNumber(recentClicks, language)} кликов против ${formatNumber(
                baselineClicks,
                language
              )} в первой (${delta > 0 ? '+' : ''}${delta.toFixed(1)}%).`
            : `Second half: ${formatNumber(recentClicks, language)} clicks vs ${formatNumber(
                baselineClicks,
                language
              )} in the first (${delta > 0 ? '+' : ''}${delta.toFixed(1)}%).`,
        ],
        interpretation: [
          language === 'ru'
            ? 'Search Console может отставать на 2–3 дня, поэтому последние дни неполные.'
            : 'Search Console lags by 2–3 days, so recent days may be incomplete.',
        ],
        hypothesis: [
          language === 'ru'
            ? 'Возможны изменения позиций, сезонность или публикация. Причина не подтверждена.'
            : 'Ranking changes, seasonality or a publication are possible. The cause is not confirmed.',
        ],
        recommendation: [
          language === 'ru'
            ? 'Сверьте запросы и страницы с крупнейшим падением, затем проверьте позиции вручную.'
            : 'Review the queries and pages with the largest drop, then verify positions.',
        ],
      });
    }
  }

  const staleSources = dataset.sources.filter(
    (source) =>
      source.connected &&
      source.lastSuccessAt &&
      Date.now() - new Date(source.lastSuccessAt).getTime() > 7 * 86_400_000
  );

  for (const source of staleSources) {
    findings.push({
      key: `stale_${source.provider}`,
      title:
        language === 'ru'
          ? `${source.label}: данные давно не обновлялись`
          : `${source.label}: data is stale`,
      severity: 'problem',
      facts: [
        language === 'ru'
          ? `Последняя успешная синхронизация: ${source.lastSuccessAt}.`
          : `Last successful sync: ${source.lastSuccessAt}.`,
      ],
      interpretation: [
        language === 'ru'
          ? 'Отсутствие свежих данных не означает отсутствие активности на сайте.'
          : 'Missing fresh data does not mean there was no activity.',
      ],
      hypothesis: [],
      recommendation: [
        language === 'ru'
          ? 'Запустите ручную синхронизацию и проверьте ошибки в разделе Analytics.'
          : 'Run a manual sync and check errors in Analytics.',
      ],
    });
  }

  if (
    internal.conversations.total !== null &&
    internal.conversations.previousTotal !== null &&
    internal.conversations.previousTotal >= 20
  ) {
    const current = internal.conversations.total;
    const previous = internal.conversations.previousTotal;
    const delta = deltaPercent(current, previous);

    if (delta !== null && Math.abs(delta) >= 40) {
      findings.push({
        key: 'internal_conversations_shift',
        title:
          language === 'ru'
            ? 'Число внутренних диалогов Pierrot заметно изменилось'
            : 'Internal Pierrot conversations shifted',
        severity: 'problem',
        facts: [
          language === 'ru'
            ? `Без сессий владельца: ${formatNumber(current, language)} против ${formatNumber(
                previous,
                language
              )} в предыдущем периоде (${delta > 0 ? '+' : ''}${delta.toFixed(1)}%).`
            : `Excluding owner sessions: ${formatNumber(current, language)} vs ${formatNumber(
                previous,
                language
              )} previously (${delta > 0 ? '+' : ''}${delta.toFixed(1)}%).`,
        ],
        interpretation: [
          language === 'ru'
            ? 'Это внутренние диалоги Pierrot, а не посещаемость сайта. Они не равны сессиям GA4 и не являются конверсией.'
            : 'These are internal Pierrot conversations, not website traffic. They are not GA4 sessions and are not conversions.',
        ],
        hypothesis: [
          language === 'ru'
            ? 'Возможны сезонность, изменение видимости Pierrot или миграция историй. Причина не подтверждена.'
            : 'Seasonality, a change in Pierrot visibility or a history migration is possible. The cause is not confirmed.',
        ],
        recommendation: [
          language === 'ru'
            ? 'Сопоставьте дату изменения с запусками и изменениями интерфейса; не считайте это падением сайта.'
            : 'Compare the change date with launches and UI changes; do not treat it as a website decline.',
        ],
      });
    }
  }

  if (internal.subscriptionEvents.length > 0) {
    const submitted = internal.subscriptionEvents.find(
      (row) => row.key === 'subscription_submitted'
    )?.value;
    const confirmed = internal.subscriptionEvents.find(
      (row) => row.key === 'subscription_confirmed'
    )?.value;

    if (typeof submitted === 'number' && typeof confirmed === 'number' && submitted >= 3 && confirmed / submitted < 0.3) {
      findings.push({
        key: 'subscription_confirmation_gap',
        title:
          language === 'ru'
            ? 'Между начатой и подтверждённой подпиской большой разрыв'
            : 'Large gap between submitted and confirmed subscriptions',
        severity: 'problem',
        facts: [
          language === 'ru'
            ? `Начато: ${submitted}. Подтверждено: ${confirmed}.`
            : `Submitted: ${submitted}. Confirmed: ${confirmed}.`,
        ],
        interpretation: [
          language === 'ru'
            ? 'Это внутренние события одного и того же потока, но не все начатые подписки подтверждаются.'
            : 'These are internal events from the same flow; not every started subscription is confirmed.',
        ],
        hypothesis: [
          language === 'ru'
            ? 'Возможные причины: письмо не доходит, ссылка подтверждения не работает, пользователь передумал. Данные не различают эти причины.'
            : 'Possible causes: email delivery, a broken confirmation link, or the user changing their mind. The data does not distinguish them.',
        ],
        recommendation: [
          language === 'ru'
            ? 'Проверьте доставляемость писем и подтверждение подписки; не считайте начатые подписки реальными.'
            : 'Check email deliverability and confirmation; do not count started subscriptions as real.',
        ],
      });
    }
  }

  return findings;
}

export function findContentOpportunities(
  dataset: AnalyticsDataset,
  language: 'ru' | 'en'
): Finding[] {
  const findings: Finding[] = [];
  const { gsc, ga4, contentMatches } = dataset;
  const matchByPath = new Map(contentMatches.map((match) => [match.path, match]));

  if (gsc.available) {
    for (const row of gsc.lowCtrPages.slice(0, 5)) {
      const match = matchByPath.get(row.page);
      findings.push({
        key: `low_ctr_page:${row.page}`,
        title:
          language === 'ru'
            ? `Высокие показы, низкий CTR: ${row.page}`
            : `High impressions, low CTR: ${row.page}`,
        severity: 'opportunity',
        facts: [
          language === 'ru'
            ? `Показы: ${formatNumber(row.impressions, language)} · клики: ${formatNumber(
                row.clicks,
                language
              )} · CTR: ${formatPercent(row.ctr * 100, language)} · позиция: ${row.position.toFixed(1)}.`
            : `Impressions: ${formatNumber(row.impressions, language)} · clicks: ${formatNumber(
                row.clicks,
                language
              )} · CTR: ${formatPercent(row.ctr * 100, language)} · position: ${row.position.toFixed(1)}.`,
        ],
        interpretation: [
          language === 'ru'
            ? match
              ? `Страница сопоставлена с материалом «${match.title || match.slug}».`
              : 'Страница не сопоставлена с материалом Brain автоматически.'
            : match
              ? `Page matched to “${match.title || match.slug}”.`
              : 'Page was not matched to a Brain document automatically.',
        ],
        hypothesis: [
          language === 'ru'
            ? 'Возможная причина — заголовок и описание не отвечают на запрос, либо сниппет проигрывает конкурентам. Это гипотеза, не доказанный факт.'
            : 'The title/snippet may not answer the query, or the snippet may lose to competitors. This is a hypothesis.',
        ],
        recommendation: [
          language === 'ru'
            ? 'Проверьте title/description и соответствие страницы запросу. Не меняйте контент только из-за CTR.'
            : 'Review title/description and query intent. Do not rewrite content solely because of CTR.',
        ],
      });
    }

    for (const row of gsc.risingQueries.slice(0, 5)) {
      const matchedPages = contentMatches.filter(
        (match) => match.title && match.title.toLowerCase().includes(row.key.toLowerCase())
      );
      findings.push({
        key: `rising_query:${row.key}`,
        title:
          language === 'ru'
            ? `Растущий интерес: «${row.key}»`
            : `Rising interest: “${row.key}”`,
        severity: 'opportunity',
        facts: [
          language === 'ru'
            ? `Показы выросли с ${formatNumber(row.previous, language)} до ${formatNumber(
                row.value,
                language
              )} (${formatDelta(
                {
                  deltaPercent: row.deltaPercent,
                } as MetricComparison,
                language
              )}).`
            : `Impressions grew from ${formatNumber(row.previous, language)} to ${formatNumber(
                row.value,
                language
              )}.`,
        ],
        interpretation: [
          language === 'ru'
            ? matchedPages.length > 0
              ? 'В контенте есть материалы, связанные с этим запросом.'
              : 'Прямого совпадения с материалом Brain не найдено.'
            : matchedPages.length > 0
              ? 'There are content items related to this query.'
              : 'No direct Brain content match was found.',
        ],
        hypothesis: [
          language === 'ru'
            ? 'Спрос растёт, но это может быть сезонным или краткосрочным. Причина не подтверждена.'
            : 'Demand is rising, but it may be seasonal or short-lived. The cause is not confirmed.',
        ],
        recommendation: [
          language === 'ru'
            ? 'Проверьте, есть ли на сайте материал, точно отвечающий запросу, и виден ли он в выдаче.'
            : 'Check whether the site has content that precisely answers the query and whether it ranks.',
        ],
      });
    }
  }

  if (ga4.available) {
    const unknownPages = ga4.pages
      .filter((row) => row.value >= 20)
      .filter((row) => {
        const match = matchByPath.get(row.key);
        return !match || match.type === 'unknown';
      })
      .slice(0, 5);

    for (const row of unknownPages) {
      findings.push({
        key: `unmatched_page:${row.key}`,
        title:
          language === 'ru'
            ? `Страница с трафиком не сопоставлена с материалом: ${row.key}`
            : `Traffic page not matched to content: ${row.key}`,
        severity: 'info',
        facts: [
          language === 'ru'
            ? `Просмотры страницы: ${formatNumber(row.value, language)}.`
            : `Page views: ${formatNumber(row.value, language)}.`,
        ],
        interpretation: [
          language === 'ru'
            ? 'Это может быть служебная, проектная или новая страница, которой ещё нет в Brain.'
            : 'It may be a system, project or new page that is not yet in Brain.',
        ],
        hypothesis: [
          language === 'ru'
            ? 'Если страница содержательная, её отсутствие в Brain мешает связать трафик с контекстом.'
            : 'If the page is editorial, missing Brain context prevents linking traffic to content context.',
        ],
        recommendation: [
          language === 'ru'
            ? 'Проверьте страницу и при необходимости добавьте её в Brain.'
            : 'Review the page and add it to Brain if appropriate.',
        ],
      });
    }
  }

  return findings;
}

export function buildEvidence(dataset: AnalyticsDataset, language: 'ru' | 'en'): EvidenceSection {
  const facts: string[] = [];
  const interpretation: string[] = [];
  const hypotheses: string[] = [];
  const recommendations: string[] = [];
  const limitations: string[] = [];

  const pushMetric = (metric: MetricComparison) => {
    if (!metric.available || metric.value === null) return;
    facts.push(
      language === 'ru'
        ? `${metric.label}: ${formatMetricValue(metric, language)} (${metric.source}).`
        : `${metric.label}: ${formatMetricValue(metric, language)} (${metric.source}).`
    );
  };

  pushMetric(dataset.ga4.totals.sessions);
  pushMetric(dataset.ga4.totals.activeUsers);
  pushMetric(dataset.gsc.totals.clicks);
  pushMetric(dataset.gsc.totals.impressions);
  pushMetric(dataset.gsc.totals.ctr);
  pushMetric(dataset.umami.totals.pageviews);

  if (dataset.internal.confirmedSubscriptions !== null) {
    facts.push(
      language === 'ru'
        ? `Подтверждённые подписки во внутренней базе: ${dataset.internal.confirmedSubscriptions}.`
        : `Confirmed subscriptions in the internal database: ${dataset.internal.confirmedSubscriptions}.`
    );
  }

  if (dataset.internal.donations.available) {
    facts.push(
      language === 'ru'
        ? `Подтверждённые пожертвования: ${dataset.internal.donations.count ?? 0}${
            dataset.internal.donations.amountMinor !== null
              ? ` на сумму ${formatMoney(
                  dataset.internal.donations.amountMinor,
                  dataset.internal.donations.currency,
                  language
                )}`
              : ''
          }.`
        : `Confirmed donations: ${dataset.internal.donations.count ?? 0}.`
    );
  }

  const unavailable = dataset.sources.filter((source) => !source.connected);
  if (unavailable.length > 0) {
    interpretation.push(
      language === 'ru'
        ? `Не подключены: ${unavailable.map((source) => source.label).join(', ')}. Отсутствие данных не означает ноль.`
        : `Not connected: ${unavailable.map((source) => source.label).join(', ')}. Missing data is not zero.`
    );
  }

  if (dataset.ga4.available && dataset.umami.available) {
    const gaSessions = dataset.ga4.totals.sessions.value;
    const umamiVisits = dataset.umami.totals.visits.value;
    if (gaSessions !== null && umamiVisits !== null) {
      interpretation.push(
        language === 'ru'
          ? `GA4: ${formatNumber(gaSessions, language)} сессий; Umami: ${formatNumber(
              umamiVisits,
              language
            )} визитов. Это разные определения; расхождение ожидаемо и не является ошибкой само по себе.`
          : `GA4: ${formatNumber(gaSessions, language)} sessions; Umami: ${formatNumber(
              umamiVisits,
              language
            )} visits. These are different definitions; the difference is expected.`
      );
    }
  }

  if (dataset.internal.confirmedSubscriptions !== null || dataset.internal.donations.available) {
    interpretation.push(
      language === 'ru'
        ? 'Подтверждённые подписки и пожертвования не приписаны к поисковому запросу или каналу: подтверждённой сквозной атрибуции нет.'
        : 'Confirmed subscriptions and donations are not attributed to a search query or channel: no confirmed end-to-end attribution exists.'
    );
  }

  if (dataset.gsc.lowCtrPages.length > 0) {
    hypotheses.push(
      language === 'ru'
        ? 'Низкий CTR при высоких показах может указывать на несоответствие заголовка запросу. Это гипотеза, требующая проверки.'
        : 'Low CTR at high impressions may indicate a title/query mismatch. This requires verification.'
    );
    recommendations.push(
      language === 'ru'
        ? 'Проверить 3–5 страниц с наибольшими показами и низким CTR, не меняя контент вслепую.'
        : 'Review 3–5 pages with the highest impressions and low CTR without rewriting blindly.'
    );
  }

  if (dataset.gsc.risingQueries.length > 0) {
    recommendations.push(
      language === 'ru'
        ? 'Сопоставить растущие запросы с существующими материалами и проверить, отвечает ли страница на запрос.'
        : 'Match rising queries with existing content and check whether the page answers the query.'
    );
  }

  if (!dataset.ga4.available || !dataset.gsc.available) {
    recommendations.push(
      language === 'ru'
        ? 'Подключить отсутствующие источники в Pierrot → Analytics; без них выводы о внешнем трафике неполные.'
        : 'Connect the missing sources in Pierrot → Analytics; conclusions about external traffic remain incomplete.'
    );
  }

  limitations.push(...dataset.ga4.limitations, ...dataset.gsc.limitations, ...dataset.umami.limitations);
  limitations.push(...dataset.internal.limitations);

  if (dataset.period.timezone) {
    limitations.push(
      language === 'ru'
        ? `Границы периода считаются в часовом поясе ${dataset.period.timezone}.`
        : `Period boundaries use the ${dataset.period.timezone} timezone.`
    );
  }

  return {
    verifiedFacts: Array.from(new Set(facts)),
    interpretation: Array.from(new Set(interpretation)),
    hypotheses: Array.from(new Set(hypotheses)),
    recommendations: Array.from(new Set(recommendations)),
    limitations: Array.from(new Set(limitations)),
  };
}

export function reportHeadline(dataset: AnalyticsDataset, language: 'ru' | 'en'): string {
  const sessions = dataset.ga4.totals.sessions;
  const clicks = dataset.gsc.totals.clicks;

  if (sessions.available && sessions.value !== null) {
    const delta = sessions.deltaPercent;
    const trend =
      delta === null
        ? ''
        : delta > 5
          ? language === 'ru'
            ? ' Сессии растут.'
            : ' Sessions are growing.'
          : delta < -5
            ? language === 'ru'
              ? ' Сессии снижаются.'
              : ' Sessions are declining.'
            : language === 'ru'
              ? ' Сессии стабильны.'
              : ' Sessions are stable.';

    return language === 'ru'
      ? `За ${dataset.period.label}: ${formatNumber(sessions.value, language)} сессий GA4.${trend}`
      : `For ${dataset.period.label}: ${formatNumber(sessions.value, language)} GA4 sessions.${trend}`;
  }

  if (clicks.available && clicks.value !== null) {
    return language === 'ru'
      ? `Google Search: ${formatNumber(clicks.value, language)} кликов за ${dataset.period.label}.`
      : `Google Search: ${formatNumber(clicks.value, language)} clicks for ${dataset.period.label}.`;
  }

  const failing = dataset.sources.filter(
    (source) => source.connected && source.status !== 'connected'
  );

  if (failing.length > 0) {
    return language === 'ru'
      ? `Источники подключены, но данные за период недоступны: ${failing
          .map((source) => source.label)
          .join(', ')}. Это ошибка или отсутствие синхронизации, а не отсутствие активности.`
      : `Sources are connected, but data is unavailable for the period: ${failing
          .map((source) => source.label)
          .join(', ')}. This is an error or missing sync, not absence of activity.`;
  }

  const connected = dataset.sources.filter((source) => source.connected);

  if (connected.length > 0) {
    return language === 'ru'
      ? `Источники подключены (${connected
          .map((source) => source.label)
          .join(', ')}), но за выбранный период нет сохранённых данных. Это не ноль.`
      : `Sources are connected (${connected
          .map((source) => source.label)
          .join(', ')}), but there is no stored data for the period. This is not zero.`;
  }

  return language === 'ru'
    ? 'Внешние источники ещё не подключены. Ниже — только подтверждённые внутренние данные Pierrot; отсутствие данных не заменяется нулём.'
    : 'External sources are not connected yet. Below are only confirmed internal Pierrot facts; missing data is not replaced with zero.';
}
