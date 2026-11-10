import { assertServerOnly } from '@/lib/serverOnly';
import { getServerSupabaseClient } from '@/lib/serverAuth';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getAnalyticsTimezone } from './config';
import { loadAnalyticsDataset, deltaPercent } from './dataset';
import {
  buildEvidence,
  buildFunnel,
  detectAnomalies,
  findContentOpportunities,
  formatDelta,
  formatMetricValue,
  formatMoney,
  formatNumber,
  formatPercent,
  reportHeadline,
  type Finding,
} from './insights';
import { normalizePath } from './normalize';
import { resolveWebsitePeriod } from './period';
import type {
  AnalyticsDataset,
  AnalyticsLanguage,
  AnalyticsReport,
  BreakdownRow,
  ContentMatch,
  MetricComparison,
  ProjectPerformance,
  ProviderHealth,
  WebsiteQuestion,
} from './types';

assertServerOnly('lib/analytics/website/report');

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|').replace(/\n+/g, ' ').trim();
}

function table(headers: string[], rows: string[][]): string {
  if (rows.length === 0) return '';
  return [
    `| ${headers.map(escapeCell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escapeCell).join(' | ')} |`),
  ].join('\n');
}

function kpiTable(metrics: MetricComparison[], language: AnalyticsLanguage): string {
  return table(
    [
      language === 'ru' ? 'Показатель' : 'Metric',
      language === 'ru' ? 'Период' : 'Period',
      language === 'ru' ? 'Предыдущий' : 'Previous',
      language === 'ru' ? 'Изменение' : 'Change',
      language === 'ru' ? 'Источник' : 'Source',
    ],
    metrics.map((metric) => [
      metric.label,
      formatMetricValue(metric, language),
      metric.previous === null ? '—' : formatMetricValue({ ...metric, value: metric.previous, available: true }, language),
      formatDelta(metric, language),
      metric.source === 'google_analytics'
        ? 'GA4'
        : metric.source === 'search_console'
          ? 'Search Console'
          : metric.source === 'umami'
            ? 'Umami'
            : metric.source === 'bluesky'
              ? 'Bluesky'
              : 'Supabase',
    ])
  );
}

function breakdownTable(
  rows: BreakdownRow[],
  language: AnalyticsLanguage,
  options: { valueLabel: string; limit?: number; extra?: boolean } = { valueLabel: 'Значение' }
): string {
  const selected = rows.slice(0, options.limit ?? 6);

  return table(
    [
      language === 'ru' ? 'Срез' : 'Item',
      options.valueLabel,
      language === 'ru' ? 'Доля' : 'Share',
      language === 'ru' ? 'Изменение' : 'Change',
    ],
    selected.map((row) => [
      row.label,
      formatNumber(row.value, language),
      formatPercent(row.share ?? null, language),
      row.deltaPercent === null
        ? '—'
        : `${row.deltaPercent > 0 ? '+' : ''}${row.deltaPercent.toFixed(1)}%`,
    ])
  );
}

function searchQueryTable(rows: BreakdownRow[], language: AnalyticsLanguage): string {
  return table(
    [
      language === 'ru' ? 'Запрос' : 'Query',
      language === 'ru' ? 'Клики' : 'Clicks',
      language === 'ru' ? 'Показы' : 'Impressions',
      'CTR',
      language === 'ru' ? 'Позиция' : 'Position',
    ],
    rows.slice(0, 5).map((row) => [
      row.label,
      formatNumber(row.value, language),
      formatNumber(Number(row.extra?.impressions ?? 0), language),
      formatPercent(Number(row.extra?.ctr ?? 0) * 100, language),
      row.extra?.position === null || row.extra?.position === undefined
        ? '—'
        : Number(row.extra.position).toFixed(1),
    ])
  );
}

function searchPageTable(rows: BreakdownRow[], language: AnalyticsLanguage): string {
  return table(
    [
      language === 'ru' ? 'Страница' : 'Page',
      language === 'ru' ? 'Клики' : 'Clicks',
      language === 'ru' ? 'Показы' : 'Impressions',
      'CTR',
      language === 'ru' ? 'Позиция' : 'Position',
    ],
    rows.slice(0, 5).map((row) => [
      row.label,
      formatNumber(row.value, language),
      formatNumber(Number(row.extra?.impressions ?? 0), language),
      formatPercent(Number(row.extra?.ctr ?? 0) * 100, language),
      row.extra?.position === null || row.extra?.position === undefined
        ? '—'
        : Number(row.extra.position).toFixed(1),
    ])
  );
}

function contentTitle(match: ContentMatch | undefined): string {
  if (!match) return '';
  if (match.title) return match.title;
  if (match.slug) return match.slug;
  return match.path;
}

function projectTable(projects: ProjectPerformance[], language: AnalyticsLanguage): string {
  return table(
    [
      language === 'ru' ? 'Проект' : 'Project',
      language === 'ru' ? 'Сессии' : 'Sessions',
      language === 'ru' ? 'Просмотры' : 'Views',
      language === 'ru' ? 'Клики поиска' : 'Search clicks',
      language === 'ru' ? 'Показы' : 'Impressions',
      language === 'ru' ? 'Диалоги Pierrot' : 'Pierrot chats',
    ],
    projects.map((project) => [
      project.name,
      formatNumber(project.sessions, language),
      formatNumber(project.pageViews, language),
      formatNumber(project.searchClicks, language),
      formatNumber(project.searchImpressions, language),
      formatNumber(project.internalConversations, language),
    ])
  );
}

function sourceTable(sources: ProviderHealth[], language: AnalyticsLanguage): string {
  const statusText = (source: ProviderHealth): string => {
    if (source.status === 'connected') {
      return source.lastSyncStatus === 'partial'
        ? language === 'ru'
          ? 'подключён · частично'
          : 'connected · partial'
        : language === 'ru'
          ? 'подключён'
          : 'connected';
    }
    if (source.status === 'error') return language === 'ru' ? 'ошибка' : 'error';
    if (source.status === 'needs_reauthorization') {
      return language === 'ru' ? 'нужно разрешение' : 'needs authorization';
    }
    if (source.status === 'not_configured') {
      return language === 'ru' ? 'не настроен' : 'not configured';
    }
    if (source.status === 'disabled') {
      return language === 'ru' ? 'отключён' : 'disabled';
    }
    return language === 'ru' ? 'не подключён' : 'not connected';
  };

  return table(
    [
      language === 'ru' ? 'Источник' : 'Source',
      language === 'ru' ? 'Статус' : 'Status',
      language === 'ru' ? 'Последняя синхронизация' : 'Last sync',
      language === 'ru' ? 'Данные за' : 'Data range',
      language === 'ru' ? 'Что нужно' : 'Action',
    ],
    sources.map((source) => [
      source.label,
      statusText(source),
      source.lastSyncAt
        ? new Date(source.lastSyncAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-GB', {
            timeZone: getAnalyticsTimezone(),
          })
        : '—',
      source.dataFrom && source.dataTo ? `${source.dataFrom} — ${source.dataTo}` : '—',
      source.actionRequired || '—',
    ])
  );
}

function findingBlock(finding: Finding, language: AnalyticsLanguage): string {
  const lines: string[] = [`**${finding.title}**`];

  if (finding.facts.length > 0) {
    lines.push(
      `${language === 'ru' ? 'Факт' : 'Fact'}: ${finding.facts.join(' ')}`
    );
  }
  if (finding.interpretation.length > 0) {
    lines.push(
      `${language === 'ru' ? 'Интерпретация' : 'Interpretation'}: ${finding.interpretation.join(' ')}`
    );
  }
  if (finding.hypothesis.length > 0) {
    lines.push(
      `${language === 'ru' ? 'Гипотеза' : 'Hypothesis'}: ${finding.hypothesis.join(' ')}`
    );
  }
  if (finding.recommendation.length > 0) {
    lines.push(
      `${language === 'ru' ? 'Рекомендация' : 'Recommendation'}: ${finding.recommendation.join(' ')}`
    );
  }

  return lines.join('\n');
}

