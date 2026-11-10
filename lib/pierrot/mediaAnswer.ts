import { assertServerOnly } from '@/lib/serverOnly';

assertServerOnly('lib/pierrot/mediaAnswer');

import {
  getMediaAnalytics,
  getMediaArchiveStats,
  getMediaDiagnostics,
  getMediaMentionsSummary,
  getMediaRecordDetail,
  listMediaCatalog,
  type MediaArchiveStats,
  type MediaCatalogFilters,
  type MediaCatalogRow,
  type MediaProvenance,
} from '@/lib/knowledge/media/catalog';
import { searchMediaIntelligence } from '@/lib/knowledge/media/search';
import {
  detectMediaCatalogQuestion,
  type MediaCatalogPlan,
} from '@/lib/pierrot/mediaCatalogIntent';

type Language = 'ru' | 'en';

export type MediaAnswerResult = {
  text: string;
  provenance: MediaProvenance | null;
  kind: string;
  structured: {
    kind: string;
    totalMatching: number | null;
    returned: number;
    complete: boolean;
    caveats: string[];
    recordIds: string[];
  };
};

export type MediaAnswerDependencies = {
  stats: typeof getMediaArchiveStats;
  list: typeof listMediaCatalog;
  mentions: typeof getMediaMentionsSummary;
  detail: typeof getMediaRecordDetail;
  diagnostics: typeof getMediaDiagnostics;
  analytics: typeof getMediaAnalytics;
  semantic: typeof searchMediaIntelligence;
};

const defaults: MediaAnswerDependencies = {
  stats: getMediaArchiveStats,
  list: listMediaCatalog,
  mentions: getMediaMentionsSummary,
  detail: getMediaRecordDetail,
  diagnostics: getMediaDiagnostics,
  analytics: getMediaAnalytics,
  semantic: searchMediaIntelligence,
};

const MONTH_NAMES_RU = [
  '',
  'январь',
  'февраль',
  'март',
  'апрель',
  'май',
  'июнь',
  'июль',
  'август',
  'сентябрь',
  'октябрь',
  'ноябрь',
  'декабрь',
];

