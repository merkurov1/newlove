import type {
  AnalyticsDataset,
  AnalyticsLanguage,
  AnalyticsReport,
  BreakdownRow,
  MetricComparison,
} from '@/lib/analytics/website/types';
import type { BrainGraphPayload } from '@/lib/knowledge/graph/types';
import type { JournalFlowEvidence } from '@/lib/knowledge/rag/journalFlowRetrieval';

import {
  PIERROT_RESPONSE_VERSION,
  type PierrotChartBlock,
  type PierrotContentBlock,
  type PierrotMetricItem,
  type PierrotResponse,
  type PierrotTableBlock,
  type PierrotTimelineEvent,
} from './types';

const SERIES_COLORS = ['#2F2B26', '#A5764F', '#7C8A73', '#8A1235', '#B08A5A'] as const;

function number(value: number, language: AnalyticsLanguage): string {
  return new Intl.NumberFormat(language === 'ru' ? 'ru-RU' : 'en-GB', {
    maximumFractionDigits: 1,
  }).format(value);
}

function metricItem(
  metric: MetricComparison | undefined,
  language: AnalyticsLanguage,
  extra: Partial<PierrotMetricItem> = {}
): PierrotMetricItem | null {
  if (!metric) return null;

  const calculated = /расч[её]т|calculated|derived/i.test(
    `${metric.label} ${metric.definition} ${metric.precision}`
  );

  return {
    label: metric.label,
    value: metric.available ? metric.value : null,
    unit:
      metric.unit === 'position'
        ? 'position'
        : metric.unit === 'percent'
          ? 'percent'
          : metric.unit === 'seconds'
            ? 'seconds'
            : metric.unit === 'ratio'
              ? 'ratio'
              : 'count',
    previous: metric.previous,
    changePercent: metric.deltaPercent,
    period: null,
    interpretation: metric.definition,
    source: metric.source.replace(/_/g, ' ').toUpperCase(),
    confidence: calculated ? 'calculated' : 'measured',
    unavailableReason: metric.available
      ? null
      : metric.unavailableReason || (language === 'ru' ? 'Нет данных за период' : 'No data for the period'),
    ...extra,
  };
}

function compactMetricItems(items: Array<PierrotMetricItem | null>): PierrotMetricItem[] {
  return items.filter((item): item is PierrotMetricItem => item !== null);
}

function rowTable(
  rows: BreakdownRow[],
  language: AnalyticsLanguage,
  options: {
    title: string;
    description?: string;
    valueLabel: string;
    limit?: number;
  }
): PierrotTableBlock | null {
  const selected = rows.slice(0, options.limit ?? 8);
  if (selected.length === 0) return null;

  return {
    type: 'table',
    title: options.title,
    description: options.description,
    compact: true,
    columns: [
      { key: 'label', label: language === 'ru' ? 'Срез' : 'Item' },
      { key: 'value', label: options.valueLabel, align: 'right', format: 'number' },
      { key: 'share', label: language === 'ru' ? 'Доля' : 'Share', align: 'right', format: 'percent' },
    ],
    rows: selected.map((row) => ({
      label: row.label,
      value: number(row.value, language),
      share: row.share === null ? null : `${row.share.toFixed(1)}%`,
    })),
  };
}

function baseResponse(
  language: AnalyticsLanguage,
  blocks: Array<PierrotContentBlock | null>
): PierrotResponse | null {
  const compact = blocks.filter((block): block is PierrotContentBlock => Boolean(block));
  if (compact.length === 0) return null;

  return {
    version: PIERROT_RESPONSE_VERSION,
    language,
    blocks: compact.slice(0, 24),
  };
}