function audienceSection(dataset: AnalyticsDataset, language: AnalyticsLanguage): string {
  const { ga4, umami, internal } = dataset;
  const blocks: string[] = ['### Аудитория'];

  if (!ga4.available && !umami.available) {
    blocks.push(
      language === 'ru'
        ? 'Google Analytics и Umami не подключены или не содержат данных за этот период. Я не подставляю ноль вместо отсутствующих измерений.'
        : 'Google Analytics and Umami are not connected or contain no data for this period. I do not substitute zero for missing measurements.'
    );
  } else {
    if (ga4.available) {
      if (
        ga4.traffic.ownerAdminPageViews > 0 ||
        ga4.traffic.ownerAdminLandingSessions > 0
      ) {
        blocks.push(
          language === 'ru'
            ? `Публичная аудитория: ${formatNumber(
                ga4.traffic.publicLandingSessions,
                language
              )} landing-сессий и ${formatNumber(
                ga4.traffic.publicPageViews,
                language
              )} просмотров публичных страниц. Исключено внутреннего трафика: ${formatNumber(
                ga4.traffic.ownerAdminLandingSessions,
                language
              )} landing-сессий и ${formatNumber(
                ga4.traffic.ownerAdminPageViews,
                language
              )} просмотров /admin. Итоговые GA4 sessions ниже — сумма источника и могут включать /admin.`
            : `Public audience: ${formatNumber(
                ga4.traffic.publicLandingSessions,
                language
              )} landing sessions and ${formatNumber(
                ga4.traffic.publicPageViews,
                language
              )} public page views. Excluded internal traffic: ${formatNumber(
                ga4.traffic.ownerAdminLandingSessions,
                language
              )} landing sessions and ${formatNumber(
                ga4.traffic.ownerAdminPageViews,
                language
              )} /admin views. GA4 session totals below are source totals and can include /admin.`
        );
      }
      blocks.push(
        kpiTable(
          [
            ga4.totals.sessions,
            ga4.totals.activeUsers,
            ga4.totals.newUsers,
            ga4.totals.returningUsersDerived,
            ga4.totals.screenPageViews,
            ga4.totals.engagementRate,
            ga4.totals.averageEngagementTime,
          ],
          language
        )
      );

      if (ga4.channels.length > 0) {
        blocks.push(`**${language === 'ru' ? 'Каналы привлечения' : 'Acquisition channels'}**`);
        blocks.push(
          breakdownTable(ga4.channels, language, {
            valueLabel: language === 'ru' ? 'Сессии' : 'Sessions',
            limit: 6,
          })
        );
      }

      if (ga4.sources.length > 0) {
        blocks.push(`**${language === 'ru' ? 'Источники и medium' : 'Sources and medium'}**`);
        blocks.push(
          breakdownTable(ga4.sources, language, {
            valueLabel: language === 'ru' ? 'Сессии' : 'Sessions',
            limit: 6,
          })
        );
      }

      if (ga4.devices.length > 0 || ga4.countries.length > 0) {
        const deviceRows = ga4.devices.slice(0, 4).map((row) => [
          language === 'ru' ? 'Устройство' : 'Device',
          row.label,
          formatNumber(row.value, language),
          formatPercent(row.share ?? null, language),
        ]);
        const countryRows = ga4.countries.slice(0, 4).map((row) => [
          language === 'ru' ? 'Страна' : 'Country',
          row.label,
          formatNumber(row.value, language),
          formatPercent(row.share ?? null, language),
        ]);
        blocks.push(
          table(
            [language === 'ru' ? 'Тип' : 'Type', language === 'ru' ? 'Значение' : 'Value', language === 'ru' ? 'Сессии' : 'Sessions', language === 'ru' ? 'Доля' : 'Share'],
            [...deviceRows, ...countryRows]
          )
        );
      }
    }

    if (umami.available) {
      blocks.push(`**Umami · ${language === 'ru' ? 'независимая проверка' : 'independent check'}**`);
      blocks.push(
        kpiTable(
          [umami.totals.pageviews, umami.totals.visits, umami.totals.visitors],
          language
        )
      );

      if (ga4.totals.sessions.value !== null && umami.totals.visits.value !== null) {
        const ga = ga4.totals.sessions.value;
        const um = umami.totals.visits.value;
        const diff = ga > 0 ? ((um - ga) / ga) * 100 : null;
        blocks.push(
          language === 'ru'
            ? `Расхождение: GA4 ${formatNumber(ga, language)} сессий, Umami ${formatNumber(
                um,
                language
              )} визитов${diff === null ? '' : ` (${diff > 0 ? '+' : ''}${diff.toFixed(1)}% к GA4)`}. Это разные определения, а не ошибка одного из источников.`
            : `Difference: GA4 ${formatNumber(ga, language)} sessions, Umami ${formatNumber(
                um,
                language
              )} visits${diff === null ? '' : ` (${diff > 0 ? '+' : ''}${diff.toFixed(1)}% vs GA4)`}. Different definitions, not necessarily an error.`
        );
      }
    }
  }

  if (internal.conversations.total !== null) {
    blocks.push(
      language === 'ru'
        ? `Внутренние диалоги Pierrot без сессий владельца: ${formatNumber(
            internal.conversations.total,
            language
          )} за период (предыдущий: ${formatNumber(
            internal.conversations.previousTotal,
            language
          )}).`
        : `Internal Pierrot conversations excluding owner sessions: ${formatNumber(
            internal.conversations.total,
            language
          )} for the period (previous: ${formatNumber(
            internal.conversations.previousTotal,
            language
          )}).`
    );
  }

  return blocks.join('\n\n');
}

function searchSection(dataset: AnalyticsDataset, language: AnalyticsLanguage): string {
  const { gsc, contentMatches } = dataset;
  const blocks: string[] = ['### Поисковая видимость'];

  if (!gsc.available) {
    blocks.push(
      language === 'ru'
        ? 'Search Console не подключён или за этот период нет сохранённых данных. Запросы, позиции и CTR не выдумываются.'
        : 'Search Console is not connected or has no stored data for this period. Queries, positions and CTR are not invented.'
    );
    return blocks.join('\n\n');
  }

  blocks.push(
    kpiTable(
      [gsc.totals.clicks, gsc.totals.impressions, gsc.totals.ctr, gsc.totals.position],
      language
    )
  );

  if (gsc.queries.length > 0) {
    blocks.push(`**${language === 'ru' ? 'Запросы' : 'Queries'}**`);
    blocks.push(searchQueryTable(gsc.queries, language));
  }

  if (gsc.pages.length > 0) {
    blocks.push(`**${language === 'ru' ? 'Страницы в поиске' : 'Pages in search'}**`);
    blocks.push(searchPageTable(gsc.pages, language));
  }

  if (gsc.risingQueries.length > 0) {
    blocks.push(
      language === 'ru'
        ? `**Растущий интерес:** ${gsc.risingQueries
            .slice(0, 5)
            .map((row) => `«${row.label}» (${row.deltaPercent === null ? '—' : `${row.deltaPercent > 0 ? '+' : ''}${row.deltaPercent.toFixed(0)}%`} показов)`)
            .join(' · ')}`
        : `**Rising interest:** ${gsc.risingQueries
            .slice(0, 5)
            .map((row) => `“${row.label}” (${row.deltaPercent === null ? '—' : `${row.deltaPercent > 0 ? '+' : ''}${row.deltaPercent.toFixed(0)}%`} impressions)`)
            .join(' · ')}`
    );
  }

  if (gsc.lowCtrPages.length > 0) {
    blocks.push(`**${language === 'ru' ? 'Высокие показы · низкий CTR' : 'High impressions · low CTR'}**`);
    blocks.push(
      table(
        [
          language === 'ru' ? 'Страница' : 'Page',
          language === 'ru' ? 'Показы' : 'Impressions',
          language === 'ru' ? 'Клики' : 'Clicks',
          'CTR',
          language === 'ru' ? 'Материал' : 'Content',
        ],
        gsc.lowCtrPages.slice(0, 5).map((row) => {
          const match = contentMatches.find((item) => item.path === row.page);
          return [
            row.page,
            formatNumber(row.impressions, language),
            formatNumber(row.clicks, language),
            formatPercent(row.ctr * 100, language),
            match ? contentTitle(match) : '—',
          ];
        })
      )
    );
  }

  if (gsc.lostPages.length > 0) {
    blocks.push(
      language === 'ru'
        ? `**Потеря видимости:** ${gsc.lostPages
            .slice(0, 5)
            .map((row) => `${row.label} (${row.deltaPercent === null ? '—' : `${row.deltaPercent.toFixed(0)}%`} показов)`)
            .join(' · ')}`
        : `**Lost visibility:** ${gsc.lostPages
            .slice(0, 5)
            .map((row) => `${row.label} (${row.deltaPercent === null ? '—' : `${row.deltaPercent.toFixed(0)}%`} impressions)`)
            .join(' · ')}`
    );
  }

  return blocks.join('\n\n');
}