function formatDate(value: string | null, language: Language): string {
  if (!value) return language === 'ru' ? 'дата неизвестна' : 'date unknown';
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime())) return value;

  return date.toLocaleDateString(language === 'ru' ? 'ru-RU' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function pluralRu(value: number, one: string, few: string, many: string): string {
  const mod10 = value % 10;
  const mod100 = value % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function countLabel(value: number, language: Language, own = false): string {
  if (language === 'en') return `${value} ${value === 1 ? 'publication' : 'publications'}`;

  if (own) return `${value} ${pluralRu(value, 'собственная публикация', 'собственные публикации', 'собственных публикаций')}`;

  return `${value} ${pluralRu(value, 'публикация', 'публикации', 'публикаций')}`;
}

function mentionLabel(value: number, language: Language): string {
  if (language === 'en') return `${value} ${value === 1 ? 'mention' : 'mentions'}`;
  return `${value} ${pluralRu(value, 'упоминание', 'упоминания', 'упоминаний')}`;
}

function scopeLabel(scope: string, language: Language): string {
  if (scope === 'own') return language === 'ru' ? 'собственные публикации' : 'own publications';
  if (scope === 'mentions') return language === 'ru' ? 'внешние упоминания' : 'external mentions';
  return language === 'ru' ? 'публикации' : 'publications';
}

function filterLabel(filters: MediaCatalogFilters, language: Language): string {
  const parts: string[] = [];

  if (filters.year) {
    parts.push(
      filters.month
        ? `${MONTH_NAMES_RU[filters.month] || filters.month} ${filters.year}`
        : String(filters.year)
    );
  }
  if (filters.outlet) parts.push(filters.outlet);
  if (filters.foreign) parts.push(language === 'ru' ? 'зарубежные СМИ' : 'foreign media');
  if (filters.language) parts.push(filters.language);
  if (filters.topic) parts.push(filters.topic);

  return parts.length > 0 ? parts.join(' · ') : language === 'ru' ? 'весь архив' : 'whole archive';
}

function qualityLabel(value: string | null, language: Language): string {
  const labels: Record<string, { ru: string; en: string }> = {
    full_text: { ru: 'полный текст', en: 'full text' },
    partial_text: { ru: 'частичный текст', en: 'partial text' },
    metadata_only: { ru: 'только метаданные', en: 'metadata only' },
    blocked: { ru: 'текст недоступен', en: 'text unavailable' },
  };

  if (!value) return language === 'ru' ? 'нет документа' : 'no document';
  return labels[value]?.[language] || value;
}

function internalHref(row: MediaCatalogRow): string {
  return row.slug
    ? `/media/record/${encodeURIComponent(row.slug)}`
    : `/media?q=${encodeURIComponent(row.title)}`;
}

function recordLine(
  row: MediaCatalogRow,
  index: number,
  language: Language,
  options: { showQuality?: boolean; showId?: boolean } = {}
): string {
  const bits = [
    `${index}. ${formatDate(row.publishedDate, language)} — «${row.title}»`,
    row.outlet,
    row.kind || 'unknown',
  ];

  if (options.showQuality) bits.push(qualityLabel(row.textQuality, language));
  if (options.showId) bits.push(`id: ${row.id}`);

  return `${bits.join(' · ')}\n   ${internalHref(row)}${
    row.canonicalUrl && row.canonicalUrl !== internalHref(row) ? `\n   ${row.canonicalUrl}` : ''
  }`;
}

function provenanceLine(provenance: MediaProvenance | null, language: Language): string {
  if (!provenance) return '';

  const complete = provenance.complete
    ? language === 'ru'
      ? 'полный результат'
      : 'complete result'
    : language === 'ru'
      ? 'ограниченная выборка'
      : 'limited sample';

  const details = [
    `source=${provenance.source}`,
    `mode=${provenance.mode}`,
    `total_matching=${provenance.totalMatching}`,
    `returned=${provenance.returned}`,
    `page=${provenance.page}`,
    `page_size=${provenance.pageSize}`,
    `complete=${provenance.complete}`,
    `status=${complete}`,
  ];

  if (provenance.caveats.length > 0) {
    details.push(
      `${language === 'ru' ? 'Ограничения' : 'Caveats'}: ${provenance.caveats.join(' ')}`
    );
  }

  return `${language === 'ru' ? 'Провенанс' : 'Provenance'}: ${details.join(' · ')}`;
}

function caveatForSemantic(result: {
  count: number;
  caveats?: string[];
  publications?: number;
}, language: Language): string {
  if (language === 'ru') {
    return [
      `Семантически найдено ${result.count} ${pluralRu(result.count, 'публикация', 'публикации', 'публикаций')}.`,
      'Это релевантная выборка по смыслу, а не полный каталог архива.',
      ...(result.caveats || []),
    ].join(' ');
  }

  return [
    `Semantic retrieval returned ${result.count} publication(s).`,
    'This is a relevance sample by meaning, not the complete archive catalogue.',
    ...(result.caveats || []),
  ].join(' ');
}

async function answerCount(
  plan: MediaCatalogPlan,
  language: Language,
  deps: MediaAnswerDependencies
): Promise<MediaAnswerResult> {
  const [filtered, archive] = await Promise.all([
    deps.stats(plan.filters),
    deps.stats({ status: 'all' }),
  ]);

  const scope = plan.scope;
  const own = filtered.own;
  const mentions = filtered.mentions;
  const scopedTotal = scope === 'own' ? own : scope === 'mentions' ? mentions : filtered.total;
  const filteredLabel = filterLabel(plan.filters, language);

  let headline: string;

  if (scope === 'mentions') {
    headline =
      language === 'ru'
        ? `Внешние упоминания (${filteredLabel}): ${mentionLabel(scopedTotal, language)}.`
        : `External mentions (${filteredLabel}): ${mentionLabel(filtered.total, language)}.`;
  } else if (scope === 'own') {
    headline =
      language === 'ru'
        ? `Ваши собственные публикации (${filteredLabel}): ${countLabel(own, language, true)}.`
        : `Your own publications (${filteredLabel}): ${countLabel(own, language, true)}.`;
  } else {
    headline =
      language === 'ru'
        ? `В Media Archive (${filteredLabel}): ${countLabel(filtered.total, language)}.`
        : `In the Media Archive (${filteredLabel}): ${countLabel(filtered.total, language)}.`;
  }

  const breakdown =
    language === 'ru'
      ? [
          `Собственные колонки/блог: ${own}.`,
          `Внешние упоминания и интервью: ${mentions}.`,
          `Опубликовано: ${filtered.published}; черновиков: ${filtered.draft}.`,
          `Всего в архиве без фильтров: ${archive.total} записей (${archive.own} собственных, ${archive.mentions} внешних).`,
        ]
      : [
          `Own columns/blog: ${own}.`,
          `External mentions/interviews: ${mentions}.`,
          `Published: ${filtered.published}; drafts: ${filtered.draft}.`,
          `Whole archive without filters: ${archive.total} records (${archive.own} own, ${archive.mentions} external).`,
        ];

  const provenance: MediaProvenance = {
    ...filtered.provenance,
    totalMatching: scopedTotal,
    returned: scopedTotal,
    page: 1,
    pageSize: scopedTotal || 1,
    hasMore: false,
    complete: true,
    caveats: [],
  };

  return {
    text: [headline, '', ...breakdown, '', provenanceLine(provenance, language)].join('\n'),
    provenance,
    kind: plan.kind,
    structured: {
      kind: plan.kind,
      totalMatching: scopedTotal,
      returned: scopedTotal,
      complete: true,
      caveats: [],
      recordIds: [],
    },
  };
}

async function answerList(
  plan: MediaCatalogPlan,
  language: Language,
  deps: MediaAnswerDependencies,
  mode: 'list' | 'title_search' | 'outlet_search' | 'own_period' = 'list'
): Promise<MediaAnswerResult> {
  const filters: MediaCatalogFilters = {
    ...plan.filters,
    title: plan.titleQuery || plan.filters.title || null,
  };
  const result = await deps.list({
    filters,
    page: plan.page,
    pageSize: plan.pageSize,
  });
  const label = scopeLabel(plan.scope, language);
  const filter = filterLabel(filters, language);

  if (result.total === 0) {
    const stats = await deps.stats(filters);
    const text = [
      language === 'ru'
        ? `По фильтру «${filter}» в Media Archive не найдено ни одной записи (точный SQL count: 0).`
        : `No Media Archive record matches “${filter}” (exact SQL count: 0).`,
      language === 'ru'
        ? `В архиве всего ${stats.total} записей по этому фильтру. Это не ошибка семантического поиска.`
        : `The archive has ${stats.total} records for this filter. This is not a semantic-search failure.`,
      '',
      provenanceLine(result.provenance, language),
    ].join('\n');

    return {
      text,
      provenance: result.provenance,
      kind: mode,
      structured: {
        kind: mode,
        totalMatching: 0,
        returned: 0,
        complete: true,
        caveats: [],
        recordIds: [],
      },
    };
  }

  const lines = result.items.map((row, index) =>
    recordLine(row, index + 1, language, { showQuality: true })
  );

  const header =
    language === 'ru'
      ? `${label[0].toUpperCase()}${label.slice(1)} (${filter}): ${result.total}.`
      : `${label[0].toUpperCase()}${label.slice(1)} (${filter}): ${result.total}.`;

  const pageNote = result.hasMore
    ? language === 'ru'
      ? `\nПоказаны ${result.items.length} из ${result.total} (страница ${result.page}, размер ${result.pageSize}). Это не полный список; запросите следующую страницу.`
      : `\nShowing ${result.items.length} of ${result.total} (page ${result.page}, size ${result.pageSize}). This is not the full list; request the next page.`
    : language === 'ru'
      ? `\nПоказаны все ${result.items.length} записей этого фильтра.`
      : `\nShowing all ${result.items.length} records for this filter.`;

  return {
    text: [header, '', lines.join('\n\n'), pageNote, '', provenanceLine(result.provenance, language)].join(
      '\n'
    ),
    provenance: result.provenance,
    kind: mode,
    structured: {
      kind: mode,
      totalMatching: result.total,
      returned: result.items.length,
      complete: !result.hasMore,
      caveats: result.provenance.caveats,
      recordIds: result.items.map((row) => row.id),
    },
  };
}

async function answerMentions(
  plan: MediaCatalogPlan,
  language: Language,
  deps: MediaAnswerDependencies
): Promise<MediaAnswerResult> {
  const result = await deps.mentions({
    filters: plan.filters,
    limit: Math.min(200, Math.max(plan.pageSize, 100)),
  });
  const filter = filterLabel(plan.filters, language);

  if (result.total === 0) {
    return {
      text: [
        language === 'ru'
          ? `Внешних упоминаний по фильтру «${filter}» не найдено (точный SQL count: 0).`
          : `No external mentions match “${filter}” (exact SQL count: 0).`,
        language === 'ru'
          ? 'Собственные колонки и блог в этот счётчик не входят.'
          : 'Own columns and blog posts are not included in this count.',
        '',
        provenanceLine(result.provenance, language),
      ].join('\n'),
      provenance: result.provenance,
      kind: 'mentions',
      structured: {
        kind: 'mentions',
        totalMatching: 0,
        returned: 0,
        complete: true,
        caveats: [],
        recordIds: [],
      },
    };
  }

  const outletLine = result.byOutlets
    .slice(0, 15)
    .map((row) => `${row.key}: ${row.count}`)
    .join(' · ');

  const lines = result.records
    .slice(0, 120)
    .map((row, index) => recordLine(row, index + 1, language, { showQuality: true }));

  const header =
    language === 'ru'
      ? `Внешние упоминания (${filter}): ${mentionLabel(result.total, language)}.`
      : `External mentions (${filter}): ${mentionLabel(result.total, language)}.`;

  const note =
    result.records.length < result.total
      ? language === 'ru'
        ? `Показаны первые ${result.records.length} из ${result.total}; это не полный список.`
        : `Showing the first ${result.records.length} of ${result.total}; this is not the full list.`
      : language === 'ru'
        ? `Показаны все ${result.records.length} упоминаний.`
        : `Showing all ${result.records.length} mentions.`;

  return {
    text: [
      header,
      language === 'ru' ? 'Собственные колонки/блог исключены.' : 'Own columns/blog excluded.',
      '',
      language === 'ru' ? `По изданиям: ${outletLine || '—'}` : `By outlet: ${outletLine || '—'}`,
      '',
      lines.join('\n\n'),
      '',
      note,
      '',
      provenanceLine(result.provenance, language),
    ].join('\n'),
    provenance: result.provenance,
    kind: 'mentions',
    structured: {
      kind: 'mentions',
      totalMatching: result.total,
      returned: result.records.length,
      complete: result.records.length >= result.total,
      caveats: result.provenance.caveats,
      recordIds: result.records.map((row) => row.id),
    },
  };
}

async function answerDiagnostics(
  plan: MediaCatalogPlan,
  language: Language,
  deps: MediaAnswerDependencies
): Promise<MediaAnswerResult> {
  const diagnostics = await deps.diagnostics({ limit: 300 });
  const s = diagnostics.summary;

  const classCounts = new Map<string, number>();
  for (const row of diagnostics.rows) {
    classCounts.set(row.failure.class, (classCounts.get(row.failure.class) || 0) + 1);
  }

  const classLines = [...classCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([key, count]) => `${key}: ${count}`);

  const rows = diagnostics.rows.slice(0, 80).map((row, index) => {
    const bits = [
      `${index + 1}. ${formatDate(row.publishedDate, language)} — «${row.title}»`,
      row.outlet,
      `${row.coverageStatus || 'no-document'} / ${row.textQuality || 'no-text'}`,
      row.errorCode || row.failure.class,
      row.failure.retryable ? (language === 'ru' ? 'retry возможен' : 'retryable') : language === 'ru' ? 'retry не показан' : 'not retryable',
      `id: ${row.id}`,
    ];
    return `${bits.join(' · ')}\n   ${row.failure.recommendedAction}`;
  });

  const header =
    language === 'ru'
      ? 'Состояние индексации и извлечения Media Archive'
      : 'Media Archive ingestion and extraction diagnostics';

  const summary =
    language === 'ru'
      ? [
          `Всего записей: ${s.total} (${s.own} собственных, ${s.mentions} внешних).`,
          `Связано с документом Brain: ${s.withDocument}; без документа: ${s.missingDocument}.`,
          `Без chunks: ${s.noChunks}.`,
          `failed: ${s.failed} · partial: ${s.partial} · blocked: ${s.blocked} · metadata_only: ${s.metadataOnly} · not_indexed: ${s.notIndexed}.`,
          `Дубликаты: canonical ${s.duplicateCanonical} · title+outlet+date ${s.duplicateTitle} · content_hash ${s.duplicateContentHash} · quotes ${s.duplicateQuotes}.`,
          `Согласованность: тема ${s.topicMismatch} · издание ${s.outletMismatch} · дата ${s.dateMismatch} · multi-current topic ${s.multiCurrentTopic} · multi-current role ${s.multiCurrentRole}.`,
          `Brain: ${s.brainLinkedDocuments} media-документов со связями; ${s.brainDocumentsWithoutMedia} документов Brain без Media.`,
          `Анализ: ${s.analysisFailed} failed runs.`,
        ]
      : [
          `Records: ${s.total} (${s.own} own, ${s.mentions} external).`,
          `Linked to a Brain document: ${s.withDocument}; no document: ${s.missingDocument}.`,
          `No chunks: ${s.noChunks}.`,
          `failed: ${s.failed} · partial: ${s.partial} · blocked: ${s.blocked} · metadata_only: ${s.metadataOnly} · not_indexed: ${s.notIndexed}.`,
          `Duplicates: canonical ${s.duplicateCanonical} · title+outlet+date ${s.duplicateTitle} · content_hash ${s.duplicateContentHash} · quotes ${s.duplicateQuotes}.`,
          `Consistency: topic ${s.topicMismatch} · outlet ${s.outletMismatch} · date ${s.dateMismatch} · multi-current topic ${s.multiCurrentTopic} · multi-current role ${s.multiCurrentRole}.`,
          `Brain: ${s.brainLinkedDocuments} media documents with relationships; ${s.brainDocumentsWithoutMedia} Brain documents without Media.`,
          `Analysis: ${s.analysisFailed} failed runs.`,
        ];

  const text = [
    header,
    '',
    ...summary,
    '',
    language === 'ru' ? 'Классы ошибок:' : 'Failure classes:',
    ...classLines,
    '',
    language === 'ru'
      ? 'Проблемные записи (до 80; полный набор доступен через /api/admin/media/intelligence/quality):'
      : 'Problem records (up to 80; full set is available via /api/admin/media/intelligence/quality):',
    rows.join('\n\n') || (language === 'ru' ? 'Проблемных записей нет.' : 'No problem records.'),
    '',
    language === 'ru'
      ? `Документы Brain без записи Media (${diagnostics.brainWithoutMedia.length}):`
      : `Brain documents without a Media record (${diagnostics.brainWithoutMedia.length}):`,
    ...diagnostics.brainWithoutMedia
      .slice(0, 40)
      .map(
        (row) =>
          `- ${row.title} · ${row.sourceType || 'unknown'} · ${row.ingestionStatus || '—'} — ${row.reason}`
      ),
    '',
    provenanceLine(
      {
        source: 'media_archive_records',
        mode: 'sql_aggregate',
        totalMatching: s.total,
        returned: diagnostics.rows.length,
        page: 1,
        pageSize: diagnostics.rows.length || 1,
        hasMore: diagnostics.rows.length < s.total,
        complete: false,
        filters: { status: 'all' },
        caveats: ['Показаны только проблемные записи; счётчики охватывают весь архив.'],
        generatedAt: new Date().toISOString(),
      },
      language
    ),
  ].join('\n');

  return {
    text,
    provenance: diagnostics.provenance,
    kind: plan.kind,
    structured: {
      kind: plan.kind,
      totalMatching: s.total,
      returned: diagnostics.rows.length,
      complete: false,
      caveats: ['Diagnostics list is filtered to problem records.'],
      recordIds: diagnostics.rows.map((row) => row.id),
    },
  };
}

async function answerContent(
  plan: MediaCatalogPlan,
  language: Language,
  deps: MediaAnswerDependencies
): Promise<MediaAnswerResult> {
  if (!plan.titleQuery) {
    const diagnostics = await deps.diagnostics({ limit: 20 });
    const rows = diagnostics.rows
      .filter(
        (row) =>
          row.textQuality === 'metadata_only' ||
          row.textQuality === 'blocked' ||
          row.coverageStatus === 'failed' ||
          row.coverageStatus === 'blocked'
      )
      .slice(0, 10)
      .map((row, index) => recordLine(row, index + 1, language, { showQuality: true }));

    return {
      text: [
        language === 'ru'
          ? 'Уточните название публикации — я не буду угадывать документ. Записи, у которых полный текст недоступен:'
          : 'Please give the publication title; I will not guess a document. Records without full text:',
        '',
        rows.join('\n\n') || (language === 'ru' ? 'Таких записей нет.' : 'No such records.'),
        '',
        language === 'ru'
          ? 'Укажите точное название в кавычках, например: «Что говорится в публикации «Название»?».'
          : 'Provide the exact title in quotes, e.g. “What does the publication ‘Title’ say?”.',
      ].join('\n'),
      provenance: diagnostics.provenance,
      kind: 'content',
      structured: {
        kind: 'content',
        totalMatching: null,
        returned: rows.length,
        complete: false,
        caveats: ['Title was not provided explicitly.'],
        recordIds: diagnostics.rows.map((row) => row.id),
      },
    };
  }

  const found = await deps.detail({ title: plan.titleQuery, maxTextChars: 20_000 });

  if (found.status === 'not_found') {
    return {
      text:
        language === 'ru'
          ? `Публикация с названием «${plan.titleQuery}» не найдена в Media Archive. Я не буду выдумывать запись.`
          : `No Media Archive publication titled “${plan.titleQuery}” was found. I will not invent a record.`,
      provenance: null,
      kind: 'content',
      structured: {
        kind: 'content',
        totalMatching: 0,
        returned: 0,
        complete: true,
        caveats: [],
        recordIds: [],
      },
    };
  }

  if (found.status === 'ambiguous') {
    const candidates = found.candidates
      .slice(0, 20)
      .map((row, index) => recordLine(row, index + 1, language, { showQuality: true }))
      .join('\n\n');

    return {
      text: [
        language === 'ru'
          ? `Найдено несколько публикаций по запросу «${plan.titleQuery}». Уточните точное название или ID:`
          : `Several publications match “${plan.titleQuery}”. Give the exact title or ID:`,
        '',
        candidates,
      ].join('\n'),
      provenance: null,
      kind: 'content',
      structured: {
        kind: 'content',
        totalMatching: found.total,
        returned: found.candidates.length,
        complete: false,
        caveats: ['Ambiguous title; no document was selected.'],
        recordIds: found.candidates.map((row) => row.id),
      },
    };
  }

  const detail = found.detail;
  const record = detail.record;
  const topicLine =
    detail.topics.length > 0
      ? detail.topics
          .map((topic) =>
            topic.subtopics.length > 0
              ? `${topic.primaryTopic} (${topic.subtopics.join(', ')})`
              : topic.primaryTopic
          )
          .join(' · ')
      : record.topic || '—';

  const quoteLines = detail.quotes.slice(0, 10).map((quote) => {
    const verification =
      quote.verificationStatus === 'verified'
        ? language === 'ru'
          ? 'проверено'
          : 'verified'
        : quote.verificationStatus;
    return `- [${quote.type} · ${verification} · ${quote.attribution}] «${quote.text}»${
      quote.translation ? `\n  Перевод: ${quote.translation}` : ''
    }`;
  });

  const brainLines = detail.brain.entities.slice(0, 10).map(
    (entity) =>
      `- ${entity.name} (${entity.type}) — ${entity.relationType}, confidence ${entity.confidence.toFixed(2)}${
        entity.verified ? ' · verified' : ''
      }`
  );

  const relationLines = detail.relations.slice(0, 10).map(
    (relation) =>
      `- ${relation.type}: ${relation.otherTitle} (${relation.otherOutlet}) · review=${relation.reviewStatus}`
  );

  const body: string[] = [
    language === 'ru'
      ? `Публикация: «${record.title}»`
      : `Publication: “${record.title}”`,
    `${record.outlet} · ${formatDate(record.publishedDate, language)} · ${record.kind || 'unknown'} · ${record.language || '—'}`,
    `${language === 'ru' ? 'Ссылка' : 'Link'}: ${record.canonicalUrl || internalHref(record)}`,
    `${language === 'ru' ? 'Внутренняя карточка' : 'Internal record'}: ${internalHref(record)}`,
    `${language === 'ru' ? 'Качество текста' : 'Text quality'}: ${qualityLabel(
      detail.text.quality,
      language
    )} · ${language === 'ru' ? 'фрагментов' : 'chunks'}: ${detail.text.chunks} · ${language === 'ru' ? 'символов' : 'characters'}: ${detail.text.length}`,
    `${language === 'ru' ? 'Индексация' : 'Indexing'}: ${record.indexingStatus || '—'} / ${
      detail.document?.coverageStatus || '—'
    }`,
    `${language === 'ru' ? 'Темы' : 'Topics'}: ${topicLine}`,
  ];

  if (detail.editorialRole) {
    body.push(
      `${language === 'ru' ? 'Редакционная роль' : 'Editorial role'}: ${detail.editorialRole.role} (${detail.editorialRole.confidence.toFixed(
        2
      )})`
    );
  }

  if (detail.metadata.summary) {
    body.push('', `${language === 'ru' ? 'Аннотация' : 'Summary'}: ${detail.metadata.summary}`);
  }

  if (!detail.text.available) {
    body.push(
      '',
      language === 'ru'
        ? `Полный текст недоступен: ${detail.text.reason || 'причина не указана'}.`
        : `Full text is unavailable: ${detail.text.reason || 'reason not recorded'}.`,
      language === 'ru'
        ? 'Я не буду выдавать метаданные или фрагмент за полный текст.'
        : 'I will not present metadata or an excerpt as the full text.'
    );
  } else {
    body.push(
      '',
      language === 'ru' ? 'Текст:' : 'Text:',
      detail.text.content,
      detail.text.truncated
        ? language === 'ru'
          ? `\n[Текст обрезан: показано ${detail.text.content.length} из ${detail.text.length} символов.]`
          : `\n[Text truncated: showing ${detail.text.content.length} of ${detail.text.length} characters.]`
        : ''
    );
  }

  if (quoteLines.length > 0) {
    body.push('', language === 'ru' ? 'Цитаты:' : 'Quotes:', ...quoteLines);
  }

  if (brainLines.length > 0) {
    body.push(
      '',
      language === 'ru' ? 'Связи Brain (provenance):' : 'Brain links (provenance):',
      ...brainLines,
      detail.brain.caveat
    );
  }

  if (relationLines.length > 0) {
    body.push('', language === 'ru' ? 'Связи с другими публикациями:' : 'Related publications:', ...relationLines);
  }

  body.push(
    '',
    provenanceLine(
      {
        source: 'media_archive_records',
        mode: 'sql_catalog',
        totalMatching: 1,
        returned: 1,
        page: 1,
        pageSize: 1,
        hasMore: false,
        complete: true,
        filters: { title: plan.titleQuery },
        caveats: detail.text.available
          ? detail.text.truncated
            ? ['Текст обрезан по лимиту ответа.']
            : []
          : ['Полный текст недоступен; показаны только метаданные/фрагменты.'],
        generatedAt: new Date().toISOString(),
      },
      language
    )
  );

  return {
    text: body.filter((line) => line !== '').join('\n').replace(/\n{3,}/g, '\n\n'),
    provenance: detail.provenance,
    kind: 'content',
    structured: {
      kind: 'content',
      totalMatching: 1,
      returned: 1,
      complete: true,
      caveats: detail.text.available ? [] : ['Full text unavailable.'],
      recordIds: [record.id],
    },
  };
}

async function answerTopicOrConfirmation(
  plan: MediaCatalogPlan,
  language: Language,
  deps: MediaAnswerDependencies
): Promise<MediaAnswerResult> {
  const query = plan.semanticQuery || plan.originalQuery;
  const [catalog, semantic, metadata] = await Promise.all([
    deps.stats(plan.filters),
    deps
      .semantic({
        query,
        filters: {
          from: plan.filters.from || null,
          to: plan.filters.to || null,
          topic: plan.filters.topic || null,
          language: plan.filters.language || null,
          outlet: plan.filters.outlet || null,
          status: 'published',
          kind: null,
          role: null,
          page: 1,
          pageSize: 50,
        },
        limit: 12,
        answerMode: 'none',
      })
      .catch(() => null),
    deps.list({
      filters: {
        query,
        year: plan.filters.year || null,
        month: plan.filters.month || null,
        outlet: plan.filters.outlet || null,
        language: plan.filters.language || null,
        status: 'published',
      },
      page: 1,
      pageSize: 10,
    }),
  ]);

  if (!semantic || semantic.results.length === 0) {
    const fallbackRows = metadata.items
      .map((row, index) => recordLine(row, index + 1, language, { showQuality: true }))
      .join('\n\n');

    return {
      text: [
        language === 'ru'
          ? `Семантический поиск не нашёл релевантных фрагментов по запросу «${query}».`
          : `Semantic retrieval found no relevant fragments for “${query}”.`,
        language === 'ru'
          ? `Это не означает, что публикаций нет. В каталоге по выбранным фильтрам ${countLabel(
              catalog.total,
              language
            )}.`
          : `This does not prove that no publications exist. The catalogue has ${countLabel(
              catalog.total,
              language
            )} for the selected filters.`,
        fallbackRows
          ? `\n${language === 'ru' ? 'Совпадения по названию/метаданным:' : 'Title/metadata matches:'}\n\n${fallbackRows}`
          : '',
        '',
        language === 'ru'
          ? 'Семантическая выборка не является полным каталогом. Для точного перечня используйте запрос «Покажи все публикации …».'
          : 'A semantic sample is not a complete catalogue. Use “Show all publications …” for an exact list.',
      ]
        .filter(Boolean)
        .join('\n'),
      provenance: semantic?.provenance
        ? {
            ...semantic.provenance,
            totalMatching: catalog.total,
            returned: semantic.results.length,
          }
        : metadata.provenance,
      kind: plan.kind,
      structured: {
        kind: plan.kind,
        totalMatching: catalog.total,
        returned: semantic?.results.length || 0,
        complete: false,
        caveats: ['Semantic sample; not a complete catalogue.'],
        recordIds: semantic?.results.map((hit) => hit.mediaRecordId) || [],
      },
    };
  }

  const rows = semantic.results.map((hit, index) => {
    const bits = [
      `${index + 1}. ${formatDate(hit.publishedDate, language)} — «${hit.title}»`,
      hit.outlet,
      `${qualityLabel(hit.textQuality, language)} · similarity ${hit.similarity.toFixed(3)}`,
    ];
    const quotes = hit.quotes
      .filter((quote) => quote.verificationStatus === 'verified')
      .slice(0, 2)
      .map((quote) => `   Цитата: «${quote.quoteText}»`);
    return `${bits.join(' · ')}${quotes.length > 0 ? `\n${quotes.join('\n')}` : ''}`;
  });

  const header =
    plan.kind === 'confirmation'
      ? language === 'ru'
        ? `Что подтверждают публикации по запросу «${query}»`
        : `What the publications say about “${query}”`
      : language === 'ru'
        ? `Публикации по теме «${query}»`
        : `Publications on “${query}”`;

  const text = [
    header,
    '',
    caveatForSemantic(
      {
        count: semantic.results.length,
        caveats: semantic.caveats,
      },
      language
    ),
    language === 'ru'
      ? `Для сравнения: по выбранным фильтрам в каталоге всего ${countLabel(
          catalog.total,
          language
        )}. Семантическая выдача не заменяет этот точный count.`
      : `For comparison: the catalogue has ${countLabel(
          catalog.total,
          language
        )} for these filters. The semantic result does not replace that exact count.`,
    '',
    rows.join('\n\n'),
    '',
    language === 'ru'
      ? 'Если нужен точный перечень, запросите «Покажи все публикации …» с нужным годом/изданием.'
      : 'For an exact list, ask “Show all publications …” with the year/outlet.',
    '',
    provenanceLine(
      semantic.provenance
        ? {
            ...semantic.provenance,
            totalMatching: catalog.total,
            returned: semantic.results.length,
          }
        : null,
      language
    ),
  ].join('\n');

  return {
    text,
    provenance: semantic.provenance
      ? {
          ...semantic.provenance,
          totalMatching: catalog.total,
          returned: semantic.results.length,
        }
      : null,
    kind: plan.kind,
    structured: {
      kind: plan.kind,
      totalMatching: catalog.total,
      returned: semantic.results.length,
      complete: false,
      caveats: ['Semantic sample; not a complete catalogue.'],
      recordIds: semantic.results.map((hit) => hit.mediaRecordId),
    },
  };
}

async function answerCompare(
  plan: MediaCatalogPlan,
  language: Language,
  deps: MediaAnswerDependencies
): Promise<MediaAnswerResult> {
  const list = await deps.list({
    filters: plan.filters,
    page: 1,
    pageSize: 20,
  });

  if (list.total < 2) {
    return {
      text:
        language === 'ru'
          ? `Для сравнения нужно минимум две публикации, а по фильтру «${filterLabel(
              plan.filters,
              language
            )}» найдено ${list.total}. Сравнение не построено.`
          : `Comparison needs at least two publications; the filter “${filterLabel(
              plan.filters,
              language
            )}” returned ${list.total}. No comparison was produced.`,
      provenance: list.provenance,
      kind: 'compare',
      structured: {
        kind: 'compare',
        totalMatching: list.total,
        returned: 0,
        complete: true,
        caveats: ['Not enough records to compare.'],
        recordIds: [],
      },
    };
  }

  const selected = list.items.slice(0, 6);
  const details = await Promise.all(
    selected.map((row) => deps.detail({ id: row.id, maxTextChars: 2_000 }))
  );

  const topicCounts = new Map<string, number>();
  for (const row of list.items) {
    const key = row.topic || 'unknown';
    topicCounts.set(key, (topicCounts.get(key) || 0) + 1);
  }

  const topicLine = [...topicCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([key, count]) => `${key}: ${count}`)
    .join(' · ');

  const blocks = details.map((entry, index) => {
    if (entry.status !== 'found') {
      return `${index + 1}. ${selected[index].title} — детали недоступны.`;
    }

    const detail = entry.detail;
    const excerpt =
      detail.text.content
        .replace(/\s+/g, ' ')
        .slice(0, 700)
        .trim() || detail.metadata.summary || '';

    return [
      `${index + 1}. «${selected[index].title}» · ${selected[index].outlet} · ${formatDate(
        selected[index].publishedDate,
        language
      )}`,
      `   ${language === 'ru' ? 'Тема' : 'Topic'}: ${
        detail.topics[0]?.primaryTopic || selected[index].topic || '—'
      } · ${language === 'ru' ? 'качество' : 'quality'}: ${qualityLabel(
        detail.text.quality,
        language
      )} · ${language === 'ru' ? 'цитат' : 'quotes'}: ${detail.quotes.length}`,
      excerpt ? `   ${excerpt}${detail.text.length > 700 ? '…' : ''}` : '',
    ]
      .filter(Boolean)
      .join('\n');
  });

  const text = [
    language === 'ru'
      ? `Сравнение публикаций (${filterLabel(plan.filters, language)}): ${list.total}.`
      : `Publication comparison (${filterLabel(plan.filters, language)}): ${list.total}.`,
    '',
    language === 'ru' ? `Распределение тем: ${topicLine}` : `Topic distribution: ${topicLine}`,
    '',
    blocks.join('\n\n'),
    '',
    list.total > selected.length
      ? language === 'ru'
        ? `Показаны ${selected.length} из ${list.total}; сравнение не охватывает весь список.`
        : `Showing ${selected.length} of ${list.total}; this comparison does not cover the full list.`
      : language === 'ru'
        ? `Сравнение охватывает все ${list.total} публикаций фильтра (текст ограничен 2000 символов на запись).`
        : `The comparison covers all ${list.total} publications in the filter (text capped at 2,000 characters each).`,
    language === 'ru'
      ? 'Сравнение основано на извлечённом тексте, темах и цитатах. Для metadata_only/blocked записей полный текст отсутствует — это указано выше.'
      : 'Comparison is based on extracted text, topics and quotes. metadata_only/blocked records have no full text; this is stated above.',
    '',
    provenanceLine(list.provenance, language),
  ].join('\n');

  return {
    text,
    provenance: list.provenance,
    kind: 'compare',
    structured: {
      kind: 'compare',
      totalMatching: list.total,
      returned: selected.length,
      complete: selected.length >= list.total,
      caveats: ['Text excerpts are capped at 2,000 characters.'],
      recordIds: selected.map((row) => row.id),
    },
  };
}

async function fetchCompleteCatalog(
  deps: MediaAnswerDependencies,
  filters: MediaCatalogFilters,
  pageSize = 200,
  maxRecords = 2000
): Promise<{ items: MediaCatalogRow[]; total: number; pages: number; complete: boolean }> {
  const items: MediaCatalogRow[] = [];
  let total = 0;
  let page = 1;
  let complete = true;

  while (items.length < maxRecords) {
    const batch = await deps.list({ filters, page, pageSize });
    total = batch.total;

    const known = new Set(items.map((item) => item.id));
    for (const item of batch.items) {
      if (!known.has(item.id)) items.push(item);
    }

    if (!batch.hasMore) break;
    page += 1;

    if (page > 50) {
      complete = false;
      break;
    }
  }

  if (items.length < total) complete = false;

  return { items, total, pages: page, complete };
}

async function answerAnalytics(
  plan: MediaCatalogPlan,
  language: Language,
  deps: MediaAnswerDependencies
): Promise<MediaAnswerResult> {
  const [analytics, catalog] = await Promise.all([
    deps.analytics(plan.filters),
    fetchCompleteCatalog(deps, plan.filters),
  ]);
  const stats: MediaArchiveStats = analytics.stats;

  const years = stats.byYear
    .slice(0, 12)
    .map((row) => `${row.key}: ${row.count}`)
    .join(' · ');
  const outlets = stats.byOutlet
    .slice(0, 15)
    .map((row) => `${row.key}: ${row.count}`)
    .join(' · ');
  const kinds = stats.byKind.map((row) => `${row.key}: ${row.count}`).join(' · ');
  const languages = stats.byLanguage.map((row) => `${row.key}: ${row.count}`).join(' · ');
  const topics = stats.byTopic.map((row) => `${row.key}: ${row.count}`).join(' · ');
  const months = analytics.months
    .slice(0, 12)
    .map((row) => `${row.key}: ${row.count}`)
    .join(' · ');
  const countries = analytics.countries
    .slice(0, 15)
    .map((row) => `${row.key}: ${row.count}`)
    .join(' · ');
  const catalogKindCounts = new Map<string, number>();
  const catalogOutletCounts = new Map<string, number>();
  for (const item of catalog.items) {
    const kind = item.kind || 'unknown';
    const outlet = item.outlet || 'unknown';
    catalogKindCounts.set(kind, (catalogKindCounts.get(kind) || 0) + 1);
    catalogOutletCounts.set(outlet, (catalogOutletCounts.get(outlet) || 0) + 1);
  }
  const fullCatalogKinds = [...catalogKindCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([key, count]) => `${key}: ${count}`)
    .join(' · ');
  const fullCatalogOutlets = [...catalogOutletCounts.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 15)
    .map(([key, count]) => `${key}: ${count}`)
    .join(' · ');
  const latestRecords = catalog.items
    .slice()
    .sort((left, right) => (right.publishedDate || '').localeCompare(left.publishedDate || ''))
    .slice(0, 8)
    .map(
      (item, index) =>
        `${index + 1}. ${item.publishedDate || '—'} — «${item.title}» · ${item.outlet} · ${item.kind || '—'}`
    )
    .join('\n');

  const text = [
    language === 'ru'
      ? `Статистика Media Archive (${filterLabel(plan.filters, language)})`
      : `Media Archive statistics (${filterLabel(plan.filters, language)})`,
    '',
    ...(language === 'ru'
      ? [
          `Всего: ${stats.total} · опубликовано: ${stats.published} · черновиков: ${stats.draft}.`,
          `Собственные публикации: ${stats.own} · внешние упоминания: ${stats.mentions}.`,
          `Изданий: ${stats.outlets} · языков: ${stats.byLanguage.length} · период: ${stats.range.from || '—'} — ${stats.range.to || '—'}.`,
          `Полный текст: ${stats.coverage.fullText} · частичный: ${stats.coverage.partialText} · metadata_only: ${stats.coverage.metadataOnly} · blocked: ${stats.coverage.blocked} · без документа: ${stats.coverage.missingDocument}.`,
          `Индексация: completed ${stats.indexing.completed} · failed ${stats.indexing.failed} · partial ${stats.indexing.partial} · blocked ${stats.indexing.blocked} · not_indexed ${stats.indexing.notIndexed}.`,
          `Анализ: ${stats.analysis.runsCompleted} runs completed · ${stats.analysis.runsFailed} failed · ${stats.analysis.currentQuotes} current quotes · ${stats.analysis.topics} topics · ${stats.analysis.entities} entities · ${stats.analysis.relations} relations.`,
          `Brain: ${analytics.brain.documentsWithRelationships} media-документов со связями из ${analytics.brain.mediaDocuments}.`,
          `Полнота каталога: ${catalog.items.length} из ${catalog.total} записей · страниц: ${catalog.pages} · complete=${catalog.complete}.`,
          `Семантический поиск при этом не использовался: это SQL-анализ каталога.`,
        ]
      : [
          `Total: ${stats.total} · published: ${stats.published} · drafts: ${stats.draft}.`,
          `Own publications: ${stats.own} · external mentions: ${stats.mentions}.`,
          `Outlets: ${stats.outlets} · languages: ${stats.byLanguage.length} · range: ${stats.range.from || '—'} — ${stats.range.to || '—'}.`,
          `Full text: ${stats.coverage.fullText} · partial: ${stats.coverage.partialText} · metadata_only: ${stats.coverage.metadataOnly} · blocked: ${stats.coverage.blocked} · no document: ${stats.coverage.missingDocument}.`,
          `Indexing: completed ${stats.indexing.completed} · failed ${stats.indexing.failed} · partial ${stats.indexing.partial} · blocked ${stats.indexing.blocked} · not_indexed ${stats.indexing.notIndexed}.`,
          `Analysis: ${stats.analysis.runsCompleted} completed runs · ${stats.analysis.runsFailed} failed · ${stats.analysis.currentQuotes} current quotes · ${stats.analysis.topics} topics · ${stats.analysis.entities} entities · ${stats.analysis.relations} relations.`,
          `Brain: ${analytics.brain.documentsWithRelationships} media documents with relationships out of ${analytics.brain.mediaDocuments}.`,
          `Catalogue completeness: ${catalog.items.length} of ${catalog.total} records · pages: ${catalog.pages} · complete=${catalog.complete}.`,
          `Semantic search was not used: this is a SQL catalogue analysis.`,
        ]),
    '',
    `${language === 'ru' ? 'По годам' : 'By year'}: ${years || '—'}`,
    `${language === 'ru' ? 'По изданиям (полный каталог)' : 'By outlet (complete catalogue)'}: ${fullCatalogOutlets || outlets || '—'}`,
    `${language === 'ru' ? 'По типам (полный каталог)' : 'By kind (complete catalogue)'}: ${fullCatalogKinds || kinds || '—'}`,
    `${language === 'ru' ? 'По языкам' : 'By language'}: ${languages || '—'}`,
    `${language === 'ru' ? 'По темам' : 'By topic'}: ${topics || '—'}`,
    `${language === 'ru' ? 'Последние месяцы' : 'Recent months'}: ${months || '—'}`,
    `${language === 'ru' ? 'Страны (inferred)' : 'Countries (inferred)'}: ${countries || '—'}`,
    '',
    language === 'ru' ? 'Последние записи каталога:' : 'Latest catalogue records:',
    latestRecords || (language === 'ru' ? '—' : '—'),
    '',
    provenanceLine(stats.provenance, language),
  ].join('\n');

  return {
    text,
    provenance: stats.provenance,
    kind: plan.kind,
    structured: {
      kind: plan.kind,
      totalMatching: stats.total,
      returned: stats.total,
      complete: true,
      caveats: ['Country is inferred from explicit metadata/outlet/TLD, not from language.'],
      recordIds: [],
    },
  };
}

export async function answerMediaArchiveQuestion(
  message: string,
  language: Language = 'ru',
  deps: MediaAnswerDependencies = defaults
): Promise<MediaAnswerResult | null> {
  const plan = detectMediaCatalogQuestion(message);

  if (!plan) return null;

  switch (plan.kind) {
    case 'count':
      return answerCount(plan, language, deps);
    case 'mentions':
      return answerMentions(plan, language, deps);
    case 'own_period':
      return answerList(plan, language, deps, 'own_period');
    case 'title_search':
      return answerList(plan, language, deps, 'title_search');
    case 'outlet_search':
      return answerList(plan, language, deps, 'outlet_search');
    case 'list':
      return answerList(plan, language, deps, 'list');
    case 'compare':
      return answerCompare(plan, language, deps);
    case 'confirmation':
    case 'topic_search':
      return answerTopicOrConfirmation(plan, language, deps);
    case 'diagnostics':
      return answerDiagnostics(plan, language, deps);
    case 'content':
      return answerContent(plan, language, deps);
    case 'analytics':
    case 'analysis':
      return answerAnalytics(plan, language, deps);
    default:
      return null;
  }
}