function chartFromGa4(
  dataset: AnalyticsDataset,
  language: AnalyticsLanguage
): PierrotChartBlock | null {
  const points = dataset.ga4.series.slice(-30);
  if (dataset.ga4.available && points.length >= 2) {
    return {
      type: 'chart',
      chart: 'line',
      title: language === 'ru' ? 'Динамика сайта' : 'Site trend',
      description:
        language === 'ru'
          ? 'Сессии, активные пользователи и просмотры страниц по дням. Источник: GA4.'
          : 'Sessions, active users and page views by day. Source: GA4.',
      data: points.map((point) => ({
        date: point.date.slice(5),
        sessions: point.sessions,
        activeUsers: point.activeUsers,
        pageViews: point.screenPageViews,
      })),
      xKey: 'date',
      series: [
        { key: 'sessions', label: 'Sessions', color: SERIES_COLORS[0] },
        { key: 'activeUsers', label: 'Active users', color: SERIES_COLORS[1] },
        { key: 'pageViews', label: 'Page views', color: SERIES_COLORS[2] },
      ],
      unit: language === 'ru' ? 'количество' : 'count',
    };
  }

  return null;
}

function chartFromBluesky(
  dataset: AnalyticsDataset,
  language: AnalyticsLanguage
): PierrotChartBlock | null {
  const posts = dataset.bluesky.posts.slice(0, 7);
  if (!dataset.bluesky.available || posts.length < 2) return null;

  return {
    type: 'chart',
    chart: 'stacked_bar',
    title: language === 'ru' ? 'Взаимодействие по постам' : 'Engagement by post',
    description:
      language === 'ru'
        ? 'Лайки, репосты и ответы по загруженным постам. Это не охват и не просмотры.'
        : 'Likes, reposts and replies on loaded posts. This is not reach or views.',
    data: posts.map((post, index) => ({
      post: `#${index + 1} ${post.text.replace(/\s+/g, ' ').slice(0, 38)}`,
      likes: post.likes,
      reposts: post.reposts,
      replies: post.replies,
    })),
    xKey: 'post',
    series: [
      { key: 'likes', label: language === 'ru' ? 'Лайки' : 'Likes', color: SERIES_COLORS[1] },
      { key: 'reposts', label: language === 'ru' ? 'Репосты' : 'Reposts', color: SERIES_COLORS[0] },
      { key: 'replies', label: language === 'ru' ? 'Ответы' : 'Replies', color: SERIES_COLORS[2] },
    ],
    unit: language === 'ru' ? 'взаимодействия' : 'interactions',
  };
}

function chartFromGscQueries(
  dataset: AnalyticsDataset,
  language: AnalyticsLanguage
): PierrotChartBlock | null {
  const rows = dataset.gsc.queries.slice(0, 8);
  if (!dataset.gsc.available || rows.length < 2) return null;

  return {
    type: 'chart',
    chart: 'bar',
    title: language === 'ru' ? 'Поисковые запросы' : 'Search queries',
    description:
      language === 'ru'
        ? 'Клики по запросам за период. Источник: Google Search Console.'
        : 'Clicks by query for the period. Source: Google Search Console.',
    data: rows.map((row) => ({
      query: row.label.length > 42 ? `${row.label.slice(0, 41)}…` : row.label,
      clicks: row.value,
    })),
    xKey: 'query',
    series: [{ key: 'clicks', label: 'Clicks', color: SERIES_COLORS[0] }],
    unit: language === 'ru' ? 'клики' : 'clicks',
  };
}

function chartFromPages(
  dataset: AnalyticsDataset,
  language: AnalyticsLanguage
): PierrotChartBlock | null {
  const rows = dataset.ga4.pages.slice(0, 8);
  if (!dataset.ga4.available || rows.length < 2) return null;

  return {
    type: 'chart',
    chart: 'bar',
    title: language === 'ru' ? 'Просмотры страниц' : 'Page views',
    description:
      language === 'ru'
        ? 'Топ страниц по просмотрам. Источник: GA4.'
        : 'Top pages by views. Source: GA4.',
    data: rows.map((row) => ({
      page: row.key.length > 40 ? `${row.key.slice(0, 39)}…` : row.key,
      views: row.value,
    })),
    xKey: 'page',
    series: [{ key: 'views', label: 'Views', color: SERIES_COLORS[0] }],
    unit: language === 'ru' ? 'просмотры' : 'views',
  };
}