function pagesSection(
  dataset: AnalyticsDataset,
  language: AnalyticsLanguage,
  compact = false
): string {
  const { ga4, gsc, contentMatches } = dataset;
  const blocks: string[] = ['### Страницы и материалы'];

  if (ga4.available && ga4.pages.length > 0) {
    blocks.push(`**${language === 'ru' ? 'Просмотры страниц · GA4' : 'Page views · GA4'}**`);
    blocks.push(
      table(
        [
          language === 'ru' ? 'Страница' : 'Page',
          language === 'ru' ? 'Просмотры' : 'Views',
          language === 'ru' ? 'Материал / тип' : 'Content / type',
          language === 'ru' ? 'Brain' : 'Brain',
        ],
        ga4.pages.slice(0, 8).map((row) => {
          const match = contentMatches.find((item) => item.path === row.key);
          return [
            row.label,
            formatNumber(row.value, language),
            match ? `${contentTitle(match)} · ${match.type}` : '—',
            match?.brainDocumentId ? 'есть' : '—',
          ];
        })
      )
    );
  } else {
    blocks.push(
      language === 'ru'
        ? 'Нет данных GA4 по страницам за период.'
        : 'No GA4 page data for the period.'
    );
  }

  if (!compact && gsc.available && gsc.pages.length > 0) {
    blocks.push(`**${language === 'ru' ? 'Поисковые страницы · Search Console' : 'Search pages · Search Console'}**`);
    blocks.push(searchPageTable(gsc.pages, language));
  }

  const matched = contentMatches.filter((match) => match.type !== 'unknown');
  const unknown = contentMatches.filter((match) => match.type === 'unknown');

  blocks.push(
    language === 'ru'
      ? `Сопоставлено с материалами или проектами: ${matched.length}. Не сопоставлено: ${unknown.length}. Сопоставление выполняется по URL/slug; при отсутствии совпадения это указывается, а не угадывается.`
      : `Matched to content or projects: ${matched.length}. Unmatched: ${unknown.length}. Matching uses URL/slug; when there is no match it is reported, not guessed.`
  );

  const matchedBrain = contentMatches.filter((match) => match.brainDocumentId).length;
  blocks.push(
    language === 'ru'
      ? `Brain: ${dataset.internal.content.knowledgeDocuments ?? '—'} документов, ${matchedBrain} сопоставлено с трафиком. Media Intelligence: ${dataset.internal.content.mediaRecords ?? '—'} записей. Это контекст, а не доказательство причинной связи.`
      : `Brain: ${dataset.internal.content.knowledgeDocuments ?? '—'} documents, ${matchedBrain} matched to traffic. Media Intelligence: ${dataset.internal.content.mediaRecords ?? '—'} records. This is context, not proof of causation.`
  );

  if (unknown.length > 0) {
    blocks.push(
      language === 'ru'
        ? `Без соответствия: ${unknown
            .slice(0, 6)
            .map((match) => match.path)
            .join(' · ')}`
        : `Unmatched: ${unknown
            .slice(0, 6)
            .map((match) => match.path)
            .join(' · ')}`
    );
  }

  return blocks.join('\n\n');
}

function projectsSection(
  dataset: AnalyticsDataset,
  language: AnalyticsLanguage,
  focus: string | null,
  compact = false
): string {
  const blocks: string[] = ['### Проекты'];
  const projects = focus
    ? dataset.projects.filter((project) => project.key === focus)
    : dataset.projects;

  if (projects.length === 0) {
    blocks.push(language === 'ru' ? 'Проект не распознан.' : 'Project not recognised.');
    return blocks.join('\n\n');
  }

  blocks.push(projectTable(projects, language));

  const emptyProjects: string[] = [];

  for (const project of projects) {
    const mustShow =
      !compact ||
      Boolean(focus) ||
      project.facts.length > 0 ||
      project.key === 'flow' ||
      project.key === 'heart';

    if (!mustShow) {
      emptyProjects.push(project.name);
      continue;
    }

    const lines: string[] = [`**${project.name}**`];
    if (project.facts.length === 0) {
      lines.push(
        language === 'ru'
          ? 'Нет данных о трафике или диалогах Pierrot по проекту за период. Это не ноль.'
          : 'No traffic or Pierrot conversation data for the project in this period. This is not zero.'
      );
    } else {
      lines.push(...project.facts.map((fact) => `- ${fact}`));
    }

    if (project.key === 'flow') {
      const confirmed = dataset.internal.confirmedSubscriptions;
      const submitted = dataset.internal.subscriptionEvents.find(
        (row) => row.key === 'subscription_submitted'
      )?.value;
      const confirmedEvents = dataset.internal.subscriptionEvents.find(
        (row) => row.key === 'subscription_confirmed'
      )?.value;
      const related = project.confirmedSubscriptions;
      lines.push(
        language === 'ru'
          ? `- Подписки: начато ${formatNumber(submitted ?? null, language)}, подтверждено событиями ${formatNumber(
              confirmedEvents ?? null,
              language
            )}, подтверждено в базе ${formatNumber(confirmed, language)}${
              related !== null ? `, из них связаны с диалогами на страницах Flow: ${related}` : ''
            }. Первое и второе — разные учёты, они не складываются; связь по conversation_id не является атрибуцией источника.`
          : `- Subscriptions: submitted ${formatNumber(submitted ?? null, language)}, confirmed events ${formatNumber(
              confirmedEvents ?? null,
              language
            )}, confirmed in database ${formatNumber(confirmed, language)}${
              related !== null ? `, of which linked to conversations started on Flow pages: ${related}` : ''
            }. These are different counts and are not added together; the conversation_id link is not source attribution.`
      );
    }

    if (project.key === 'heart') {
      lines.push(
        language === 'ru'
          ? `- Всего подтверждённых пожертвований в базе: ${formatNumber(
              dataset.internal.donations.count,
              language
            )}${
              dataset.internal.donations.amountMinor !== null
                ? ` на ${formatMoney(
                    dataset.internal.donations.amountMinor,
                    dataset.internal.donations.currency,
                    language
                  )}`
                : ''
            }; из них по offer Heart & Angel: ${formatNumber(
              project.confirmedDonations,
              language
            )}. Связь с посещением Heart & Angel не подтверждена.`
          : `- Confirmed donations in the database: ${formatNumber(
              dataset.internal.donations.count,
              language
            )}; linked to a Heart & Angel offer: ${formatNumber(
              project.confirmedDonations,
              language
            )}. The link to a Heart & Angel visit is not confirmed.`
      );
    }

    lines.push(
      language === 'ru'
        ? '- Атрибуция: источник перехода к подтверждённому действию неизвестен. Это не приписывается проекту без подтверждения.'
        : '- Attribution: the source of a confirmed action is unknown. It is not assigned to the project without confirmation.'
    );

    blocks.push(lines.join('\n'));
  }

  if (emptyProjects.length > 0) {
    blocks.push(
      language === 'ru'
        ? `Без данных за период (не ноль): ${emptyProjects.join(' · ')}.`
        : `No data for the period (not zero): ${emptyProjects.join(' · ')}.`
    );
  }

  return blocks.join('\n\n');
}

function funnelSection(dataset: AnalyticsDataset, language: AnalyticsLanguage): string {
  const stages = buildFunnel(dataset, language);
  const blocks: string[] = ['### Воронка действий'];

  blocks.push(
    table(
      [
        language === 'ru' ? 'Этап' : 'Stage',
        language === 'ru' ? 'Значение' : 'Value',
        language === 'ru' ? 'Источник' : 'Source',
        language === 'ru' ? 'Определение' : 'Definition',
      ],
      stages.map((stage) => [
        stage.label,
        formatNumber(stage.value, language),
        stage.source === 'internal'
          ? 'Supabase'
          : stage.source === 'search_console'
            ? 'Search Console'
            : 'GA4',
        stage.definition,
      ])
    )
  );

  blocks.push(
    language === 'ru'
      ? 'Этапы из разных источников не перемножаются и не превращаются в единый «процент конверсии». Показ, клик, сессия, начатая подписка и подтверждённая подписка — разные события.'
      : 'Stages from different sources are not multiplied into a single “conversion rate”. Impression, click, session, submitted subscription and confirmed subscription are different events.'
  );

  if (dataset.internal.subscriptionEvents.length > 0) {
    blocks.push(`**${language === 'ru' ? 'События подписки' : 'Subscription events'}**`);
    blocks.push(
      breakdownTable(dataset.internal.subscriptionEvents, language, {
        valueLabel: language === 'ru' ? 'События' : 'Events',
        limit: 8,
      })
    );
  }

  return blocks.join('\n\n');
}

function actionsSection(dataset: AnalyticsDataset, language: AnalyticsLanguage): string {
  const { internal } = dataset;
  const blocks: string[] = ['### Реальные действия'];

  const subDelta = deltaPercent(
    internal.confirmedSubscriptions,
    internal.previousConfirmedSubscriptions
  );

  blocks.push(
    table(
      [
        language === 'ru' ? 'Действие' : 'Action',
        language === 'ru' ? 'Период' : 'Period',
        language === 'ru' ? 'Предыдущий' : 'Previous',
        language === 'ru' ? 'Изменение' : 'Change',
        language === 'ru' ? 'Источник' : 'Source',
      ],
      [
        [
          language === 'ru' ? 'Подтверждённые подписки' : 'Confirmed subscriptions',
          formatNumber(internal.confirmedSubscriptions, language),
          formatNumber(internal.previousConfirmedSubscriptions, language),
          subDelta === null ? '—' : `${subDelta > 0 ? '+' : ''}${subDelta.toFixed(1)}%`,
          'pierrot_v_subscription_conversions',
        ],
        [
          language === 'ru' ? 'Подтверждённые пожертвования' : 'Confirmed donations',
          formatNumber(internal.donations.count, language),
          '—',
          '—',
          'pierrot_v_donations',
        ],
        [
          language === 'ru' ? 'Подтверждённые покупки' : 'Confirmed purchases',
          formatNumber(internal.purchases.count, language),
          '—',
          '—',
          'pierrot_v_purchases',
        ],
      ]
    )
  );

  if (!internal.donations.available) {
    blocks.push(
      language === 'ru'
        ? 'Пожертвования: источник недоступен. Это не ноль.'
        : 'Donations: source unavailable. This is not zero.'
    );
  }

  blocks.push(
    language === 'ru'
      ? 'Подтверждённые действия не приписаны к каналу, запросу или странице: сквозной атрибуции нет. Начатая подписка, checkout и клик по кнопке здесь не считаются покупкой или подпиской.'
      : 'Confirmed actions are not attributed to a channel, query or page: there is no end-to-end attribution. Submitted subscriptions, checkout and button clicks are not counted as a purchase or subscription here.'
  );

  return blocks.join('\n\n');
}

/**
 * Exact-page report. It never answers a URL question with site-wide totals:
 * page views, landing sessions, search clicks and internal actions are
 * different measurements and keep their own source and definition.
 */
export function pageDetailSection(
  dataset: AnalyticsDataset,
  language: AnalyticsLanguage,
  rawPath: string | null | undefined
): string {
  const path = normalizePath(rawPath || '');
  const blocks: string[] = [
    `### ${language === 'ru' ? 'Страница' : 'Page'}: ${path || '—'}`,
  ];

  if (!path) {
    blocks.push(
      language === 'ru'
        ? 'Не удалось определить URL страницы. Укажите путь, например `/flow`.'
        : 'Could not determine the page URL. Specify a path such as `/flow`.'
    );
    return blocks.join('\n\n');
  }

  const ga4Page = dataset.ga4.pages.find((row) => normalizePath(row.key) === path) || null;
  const ga4Landing =
    dataset.ga4.landingPages.find((row) => normalizePath(row.key) === path) || null;
  const gscPage = dataset.gsc.pages.find((row) => normalizePath(row.key) === path) || null;
  const conversations =
    dataset.internal.conversations.byStartPage.find(
      (row) => normalizePath(row.key) === path
    ) || null;
  const subscriptions =
    dataset.internal.confirmedSubscriptionsByStartPage.find(
      (row) => normalizePath(row.key) === path
    ) || null;
  const content = dataset.contentMatches.find((match) => match.path === path) || null;

  const rows: string[][] = [];

  if (dataset.ga4.available) {
    rows.push([
      language === 'ru' ? 'Просмотры страницы' : 'Page views',
      ga4Page ? formatNumber(ga4Page.value, language) : language === 'ru' ? 'нет строки' : 'no row',
      'GA4',
      language === 'ru'
        ? 'screenPageViews для page_path; не сессии и не пользователи.'
        : 'screenPageViews for page_path; not sessions or users.',
    ]);
    rows.push([
      language === 'ru' ? 'Входы на страницу' : 'Landing sessions',
      ga4Landing
        ? formatNumber(ga4Landing.value, language)
        : language === 'ru'
          ? 'нет строки'
          : 'no row',
      'GA4',
      language === 'ru'
        ? 'Сессии, начавшиеся с этого landing_page; не просмотры страницы.'
        : 'Sessions that started on this landing_page; not page views.',
    ]);
  }

  if (dataset.gsc.available) {
    rows.push([
      language === 'ru' ? 'Клики из поиска' : 'Search clicks',
      gscPage ? formatNumber(gscPage.value, language) : language === 'ru' ? 'нет строки' : 'no row',
      'Search Console',
      language === 'ru'
        ? 'Клики по URL страницы в Google Search.'
        : 'Clicks for the page URL in Google Search.',
    ]);
    rows.push([
      language === 'ru' ? 'Показы в поиске' : 'Search impressions',
      gscPage && gscPage.extra?.impressions !== undefined
        ? formatNumber(Number(gscPage.extra.impressions), language)
        : '—',
      'Search Console',
      language === 'ru' ? 'Показы страницы в поиске.' : 'Page impressions in search.',
    ]);
    rows.push([
      'CTR',
      gscPage && gscPage.extra?.ctr !== undefined
        ? formatPercent(Number(gscPage.extra.ctr) * 100, language)
        : '—',
      'Search Console',
      language === 'ru' ? 'Клики / показы.' : 'Clicks / impressions.',
    ]);
    rows.push([
      language === 'ru' ? 'Средняя позиция' : 'Average position',
      gscPage && gscPage.extra?.position !== undefined && gscPage.extra.position !== null
        ? Number(gscPage.extra.position).toFixed(1)
        : '—',
      'Search Console',
      language === 'ru' ? 'Средняя позиция в выдаче.' : 'Average search position.',
    ]);
  }

  if (conversations) {
    rows.push([
      language === 'ru' ? 'Диалоги Pierrot' : 'Pierrot conversations',
      formatNumber(conversations.value, language),
      'Supabase',
      language === 'ru'
        ? 'Диалоги, начатые с этого пути. Это не посетители сайта.'
        : 'Conversations started from this path. Not site visitors.',
    ]);
  }

  if (subscriptions) {
    rows.push([
      language === 'ru' ? 'Подтверждённые подписки' : 'Confirmed subscriptions',
      formatNumber(subscriptions.value, language),
      'Supabase',
      language === 'ru'
        ? 'Подтверждённые события подписки с этого пути.'
        : 'Confirmed subscription events from this path.',
    ]);
  }

  if (rows.length > 0) {
    blocks.push(
      table(
        [
          language === 'ru' ? 'Метрика' : 'Metric',
          language === 'ru' ? 'Значение' : 'Value',
          language === 'ru' ? 'Источник' : 'Source',
          language === 'ru' ? 'Определение' : 'Definition',
        ],
        rows
      )
    );

    if (!ga4Page && !ga4Landing && !gscPage && !conversations && !subscriptions) {
      blocks.push(
        language === 'ru'
          ? 'Ни в одном подключённом источнике нет строки для этого URL за период. Это не означает, что страница не существует или её не посещают.'
          : 'No connected source has a row for this URL in the period. This does not mean the page does not exist or receives no visits.'
      );
    }
  } else {
    blocks.push(
      language === 'ru'
        ? 'По этому URL нет строк GA4, Search Console или внутренних действий за период. Это не означает, что страница не существует и не посещается.'
        : 'There are no GA4, Search Console or internal-action rows for this URL in the period. This does not mean the page does not exist or has no visits.'
    );
  }

  if (content) {
    blocks.push(
      language === 'ru'
        ? `Материал: ${contentTitle(content)} · тип: ${content.type}${content.brainDocumentId ? ' · есть в Brain' : ''}.`
        : `Content: ${contentTitle(content)} · type: ${content.type}${content.brainDocumentId ? ' · present in Brain' : ''}.`
    );
  }

  blocks.push(
    language === 'ru'
      ? 'Это метрики именно указанного URL. Просмотры страницы, входы, поисковые клики, диалоги и подписки не суммируются и не переводятся друг в друга.'
      : 'These are metrics for the specified URL only. Page views, landing sessions, search clicks, conversations and subscriptions are not summed or converted into one another.'
  );

  return blocks.join('\n\n');
}