function chartFromProjects(
  dataset: AnalyticsDataset,
  language: AnalyticsLanguage
): PierrotChartBlock | null {
  const projects = dataset.projects.filter((project) => project.sessions !== null).slice(0, 8);
  if (projects.length < 2) return null;

  return {
    type: 'chart',
    chart: 'bar',
    title: language === 'ru' ? 'Сессии по проектам' : 'Sessions by project',
    description:
      language === 'ru'
        ? 'Landing-сессии проектов. Источник: GA4; внутренний трафик исключён на уровне landing-разбивки.'
        : 'Project landing sessions. Source: GA4; internal traffic is excluded at landing-page level.',
    data: projects.map((project) => ({
      project: project.name,
      sessions: project.sessions || 0,
    })),
    xKey: 'project',
    series: [{ key: 'sessions', label: 'Sessions', color: SERIES_COLORS[0] }],
    unit: language === 'ru' ? 'сессии' : 'sessions',
  };
}

function pageMetrics(
  dataset: AnalyticsDataset,
  language: AnalyticsLanguage,
  pagePath: string | null
): PierrotMetricItem[] {
  const path = pagePath || '';
  const page = dataset.ga4.pages.find((row) => row.key === path);
  const landing = dataset.ga4.landingPages.find((row) => row.key === path);
  const search = dataset.gsc.pages.find((row) => row.key === path);

  return [
    {
      label: language === 'ru' ? 'Просмотры страницы' : 'Page views',
      value: page?.value ?? null,
      unit: 'count',
      source: 'GA4',
      confidence: 'measured',
      interpretation:
        language === 'ru'
          ? 'screenPageViews для page_path. Не сессии и не пользователи.'
          : 'screenPageViews for page_path. Not sessions or users.',
      unavailableReason: page ? null : language === 'ru' ? 'Нет строки GA4 за период' : 'No GA4 row for the period',
    },
    {
      label: language === 'ru' ? 'Входы на страницу' : 'Landing sessions',
      value: landing?.value ?? null,
      unit: 'count',
      source: 'GA4',
      confidence: 'measured',
      interpretation:
        language === 'ru'
          ? 'Сессии, начавшиеся с этого landing_page. Не просмотры.'
          : 'Sessions that started on this landing_page. Not views.',
      unavailableReason: landing ? null : language === 'ru' ? 'Нет строки входов за период' : 'No landing row for the period',
    },
    {
      label: language === 'ru' ? 'Клики из поиска' : 'Search clicks',
      value: search?.value ?? null,
      unit: 'count',
      source: 'Search Console',
      confidence: 'measured',
      interpretation:
        language === 'ru' ? 'Клики по URL страницы в Google Search.' : 'Clicks for the page URL in Google Search.',
      unavailableReason: search ? null : language === 'ru' ? 'Нет строки Search Console' : 'No Search Console row',
    },
    {
      label: language === 'ru' ? 'Показы в поиске' : 'Search impressions',
      value:
        search?.extra?.impressions !== undefined
          ? Number(search.extra.impressions)
          : null,
      unit: 'count',
      source: 'Search Console',
      confidence: 'measured',
      interpretation: language === 'ru' ? 'Показы URL в поиске.' : 'Page impressions in search.',
      unavailableReason:
        search?.extra?.impressions !== undefined
          ? null
          : language === 'ru'
            ? 'Нет строки Search Console'
            : 'No Search Console row',
    },
  ];
}

/**
 * Compiles an analytics report into a controlled visual response. The same
 * values remain available in the Markdown fallback; this function chooses the
 * form, never invents data.
 */