function blueskySection(dataset: AnalyticsDataset, language: AnalyticsLanguage): string {
  const bluesky = dataset.bluesky;
  const blocks: string[] = ['### Bluesky'];

  if (!bluesky.available) {
    blocks.push(
      language === 'ru'
        ? 'Bluesky не подключён или нет сохранённых данных. Это не ноль.'
        : 'Bluesky is not connected or has no stored data. This is not zero.'
    );
    return blocks.join('\n\n');
  }

  blocks.push(
    kpiTable(
      [
        bluesky.totals.followers,
        bluesky.totals.posts,
        bluesky.totals.likes,
        bluesky.totals.reposts,
        bluesky.totals.replies,
        bluesky.totals.engagement,
      ],
      language
    )
  );

  if (bluesky.topPosts.length > 0) {
    blocks.push(language === 'ru' ? '**Посты с наибольшим взаимодействием**' : '**Top posts by engagement**');
    blocks.push(
      table(
        [
          language === 'ru' ? 'Пост' : 'Post',
          language === 'ru' ? 'Дата' : 'Date',
          language === 'ru' ? 'Лайки' : 'Likes',
          language === 'ru' ? 'Репосты' : 'Reposts',
          language === 'ru' ? 'Ответы' : 'Replies',
          language === 'ru' ? 'Ссылка' : 'Link',
        ],
        bluesky.topPosts.slice(0, 6).map((post) => [
          post.text.replace(/\s+/g, ' ').slice(0, 90) || '(без текста)',
          post.createdAt ? post.createdAt.slice(0, 10) : '—',
          formatNumber(post.likes, language),
          formatNumber(post.reposts, language),
          formatNumber(post.replies, language),
          post.url || '—',
        ])
      )
    );
  }

  if (bluesky.siteLinkedPosts.length > 0) {
    blocks.push(
      language === 'ru'
        ? `Посты со ссылкой на merkurov.love: ${bluesky.siteLinkedPosts.length}. Это факт ссылки, а не доказательство перехода или покупки.`
        : `Posts linking to merkurov.love: ${bluesky.siteLinkedPosts.length}. This proves the link, not a visit or purchase.`
    );
  }

  blocks.push(bluesky.limitations.map((line) => `- ${line}`).join('\n'));

  return blocks.join('\n\n');
}

function newsletterSection(dataset: AnalyticsDataset, language: AnalyticsLanguage): string {
  const newsletter = dataset.internal.newsletter;
  const blocks: string[] = [
    language === 'ru' ? '### Рассылки' : '### Newsletters',
  ];

  blocks.push(
    table(
      [
        language === 'ru' ? 'Показатель' : 'Metric',
        language === 'ru' ? 'Значение' : 'Value',
        language === 'ru' ? 'Источник' : 'Source',
      ],
      [
        [
          language === 'ru' ? 'Активные подписчики' : 'Active subscribers',
          formatNumber(newsletter.subscribers.active, language),
          'subscribers',
        ],
        [
          language === 'ru' ? 'Русская рассылка' : 'Russian newsletter',
          formatNumber(newsletter.subscribers.ru, language),
          'subscribers.locale=ru',
        ],
        [
          language === 'ru' ? 'Английская рассылка' : 'English newsletter',
          formatNumber(newsletter.subscribers.en, language),
          'subscribers.locale=en',
        ],
        [
          language === 'ru' ? 'Отписавшиеся' : 'Unsubscribed',
          formatNumber(newsletter.subscribers.unsubscribed, language),
          'subscribers',
        ],
        [
          language === 'ru' ? 'Писем отправлено за период' : 'Emails sent in period',
          formatNumber(newsletter.jobs.emailsSent, language),
          'newsletter_logs',
        ],
        [
          language === 'ru' ? 'Ошибок доставки' : 'Delivery failures',
          formatNumber(newsletter.jobs.emailsFailed, language),
          'newsletter_logs',
        ],
      ]
    )
  );

  if (newsletter.recentIssues.length > 0) {
    blocks.push(language === 'ru' ? '**Последние выпуски**' : '**Recent issues**');
    blocks.push(
      table(
        [
          language === 'ru' ? 'Выпуск' : 'Issue',
          language === 'ru' ? 'Язык' : 'Language',
          language === 'ru' ? 'Статус' : 'Status',
          language === 'ru' ? 'Отправлено' : 'Sent',
          language === 'ru' ? 'Ошибки' : 'Failed',
        ],
        newsletter.recentIssues.slice(0, 6).map((issue) => [
          issue.title,
          issue.language || '—',
          issue.status || '—',
          formatNumber(issue.sentCount, language),
          formatNumber(issue.failedCount, language),
        ])
      )
    );
  }

  if (newsletter.limitations.length > 0) {
    blocks.push(newsletter.limitations.map((line) => `- ${line}`).join('\n'));
  }

  blocks.push(
    language === 'ru'
      ? 'Русская и английская рассылки считаются раздельно. Это разные редакционные продукты, а не одна аудитория с переводом.'
      : 'Russian and English newsletters are counted separately. They are separate editorial products, not one audience with a translation.'
  );

  return blocks.join('\n\n');
}

function comparisonSection(dataset: AnalyticsDataset, language: AnalyticsLanguage): string {
  const blocks: string[] = ['### Что изменилось'];
  const metrics: MetricComparison[] = [
    dataset.ga4.totals.sessions,
    dataset.ga4.totals.activeUsers,
    dataset.ga4.totals.screenPageViews,
    dataset.gsc.totals.clicks,
    dataset.gsc.totals.impressions,
    dataset.gsc.totals.ctr,
    dataset.umami.totals.pageviews,
  ];

  const internalSubscriptions = dataset.internal.confirmedSubscriptions;
  const previousSubscriptions = dataset.internal.previousConfirmedSubscriptions;

  metrics.push({
    key: 'confirmed_subscriptions',
    label: language === 'ru' ? 'Подтверждённые подписки' : 'Confirmed subscriptions',
    value: internalSubscriptions,
    previous: previousSubscriptions,
    deltaPercent: deltaPercent(internalSubscriptions, previousSubscriptions),
    unit: 'count',
    source: 'internal',
    definition:
      language === 'ru'
        ? 'Строки pierrot_v_subscription_conversions за период.'
        : 'Rows in pierrot_v_subscription_conversions for the period.',
    precision:
      language === 'ru'
        ? 'Только подтверждённые подписки; начатые не входят. Источник перехода неизвестен.'
        : 'Confirmed subscriptions only; submitted ones are excluded. The referral source is unknown.',
    available: internalSubscriptions !== null,
  });

  metrics.push({
    key: 'internal_conversations',
    label: language === 'ru' ? 'Диалоги Pierrot (без владельца)' : 'Pierrot chats (excluding owner)',
    value: dataset.internal.conversations.total,
    previous: dataset.internal.conversations.previousTotal,
    deltaPercent: deltaPercent(
      dataset.internal.conversations.total,
      dataset.internal.conversations.previousTotal
    ),
    unit: 'count',
    source: 'internal',
    definition:
      language === 'ru'
        ? 'Внутренние диалоги Pierrot, исключая сессии владельца.'
        : 'Internal Pierrot conversations excluding owner sessions.',
    precision:
      language === 'ru'
        ? 'Это не посещаемость сайта и не сессии GA4.'
        : 'This is not website traffic and not GA4 sessions.',
    available: dataset.internal.conversations.total !== null,
  });

  const available = metrics.filter(
    (metric) => metric.available && metric.previous !== null && metric.deltaPercent !== null
  );

  if (available.length === 0) {
    const anyPrevious = metrics.some(
      (metric) => metric.previous !== null && metric.previous > 0
    );

    blocks.push(
      anyPrevious
        ? language === 'ru'
          ? 'Недостаточно сопоставимых данных для расчёта изменения. Отсутствие сравнения не равно отсутствию изменений.'
          : 'Not enough comparable data to calculate a change. Missing comparison does not mean no change.'
        : language === 'ru'
          ? 'За предыдущий аналогичный период нет сохранённых данных ни в одном подключённом источнике. Сравнение не рассчитывается; это не означает, что изменений не было.'
          : 'The previous equivalent period has no stored data in any connected source. No comparison is calculated; this does not mean nothing changed.'
    );
    return blocks.join('\n\n');
  }

  blocks.push(
    table(
      [
        language === 'ru' ? 'Показатель' : 'Metric',
        language === 'ru' ? 'Сейчас' : 'Now',
        language === 'ru' ? 'Было' : 'Before',
        language === 'ru' ? 'Изменение' : 'Change',
      ],
      metrics
        .filter((metric) => metric.available)
        .map((metric) => [
          metric.label,
          formatMetricValue(metric, language),
          metric.previous === null
            ? '—'
            : formatMetricValue({ ...metric, value: metric.previous }, language),
          formatDelta(metric, language),
        ])
    )
  );

  const channelChanges = dataset.ga4.channels
    .filter((row) => row.previous !== null && row.deltaPercent !== null)
    .sort((a, b) => Math.abs(b.deltaPercent ?? 0) - Math.abs(a.deltaPercent ?? 0))
    .slice(0, 4);

  if (channelChanges.length > 0) {
    blocks.push(
      language === 'ru'
        ? `**Крупнейшие сдвиги по каналам:** ${channelChanges
            .map(
              (row) =>
                `${row.label} ${row.deltaPercent === null ? '' : `${row.deltaPercent > 0 ? '+' : ''}${row.deltaPercent.toFixed(0)}%`}`
            )
            .join(' · ')}`
        : `**Largest channel shifts:** ${channelChanges
            .map(
              (row) =>
                `${row.label} ${row.deltaPercent === null ? '' : `${row.deltaPercent > 0 ? '+' : ''}${row.deltaPercent.toFixed(0)}%`}`
            )
            .join(' · ')}`
    );
  }

  return blocks.join('\n\n');
}

function interestingSection(
  dataset: AnalyticsDataset,
  language: AnalyticsLanguage,
  findings: Finding[]
): string {
  const blocks: string[] = ['### Что интересно'];

  if (dataset.ga4.available && dataset.umami.available) {
    const ga = dataset.ga4.totals.sessions.value;
    const um = dataset.umami.totals.visits.value;
    if (ga !== null && um !== null && ga > 0) {
      const diff = ((um - ga) / ga) * 100;
      if (Math.abs(diff) > 20) {
        blocks.push(
          language === 'ru'
            ? `GA4 и Umami расходятся на ${Math.abs(diff).toFixed(0)}% (сессии против визитов). Это может быть связано с блокировщиками, cookie/consent и разными определениями. Источники не взаимозаменяемы.`
            : `GA4 and Umami differ by ${Math.abs(diff).toFixed(0)}% (sessions vs visits). Blockers, cookie/consent and different definitions may explain it. The sources are not interchangeable.`
        );
      }
    }
  }

  if (dataset.gsc.lowCtrQueries.length > 0) {
    blocks.push(
      language === 'ru'
        ? `Запросы с высокими показами и низким CTR: ${dataset.gsc.lowCtrQueries
            .slice(0, 3)
            .map((row) => `«${row.query}» (${formatNumber(row.impressions, language)} показов, CTR ${formatPercent(row.ctr * 100, language)})`)
            .join(' · ')}. Это не доказательство плохого сниппета, а точка проверки.`
        : `High-impression, low-CTR queries: ${dataset.gsc.lowCtrQueries
            .slice(0, 3)
            .map((row) => `“${row.query}” (${formatNumber(row.impressions, language)} impressions, CTR ${formatPercent(row.ctr * 100, language)})`)
            .join(' · ')}. This is a review point, not proof of a bad snippet.`
    );
  }

  if (dataset.internal.conversations.total !== null && dataset.ga4.totals.sessions.value !== null && dataset.ga4.totals.sessions.value > 0) {
    const perThousand =
      (dataset.internal.conversations.total / dataset.ga4.totals.sessions.value) * 1000;
    blocks.push(
      language === 'ru'
        ? `На 1 000 сессий GA4 приходится ${perThousand.toFixed(1)} внутренних диалогов Pierrot (без владельца). Это не конверсия: диалог может быть вопросом, а не действием.`
        : `Per 1,000 GA4 sessions there are ${perThousand.toFixed(1)} internal Pierrot conversations (excluding owner). This is not a conversion: a chat may be a question, not an action.`
    );
  }

  const highFindings = findings.filter((finding) => finding.severity !== 'problem').slice(0, 2);
  if (highFindings.length > 0) {
    blocks.push(highFindings.map((finding) => findingBlock(finding, language)).join('\n\n'));
  }

  if (blocks.length === 1) {
    blocks.push(
      language === 'ru'
        ? 'Явных неожиданных закономерностей в доступных данных нет. Это не значит, что их нет в неподключённых источниках.'
        : 'No clear unexpected patterns in the available data. This does not mean there are none in unconnected sources.'
    );
  }

  return blocks.join('\n\n');
}

function problemsSection(
  dataset: AnalyticsDataset,
  language: AnalyticsLanguage,
  anomalies: Finding[],
  opportunities: Finding[]
): string {
  const blocks: string[] = ['### Проблемы и возможности'];
  const all = [...anomalies, ...opportunities].slice(0, 6);

  if (all.length === 0) {
    blocks.push(
      language === 'ru'
        ? 'По доступным данным нет проблем или возможностей, которые можно подтвердить. Это ограничение данных, а не вывод о благополучии сайта.'
        : 'The available data does not confirm any problems or opportunities. This is a data limitation, not a conclusion that the site is healthy.'
    );
    return blocks.join('\n\n');
  }

  blocks.push(all.map((finding) => findingBlock(finding, language)).join('\n\n'));

  return blocks.join('\n\n');
}