export function buildWebsiteResponse(
  report: AnalyticsReport,
  language: AnalyticsLanguage
): PierrotResponse | null {
  const { dataset, scope } = report;
  const period = dataset.period.label;

  if (scope === 'bluesky') {
    const metrics = compactMetricItems(
      ['followers', 'posts', 'likes', 'reposts', 'replies', 'engagement'].map((key) =>
        metricItem(dataset.bluesky.totals[key], language, { period })
      )
    );

    if (dataset.bluesky.available) {
      metrics.push({
        label: language === 'ru' ? 'Постов в выборке' : 'Posts in sample',
        value: dataset.bluesky.posts.length,
        unit: 'count',
        source: 'Bluesky feed',
        confidence: 'measured',
        interpretation:
          language === 'ru'
            ? 'Сколько последних постов автора загружено для расчёта взаимодействий.'
            : 'How many recent author posts were loaded for the engagement calculation.',
        period: null,
      });
    }

    return baseResponse(language, [
      {
        type: 'heading',
        level: 1,
        text: 'Bluesky',
      },
      metrics.length > 0 ? { type: 'metric', title: language === 'ru' ? 'Публичные счётчики' : 'Public counters', metrics } : null,
      chartFromBluesky(dataset, language),
      {
        type: 'insight',
        label: language === 'ru' ? 'Ограничение' : 'Limitation',
        text:
          dataset.bluesky.limitations.slice(0, 2).join(' ') ||
          (language === 'ru'
            ? 'Bluesky не отдаёт уникальный охват.'
            : 'Bluesky does not expose unique reach.'),
      },
      {
        type: 'text',
        markdown:
          language === 'ru'
            ? `Период: ${period}. Источник: публичный профиль Bluesky и сохранённые снимки постов. Счётчики показывают взаимодействия, а не охват.`
            : `Period: ${period}. Source: public Bluesky profile and stored post snapshots. Counters show engagement, not reach.`,
      },
    ]);
  }

  if (scope === 'page') {
    const pagePath = report.question.pagePath || null;
    const metrics = pageMetrics(dataset, language, pagePath);
    return baseResponse(language, [
      {
        type: 'heading',
        level: 1,
        text: language === 'ru' ? `Метрики страницы ${pagePath || ''}`.trim() : `Page metrics ${pagePath || ''}`.trim(),
      },
      { type: 'metric', title: language === 'ru' ? 'Показатели' : 'Metrics', metrics },
      {
        type: 'insight',
        label: language === 'ru' ? 'Ограничение' : 'Limitation',
        text:
          language === 'ru'
            ? 'Просмотры страницы, входы, поисковые клики, диалоги и подписки не суммируются и не переводятся друг в друга.'
            : 'Page views, landing sessions, search clicks, conversations and subscriptions are not summed or converted into one another.',
      },
    ]);
  }

  if (scope === 'newsletter') {
    const newsletter = dataset.internal.newsletter;
    const metric = (label: string, value: number | null, source = 'Supabase') =>
      ({
        label,
        value,
        unit: 'count' as const,
        source,
        confidence: 'measured' as const,
        unavailableReason: value === null ? (language === 'ru' ? 'Нет данных' : 'No data') : null,
      });

    return baseResponse(language, [
      { type: 'heading', level: 1, text: language === 'ru' ? 'Рассылки' : 'Newsletters' },
      {
        type: 'metric',
        title: language === 'ru' ? 'Подписчики и отправки' : 'Subscribers and sends',
        metrics: compactMetricItems([
          metric(language === 'ru' ? 'Активные подписчики' : 'Active subscribers', newsletter.subscribers.active),
          metric(language === 'ru' ? 'RU' : 'RU', newsletter.subscribers.ru),
          metric(language === 'ru' ? 'EN' : 'EN', newsletter.subscribers.en),
          metric(language === 'ru' ? 'Письма отправлены' : 'Emails sent', newsletter.jobs.emailsSent),
          metric(language === 'ru' ? 'Ошибки отправки' : 'Failed emails', newsletter.jobs.emailsFailed),
        ]),
      },
      rowTable(newsletter.byLanguage, language, {
        title: language === 'ru' ? 'Языковые версии' : 'Language versions',
        valueLabel: language === 'ru' ? 'Подписчики' : 'Subscribers',
      }),
      {
        type: 'insight',
        label: language === 'ru' ? 'Период' : 'Period',
        text: period,
      },
    ]);
  }

  if (scope === 'search') {
    const metrics = compactMetricItems(
      ['clicks', 'impressions', 'ctr', 'position'].map((key) =>
        metricItem(dataset.gsc.totals[key], language, { period })
      )
    );

    return baseResponse(language, [
      { type: 'heading', level: 1, text: language === 'ru' ? 'Поисковая видимость' : 'Search visibility' },
      metrics.length > 0 ? { type: 'metric', metrics } : null,
      chartFromGscQueries(dataset, language),
      rowTable(dataset.gsc.pages, language, {
        title: language === 'ru' ? 'Страницы в поиске' : 'Search pages',
        valueLabel: language === 'ru' ? 'Клики' : 'Clicks',
      }),
    ]);
  }

  if (scope === 'pages') {
    const metrics = compactMetricItems([
      metricItem(
        {
          key: 'publicPageViews',
          label: language === 'ru' ? 'Просмотры публичных страниц' : 'Public page views',
          value: dataset.ga4.traffic.publicPageViews,
          previous: null,
          deltaPercent: null,
          unit: 'count',
          source: 'google_analytics',
          definition:
            language === 'ru'
              ? 'Просмотры публичных страниц после исключения /admin.'
              : 'Public page views after excluding /admin.',
          precision: 'Direct source rows.',
          available: dataset.ga4.available,
        },
        language,
        { period }
      ),
    ]);

    return baseResponse(language, [
      { type: 'heading', level: 1, text: language === 'ru' ? 'Страницы и контент' : 'Pages and content' },
      metrics.length > 0 ? { type: 'metric', metrics } : null,
      chartFromPages(dataset, language),
      rowTable(dataset.ga4.pages, language, {
        title: language === 'ru' ? 'Просмотры по страницам' : 'Views by page',
        valueLabel: language === 'ru' ? 'Просмотры' : 'Views',
      }),
    ]);
  }

  if (scope === 'projects') {
    return baseResponse(language, [
      { type: 'heading', level: 1, text: language === 'ru' ? 'Проекты' : 'Projects' },
      chartFromProjects(dataset, language),
      rowTable(
        dataset.projects.map((project) => ({
          key: project.key,
          label: project.name,
          value: project.sessions ?? 0,
          previous: null,
          deltaPercent: null,
          share: null,
        })),
        language,
        {
          title: language === 'ru' ? 'Сессии по проектам' : 'Sessions by project',
          valueLabel: language === 'ru' ? 'Сессии' : 'Sessions',
        }
      ),
      {
        type: 'insight',
        label: language === 'ru' ? 'Ограничение' : 'Limitation',
        text:
          language === 'ru'
            ? 'Сессии проекта — это landing-сессии GA4, а не уникальные посетители и не продажи.'
            : 'Project sessions are GA4 landing sessions, not unique visitors or sales.',
      },
    ]);
  }

  if (scope === 'overview' || scope === 'traffic' || scope === 'compare') {
    const metrics = compactMetricItems(
      ['sessions', 'activeUsers', 'screenPageViews', 'engagementRate'].map((key) =>
        metricItem(dataset.ga4.totals[key], language, { period })
      )
    );

    return baseResponse(language, [
      {
        type: 'heading',
        level: 1,
        text: language === 'ru' ? 'Сайт и аудитория' : 'Site and audience',
      },
      metrics.length > 0 ? { type: 'metric', metrics } : null,
      chartFromGa4(dataset, language),
      rowTable(dataset.ga4.channels, language, {
        title: language === 'ru' ? 'Каналы привлечения' : 'Acquisition channels',
        valueLabel: language === 'ru' ? 'Сессии' : 'Sessions',
      }),
      {
        type: 'insight',
        label: language === 'ru' ? 'Определение' : 'Definition',
        text:
          language === 'ru'
            ? 'Сессии — источник GA4. Они могут включать внутренний трафик на уровне итогов; разбивка страниц исключает /admin.'
            : 'Sessions are GA4 source totals and can include internal traffic; page breakdowns exclude /admin.',
      },
    ]);
  }

  return null;
}