function sourcesSection(dataset: AnalyticsDataset, language: AnalyticsLanguage): string {
  const blocks: string[] = ['### Источники и ограничения'];
  blocks.push(sourceTable(dataset.sources, language));

  const limitations = [
    ...dataset.ga4.limitations,
    ...dataset.gsc.limitations,
    ...dataset.umami.limitations,
    ...dataset.internal.limitations,
  ];

  if (limitations.length > 0) {
    blocks.push(
      limitations
        .slice(0, 10)
        .map((line) => `- ${line}`)
        .join('\n')
    );
  }

  blocks.push(
    language === 'ru'
      ? `Данные сформированы ${new Date(dataset.generatedAt).toLocaleString('ru-RU', {
          timeZone: getAnalyticsTimezone(),
        })}. Период: ${dataset.period.label} (${dataset.period.timezone}). Сравнение: ${dataset.period.previousLabel}.`
      : `Generated ${new Date(dataset.generatedAt).toLocaleString('en-GB', {
          timeZone: getAnalyticsTimezone(),
        })}. Period: ${dataset.period.label} (${dataset.period.timezone}). Comparison: ${dataset.period.previousLabel}.`
  );

  blocks.push(
    language === 'ru'
      ? 'Настроить источники и запустить синхронизацию: [Pierrot → Analytics](/admin/pierrot/analytics).'
      : 'Configure sources and run a sync: [Pierrot → Analytics](/admin/pierrot/analytics).'
  );

  return blocks.join('\n\n');
}

function healthSection(dataset: AnalyticsDataset, language: AnalyticsLanguage): string {
  const blocks: string[] = ['### Состояние источников'];
  blocks.push(sourceTable(dataset.sources, language));

  blocks.push(
    language === 'ru'
      ? '**Vercel:** @vercel/analytics и @vercel/speed-insights присутствуют в production-бандле. Vercel API Web Analytics / Speed Insights на текущем тарифе недоступен; показатели не подменяются.'
      : '**Vercel:** @vercel/analytics and @vercel/speed-insights are present in the production bundle. The Vercel Web Analytics / Speed Insights API is unavailable on the current plan; metrics are not substituted.'
  );

  for (const source of dataset.sources) {
    if (source.status !== 'connected') {
      blocks.push(
        `**${source.label}:** ${
          source.actionRequired ||
          (language === 'ru' ? 'требует подключения.' : 'requires connection.')
        }`
      );
    }
    if (source.lastErrorCode) {
      blocks.push(
        `**${source.label} · ошибка:** ${source.lastErrorCode}${
          source.lastErrorMessage ? ` — ${source.lastErrorMessage}` : ''
        }`
      );
    }
  }

  return blocks.join('\n\n');
}

function trendWord(delta: number | null, language: AnalyticsLanguage): string {
  if (delta === null) return language === 'ru' ? 'нет сравнимых данных' : 'no comparable data';
  if (delta > 8) return language === 'ru' ? 'растёт' : 'growing';
  if (delta < -8) return language === 'ru' ? 'падает' : 'declining';
  return language === 'ru' ? 'стабильно' : 'stable';
}

function compactSourcesLine(dataset: AnalyticsDataset, language: AnalyticsLanguage): string {
  const parts = dataset.sources.map((source) => {
    const status =
      source.status === 'connected'
        ? source.lastSyncStatus === 'partial'
          ? language === 'ru'
            ? 'частично'
            : 'partial'
          : language === 'ru'
            ? 'подключён'
            : 'connected'
        : source.status === 'not_configured'
          ? language === 'ru'
            ? 'не настроен'
            : 'not configured'
          : source.status === 'disabled'
            ? language === 'ru'
              ? 'отключён'
              : 'disabled'
            : language === 'ru'
              ? 'недоступен'
              : 'unavailable';
    return `${source.label}: ${status}`;
  });

  return `**${language === 'ru' ? 'Источники' : 'Sources'}:** ${parts.join(' · ')}. ${language === 'ru' ? 'Данные сформированы' : 'Generated'} ${new Date(dataset.generatedAt).toLocaleString(language === 'ru' ? 'ru-RU' : 'en-GB', { timeZone: getAnalyticsTimezone() })}.`;
}

export function compactOverviewSection(
  dataset: AnalyticsDataset,
  language: AnalyticsLanguage,
  findings: Finding[]
): string {
  const sessions = dataset.ga4.totals.sessions;
  const publicSessions =
    dataset.ga4.traffic.publicLandingSessions > 0
      ? dataset.ga4.traffic.publicLandingSessions
      : sessions.value;
  const users = dataset.ga4.totals.activeUsers;
  const searchClicks = dataset.gsc.totals.clicks;
  const topChannel = dataset.ga4.channels[0];
  const topPage = dataset.ga4.pages[0];
  const subscriptions = dataset.internal.confirmedSubscriptions;
  const previousSubscriptions = dataset.internal.previousConfirmedSubscriptions;
  const subscriptionDelta = deltaPercent(subscriptions, previousSubscriptions);

  const lines: string[] = [
    `## PUBLIC PRESENCE — ${dataset.period.label.toUpperCase()}`,
    '',
    `- ${language === 'ru' ? 'Аудитория' : 'Audience'}: ${
      publicSessions === null
        ? language === 'ru'
          ? 'данных GA4 нет'
          : 'no GA4 data'
        : `${formatNumber(publicSessions, language)} ${language === 'ru' ? 'публичных landing-сессий' : 'public landing sessions'} · ${trendWord(
            sessions.deltaPercent,
            language
          )}`
    }${users.value !== null ? ` · ${formatNumber(users.value, language)} ${language === 'ru' ? 'активных пользователей' : 'active users'}` : ''}.`,
    `- ${language === 'ru' ? 'Обнаружение' : 'Discovery'}: ${
      topChannel
        ? `${topChannel.label} · ${formatNumber(topChannel.value, language)} ${language === 'ru' ? 'сессий' : 'sessions'}`
        : language === 'ru'
          ? 'нет данных по каналам'
          : 'no channel data'
    }${searchClicks.value !== null ? ` · Google: ${formatNumber(searchClicks.value, language)} ${language === 'ru' ? 'кликов' : 'clicks'}` : ''}.`,
    `- ${language === 'ru' ? 'Контент' : 'Content'}: ${
      topPage
        ? `${topPage.label} · ${formatNumber(topPage.value, language)} ${language === 'ru' ? 'просмотров' : 'views'}`
        : language === 'ru'
          ? 'нет данных по страницам'
          : 'no page data'
    }.`,
    `- ${language === 'ru' ? 'Распространение' : 'Distribution'}: ${
      dataset.bluesky.available
        ? `Bluesky ${formatNumber(dataset.bluesky.totals.followers.value, language)} ${language === 'ru' ? 'подписчиков' : 'followers'} · ${formatNumber(dataset.bluesky.totals.engagement.value, language)} ${language === 'ru' ? 'взаимодействий' : 'engagements'}`
        : language === 'ru'
          ? 'Bluesky нет данных'
          : 'no Bluesky data'
    } · ${language === 'ru' ? 'рассылки' : 'newsletters'} RU ${formatNumber(dataset.internal.newsletter.subscribers.ru, language)} / EN ${formatNumber(dataset.internal.newsletter.subscribers.en, language)}.`,
    `- ${language === 'ru' ? 'Вовлечение' : 'Engagement'}: ${
      dataset.ga4.totals.engagementRate.value === null
        ? language === 'ru'
          ? 'нет данных'
          : 'no data'
        : `${dataset.ga4.totals.engagementRate.value.toFixed(1)}% · ${trendWord(
            dataset.ga4.totals.engagementRate.deltaPercent,
            language
          )}`
    }.`,
    `- ${language === 'ru' ? 'Выручка / действия' : 'Revenue / actions'}: ${
      subscriptions === null
        ? language === 'ru'
          ? 'подтверждённых действий нет'
          : 'no confirmed actions'
        : `${formatNumber(subscriptions, language)} ${language === 'ru' ? 'подтверждённых подписок' : 'confirmed subscriptions'}${
            subscriptionDelta === null
              ? ''
              : ` · ${subscriptionDelta > 0 ? '+' : ''}${subscriptionDelta.toFixed(0)}%`
          }`
    }${dataset.internal.donations.count !== null ? ` · ${formatNumber(dataset.internal.donations.count, language)} ${language === 'ru' ? 'пожертвований' : 'donations'}` : ''}.`,
  ];

  const observations = findings.slice(0, 3);
  if (observations.length > 0) {
    lines.push('', language === 'ru' ? '**Что важно:**' : '**What matters:**');
    for (const finding of observations) {
      lines.push(`- **${finding.title}** ${finding.facts[0] || finding.interpretation[0] || ''}`.trim());
    }
  } else {
    lines.push(
      '',
      language === 'ru'
        ? 'Существенных отклонений по доступным данным нет; это ограничение периода, а не вывод о благополучии.'
        : 'No significant deviation in the available data; this is a period limitation, not a health verdict.'
    );
  }

  if (dataset.ga4.traffic.ownerAdminPageViews > 0) {
    lines.push(
      language === 'ru'
        ? `Внутренний трафик: ${formatNumber(dataset.ga4.traffic.ownerAdminPageViews, language)} просмотров /admin исключены из разбивки страниц.`
        : `Internal traffic: ${formatNumber(dataset.ga4.traffic.ownerAdminPageViews, language)} /admin views excluded from page breakdowns.`
    );
  }

  return lines.join('\n');
}