/**
 * Converts graph retrieval into a safe diagram plus evidence text. Direct
 * edges and inference are visually distinct; no counter-only response is made
 * here.
 */
export function buildGraphResponse(
  payload: BrainGraphPayload,
  query: string | null,
  language: 'ru' | 'en'
): PierrotResponse | null {
  if (payload.nodes.length === 0) return null;

  const nodeIds = new Set(payload.nodes.slice(0, 40).map((node) => node.id));
  const nodes = payload.nodes
    .filter((node) => nodeIds.has(node.id))
    .slice(0, 40)
    .map((node) => ({
      id: node.id,
      label: node.label.slice(0, 180),
      detail: node.subtitle || (node.kind !== 'document' ? node.kind : undefined),
      group: node.kind,
    }));
  const edges = payload.edges
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .slice(0, 60)
    .map((edge) => ({
      from: edge.source,
      to: edge.target,
      label: edge.label,
      kind: edge.inference ? ('inference' as const) : ('direct' as const),
    }));

  const direct = edges.filter((edge) => edge.kind === 'direct').length;
  const inference = edges.filter((edge) => edge.kind === 'inference').length;
  const blocks: Array<PierrotContentBlock | null> = [
      {
        type: 'heading',
        level: 1,
        text: language === 'ru' ? 'Knowledge Graph' : 'Knowledge Graph',
      },
      {
        type: 'text',
        markdown:
          language === 'ru'
            ? query
              ? `Graph retrieval по запросу «${query}»: ${nodes.length} узлов и ${edges.length} связей в выборке.`
              : `Graph retrieval по текущей выборке: ${nodes.length} узлов и ${edges.length} связей.`
            : query
              ? `Graph retrieval for “${query}”: ${nodes.length} nodes and ${edges.length} relationships in the sample.`
              : `Graph retrieval for the current sample: ${nodes.length} nodes and ${edges.length} relationships.`,
      },
      edges.length > 0
        ? {
            type: 'diagram',
            diagram: 'relationship',
            title: language === 'ru' ? 'Найденные связи' : 'Retrieved relationships',
            nodes,
            edges,
            caption:
              language === 'ru'
                ? 'Сплошные связи подтверждены провенансом; пунктирные — inference-гипотезы. Это выборка, не полный граф.'
                : 'Solid links carry provenance; dashed links are inference hypotheses. This is a sample, not the full graph.',
          }
        : null,
      {
        type: 'metric',
        metrics: [
          {
            label: language === 'ru' ? 'Прямые связи' : 'Direct relationships',
            value: direct,
            unit: 'count',
            source: 'Brain graph',
            confidence: 'measured',
          },
          {
            label: language === 'ru' ? 'Гипотезы (inference)' : 'Hypotheses (inference)',
            value: inference,
            unit: 'count',
            source: 'Brain graph',
            confidence: 'estimated',
          },
        ],
      },
      {
        type: 'insight',
        label: language === 'ru' ? 'Evidence' : 'Evidence',
        text:
          language === 'ru'
            ? 'Наличие сущности или связи в базе не означает независимого подтверждения. Inference-связи требуют проверки по первоисточнику.'
            : 'The presence of an entity or edge does not imply independent confirmation. Inference edges require verification against the primary source.',
      },
  ];
  const compact = blocks.filter((block): block is PierrotContentBlock => Boolean(block));

  return {
    version: PIERROT_RESPONSE_VERSION,
    language,
    blocks: compact,
  };
}

/**
 * Editorial composition for Journal/Flow evidence. Only adds a visual form
 * when the question asks for a history, a comparison or a count; ordinary
 * answers remain prose.
 */
export function buildJournalFlowResponse(
  evidence: JournalFlowEvidence,
  answerMarkdown: string,
  language: 'ru' | 'en',
  question: string
): PierrotResponse | null {
  if (evidence.outcome !== 'relevant_results') return null;

  const text = question.toLowerCase().replace(/ё/g, 'е');
  const wantsComparison = /(сравн|compare|сопостав|vs\.?)/i.test(text);
  const wantsHistory = /(истори|хронолог|таймлайн|timeline|когда|развит|последовательн)/i.test(text);
  const wantsCount = /(сколько|count|how\s+many|итог|total)/i.test(text);
  const events: PierrotTimelineEvent[] = [];

  for (const issue of evidence.journal) {
    events.push({
      date: issue.publishedAt || issue.periodEnd || issue.periodStart || '',
      title: issue.number ? `${language === 'ru' ? 'Выпуск' : 'Issue'} №${issue.number}: ${issue.title}` : issue.title,
      description: issue.excerpt.slice(0, 260),
      category: 'Journal',
      source: issue.url,
      url: issue.url,
    });
  }

  for (const entry of evidence.flow) {
    events.push({
      date: entry.publishedAt || '',
      title: entry.title,
      description: entry.body.slice(0, 220),
      category: entry.type,
      source: entry.sourceUrl || entry.url,
      url: entry.sourceUrl || entry.url,
    });
  }

  events.sort((left, right) => String(right.date).localeCompare(String(left.date)));

  const blocks: Array<PierrotContentBlock | null> = [
    { type: 'text', markdown: answerMarkdown.slice(0, 20_000) },
  ];

  if (wantsComparison && evidence.journal.length > 0 && evidence.flow.length > 0) {
    blocks.push({
      type: 'comparison',
      title: language === 'ru' ? 'Journal и Flow' : 'Journal and Flow',
      description:
        language === 'ru'
          ? 'Выпуски и поток записей — разные источники. Сравнение не смешивает их.'
          : 'Issues and the stream are different sources. The comparison does not merge them.',
      columns: [
        { id: 'journal', title: 'Journal', subtitle: language === 'ru' ? 'выпуски' : 'issues' },
        { id: 'flow', title: 'Flow', subtitle: language === 'ru' ? 'записи' : 'entries' },
      ],
      rows: [
        {
          label: language === 'ru' ? 'Всего опубликовано' : 'Published total',
          values: {
            journal: evidence.totalJournal ?? evidence.journal.length,
            flow: evidence.totalFlow ?? evidence.flow.length,
          },
        },
        {
          label: language === 'ru' ? 'В выборке' : 'In sample',
          values: { journal: evidence.journal.length, flow: evidence.flow.length },
        },
        {
          label: language === 'ru' ? 'Последний заголовок' : 'Latest title',
          values: {
            journal: evidence.journal[0]?.title || '—',
            flow: evidence.flow[0]?.title || '—',
          },
        },
        {
          label: language === 'ru' ? 'Последняя дата' : 'Latest date',
          values: {
            journal: evidence.journal[0]?.publishedAt?.slice(0, 10) || '—',
            flow: evidence.flow[0]?.publishedAt?.slice(0, 10) || '—',
          },
        },
      ],
    });
  } else if (wantsHistory && events.length > 0) {
    blocks.push({
      type: 'timeline',
      title: language === 'ru' ? 'Хронология' : 'Timeline',
      description:
        language === 'ru'
          ? 'События из опубликованных записей Journal/Flow с датами и источниками.'
          : 'Events from published Journal/Flow records with dates and sources.',
      events: events.slice(0, 40),
    });
  }

  if (wantsCount) {
    const metrics = [
      ...(evidence.totalJournal !== null
        ? [
            {
              label: language === 'ru' ? 'Опубликованные выпуски' : 'Published issues',
              value: evidence.totalJournal,
              unit: 'count' as const,
              source: 'Journal',
              confidence: 'measured' as const,
            },
          ]
        : []),
      ...(evidence.totalFlow !== null
        ? [
            {
              label: language === 'ru' ? 'Опубликованные записи Flow' : 'Published Flow entries',
              value: evidence.totalFlow,
              unit: 'count' as const,
              source: 'Flow',
              confidence: 'measured' as const,
            },
          ]
        : []),
    ];

    if (metrics.length > 0) {
      blocks.push({ type: 'metric', metrics });
    }
  }

  const compact = blocks.filter((block): block is PierrotContentBlock => Boolean(block));
  if (compact.length <= 1) return null;

  return {
    version: PIERROT_RESPONSE_VERSION,
    language,
    blocks: compact,
  };
}

export function timelineFromEvents(
  events: PierrotTimelineEvent[],
  options: { title?: string; description?: string; language?: 'ru' | 'en' } = {}
): PierrotResponse | null {
  if (events.length === 0) return null;

  return {
    version: PIERROT_RESPONSE_VERSION,
    language: options.language,
    blocks: [
      {
        type: 'timeline',
        title: options.title,
        description: options.description,
        events: events.slice(0, 100),
      },
    ],
  };
}