export function renderReport(
  dataset: AnalyticsDataset,
  question: WebsiteQuestion,
  language: AnalyticsLanguage,
  evidence: ReturnType<typeof buildEvidence>,
  anomalies: Finding[],
  opportunities: Finding[]
): string {
  const blocks: string[] = [];
  const scope = question.scope;

  // A URL question gets an exact-page answer, not the site-wide status block.
  if (scope === 'page') {
    blocks.push(
      `## ${
        language === 'ru' ? 'Метрики страницы' : 'Page metrics'
      }: ${question.pagePath || '—'}`
    );
    blocks.push(
      language === 'ru'
        ? `**Период:** ${dataset.period.label}. **Сравнение:** ${dataset.period.previousLabel}. **Часовой пояс:** ${dataset.period.timezone}.`
        : `**Period:** ${dataset.period.label}. **Comparison:** ${dataset.period.previousLabel}. **Timezone:** ${dataset.period.timezone}.`
    );
    blocks.push(pageDetailSection(dataset, language, question.pagePath));
    blocks.push(sourcesSection(dataset, language));
    return blocks.filter(Boolean).join('\n\n');
  }

  // Source-specific reports answer only that source. They must not repeat the
  // site-wide headline before the requested numbers.
  if (scope === 'bluesky' || scope === 'newsletter') {
    blocks.push(
      `## ${scope === 'bluesky' ? 'Bluesky' : language === 'ru' ? 'Рассылки' : 'Newsletters'}`
    );
    blocks.push(
      language === 'ru'
        ? `**Период:** ${dataset.period.label}. **Сравнение:** ${dataset.period.previousLabel}. **Часовой пояс:** ${dataset.period.timezone}.`
        : `**Period:** ${dataset.period.label}. **Comparison:** ${dataset.period.previousLabel}. **Timezone:** ${dataset.period.timezone}.`
    );
    blocks.push(scope === 'bluesky' ? blueskySection(dataset, language) : newsletterSection(dataset, language));
    blocks.push(sourcesSection(dataset, language));
    return blocks.filter(Boolean).join('\n\n');
  }

  blocks.push(
    `## ${language === 'ru' ? 'Состояние сайта' : 'Website state'}\n\n${reportHeadline(
      dataset,
      language
    )}`
  );

  if (scope === 'overview' && !question.wantsDetailed) {
    blocks.push(compactOverviewSection(dataset, language, [...anomalies, ...opportunities]));
    blocks.push(compactSourcesLine(dataset, language));
    return blocks.filter(Boolean).join('\n\n');
  }

  blocks.push(
    language === 'ru'
      ? `**Период:** ${dataset.period.label}. **Сравнение:** ${dataset.period.previousLabel}. **Часовой пояс:** ${dataset.period.timezone}.`
      : `**Period:** ${dataset.period.label}. **Comparison:** ${dataset.period.previousLabel}. **Timezone:** ${dataset.period.timezone}.`
  );

  if (scope === 'overview' || scope === 'traffic' || scope === 'compare') {
    blocks.push(audienceSection(dataset, language));
  }

  if (scope === 'overview' || scope === 'search' || scope === 'opportunities') {
    blocks.push(searchSection(dataset, language));
  }

  if (
    scope === 'overview' ||
    scope === 'pages' ||
    scope === 'search' ||
    scope === 'opportunities'
  ) {
    blocks.push(
      pagesSection(dataset, language, scope === 'overview' || scope === 'opportunities')
    );
  }

  if (scope === 'overview' || scope === 'projects') {
    blocks.push(projectsSection(dataset, language, question.project, scope === 'overview'));
  }

  if (scope === 'overview' || scope === 'compare') {
    blocks.push(comparisonSection(dataset, language));
  }

  if (scope === 'overview' || scope === 'funnel' || scope === 'pages') {
    blocks.push(funnelSection(dataset, language));
  }

  if (scope === 'overview' || scope === 'funnel' || scope === 'projects') {
    blocks.push(actionsSection(dataset, language));
  }

  if (scope === 'overview' || scope === 'compare' || scope === 'anomalies') {
    blocks.push(interestingSection(dataset, language, opportunities));
  }

  if (scope === 'overview' || scope === 'compare' || scope === 'anomalies' || scope === 'opportunities' || scope === 'pages') {
    blocks.push(problemsSection(dataset, language, anomalies, opportunities));
  }

  if (scope === 'health') {
    blocks.push(healthSection(dataset, language));
  }

  if (scope === 'evidence') {    blocks.push(
      [
        '### Проверяемые факты',
        evidence.verifiedFacts.map((fact) => `- ${fact}`).join('\n'),
        '### Интерпретация',
        evidence.interpretation.map((line) => `- ${line}`).join('\n'),
        '### Гипотезы',
        evidence.hypotheses.length > 0
          ? evidence.hypotheses.map((line) => `- ${line}`).join('\n')
          : '- Подтверждённых гипотез нет.',
        '### Ограничения',
        evidence.limitations.map((line) => `- ${line}`).join('\n'),
      ].join('\n\n')
    );
  }

  if (scope !== 'health') {
    blocks.push(sourcesSection(dataset, language));
  }

  return blocks.filter(Boolean).join('\n\n');
}

export async function buildWebsiteAnalyticsReport(input: {
  question: WebsiteQuestion;
  language: AnalyticsLanguage;
  store?: SupabaseClient;
  now?: Date;
}): Promise<AnalyticsReport> {
  const language = input.language;
  const timezone = getAnalyticsTimezone();
  const period = resolveWebsitePeriod({
    periodKey: input.question.periodKey,
    customPeriod: input.question.customPeriod,
    timezone,
    now: input.now,
    comparisonRequested: input.question.wantsComparison,
    language,
  });

  const store = input.store ?? getServerSupabaseClient({ useServiceRole: true });
  const dataset = await loadAnalyticsDataset({ period, store });
  const evidence = buildEvidence(dataset, language);
  const anomalies = detectAnomalies(dataset, language);
  const opportunities = findContentOpportunities(dataset, language);
  const markdown = renderReport(dataset, input.question, language, evidence, anomalies, opportunities);

  return {
    scope: input.question.scope,
    period,
    markdown,
    evidence,
    dataset,
  };
}

export function websiteQuestionFromScope(
  scope: WebsiteQuestion['scope'],
  options: {
    project?: string | null;
    pagePath?: string | null;
    comparison?: boolean;
    periodKey?: WebsiteQuestion['periodKey'];
  } = {}
): WebsiteQuestion {
  return {
    website: true,
    scope,
    wantsComparison: options.comparison ?? scope === 'compare',
    wantsProblems: scope === 'anomalies' || scope === 'opportunities',
    wantsRecommendations: scope === 'opportunities',
    project: options.project ?? null,
    pagePath: options.pagePath ?? null,
    periodKey: options.periodKey ?? 'last_7_days',
  };
}
