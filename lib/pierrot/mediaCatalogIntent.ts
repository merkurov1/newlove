/**
 * Deterministic media-catalogue query understanding.
 *
 * This layer only classifies a request and extracts filters. It never queries
 * the database and never calls a model, so it is safe to unit-test.
 *
 * The central distinction is:
 *   * catalogue / count / mentions / diagnostics -> SQL data-access layer;
 *   * topic or confirmation by meaning -> semantic retrieval (a sample);
 *   * one named publication -> content retrieval by id/title.
 */

import type { MediaCatalogFilters, MediaScope } from '@/lib/knowledge/media/catalog';
import { isLatestMediaQuery } from '@/lib/pierrot/mediaIntent';

export type MediaQuestionKind =
  | 'count'
  | 'list'
  | 'mentions'
  | 'own_period'
  | 'title_search'
  | 'outlet_search'
  | 'topic_search'
  | 'compare'
  | 'confirmation'
  | 'diagnostics'
  | 'content'
  | 'analytics';

export type MediaCatalogPlan = {
  kind: MediaQuestionKind;
  scope: MediaScope;
  filters: MediaCatalogFilters;
  page: number;
  pageSize: number;
  titleQuery: string | null;
  semanticQuery: string | null;
  outlet: string | null;
  year: number | null;
  month: number | null;
  language: string | null;
  topic: string | null;
  signals: string[];
  confidence: number;
  originalQuery: string;
};

const KNOWN_OUTLETS: Array<{ canonical: string; aliases: string[] }> = [
  { canonical: 'Le Monde', aliases: ['le monde'] },
  { canonical: 'The Washington Post', aliases: ['the washington post', 'washington post'] },
  { canonical: 'The New York Times', aliases: ['the new york times', 'new york times', 'nytimes'] },
  { canonical: 'The Moscow Times', aliases: ['the moscow times', 'moscow times'] },
  { canonical: 'Новая газета', aliases: ['новая газета', 'новой газете', 'новую газету', 'новая газета'] },
  { canonical: 'Коммерсантъ', aliases: ['коммерсантъ', 'коммерсант'] },
  { canonical: 'Ведомости', aliases: ['ведомости'] },
  { canonical: 'Радио Свобода', aliases: ['радио свобода', 'radio free europe', 'rfe/rl'] },
  { canonical: 'Эхо Москвы', aliases: ['эхо москвы', 'echo of moscow'] },
  { canonical: 'BBC News Русская служба', aliases: ['bbc news русская служба', 'bbc news'] },
  { canonical: 'BBC News', aliases: ['bbc'] },
  { canonical: 'Deutsche Welle', aliases: ['deutsche welle', 'dw'] },
  { canonical: 'DIE ZEIT', aliases: ['die zeit', 'zeit'] },
  { canonical: 'Deutschlandfunk', aliases: ['deutschlandfunk'] },
  { canonical: 'Deutschlandfunk Kultur', aliases: ['deutschlandfunk kultur'] },
  { canonical: 'Le Temps', aliases: ['le temps'] },
  { canonical: 'El Grand Continent', aliases: ['el grand continent'] },
  { canonical: 'РБК', aliases: ['рбк', 'rbc'] },
  { canonical: 'Forbes.ru', aliases: ['forbes.ru', 'forbes'] },
  { canonical: 'The Art Newspaper Russia', aliases: ['the art newspaper russia'] },
  { canonical: 'The Art Newspaper', aliases: ['the art newspaper'] },
  { canonical: 'Euronews', aliases: ['euronews'] },
  { canonical: 'Coda Story', aliases: ['coda story'] },
  { canonical: 'Rzeczpospolita', aliases: ['rzeczpospolita'] },
  { canonical: 'Bankier.pl', aliases: ['bankier.pl', 'bankier'] },
  { canonical: 'OSCE', aliases: ['osce', 'обсе', 'osce'] },
  { canonical: 'The Christian Science Monitor', aliases: ['christian science monitor'] },
  { canonical: 'ABC News (Australia)', aliases: ['abc news'] },
  { canonical: 'Russia Beyond', aliases: ['russia beyond'] },
  { canonical: 'Russian Life', aliases: ['russian life'] },
  { canonical: 'Eurotopics', aliases: ['eurotopics'] },
  { canonical: 'Regional Post', aliases: ['regional post'] },
  { canonical: 'iHODL', aliases: ['ihodl'] },
  { canonical: 'Сноб', aliases: ['сноб', 'snob'] },
  { canonical: 'Караван Ярмарка', aliases: ['караван ярмарка'] },
  { canonical: 'Edizioni del Frisco', aliases: ['edizioni del frisco'] },
  { canonical: 'Настоящее Время', aliases: ['настоящее время', 'current time'] },
  { canonical: 'Republic', aliases: ['republic'] },
  { canonical: 'Meduza', aliases: ['meduza', 'медуза'] },
  { canonical: 'The Guardian', aliases: ['the guardian', 'guardian'] },
  { canonical: 'The Christian Science Monitor', aliases: ['csmonitor'] },
];

const EXPLICIT_MEDIA =
  /(медиа(?![а-яё])|media\s*archive|media\s*coverage|медиаархив|медиа-архив|сми(?![а-яё])|пресс[аеуы]?(?![а-яё])|press\s+coverage|coverage(?![a-z])|цитат|интервью|interview|публикаци[яи]\s+обо\s+мне|в\s+прессе|in\s+the\s+press|media\s+publications|press\s+publications)/i;

const PUBLICATION_WORD =
  /(публикац|колонк|стать[яи](?![а-яё])|материал|article|publication|column|coverage)/i;

const FIRST_PERSON =
  /(меня(?![а-яё])|мне(?![а-яё])|мои(?![а-яё])|моих(?![а-яё])|моим(?![а-яё])|я\s+(?:писал|писала|публиковал|публиковала)|my\s+(?:publications|columns|articles))/i;

const DIAGNOSTIC_WORD =
  /(не\s+проиндексирован|не\s+обработан|ошибк[аи]?\s*(?:обработ|извлеч|индекс|ingest|extraction)|metadata[\s_-]*only|paywall|пейвол|заблокирован|\bblocked\b|\bfailed\b|\bpartial\b|требует\s+проверк|ingestion|extraction|индексац|no\s+full\s+text|без\s+полного\s+текста|состояни[а-яё]*\s+(?:медиа|архив|индекс)|media\s+archive\s+(?:status|health|diagnostics))/i;

const DOCUMENT_WORD = /(документ|document|публикац|материал|article)/i;
const SEARCH_VERB =
  /(найди|поищи|покажи|выведи|список|find|search|show|list|which|какие|все)(?![а-яёa-z])/i;
const COUNT_WORD = /(сколько|число|количество|count|how\s+many|total)/i;
const MENTION_WORD =
  /(упомин|цитир|писали\s+обо\s+мне|писал[аи]?\s+обо\s+мне|mentions?|mentioned|quoted|coverage\s+about\s+me|публикаци[яи]\s+обо\s+мне)/i;
const MENTION_OF_ME =
  /(меня\s+(?:упомин|цитир)|обо\s+мне|about\s+me|mention(?:s|ed)?\s+me|quoted\s+me|coverage\s+about\s+me|публикаци[яи]\s+обо\s+мне|писали\s+обо\s+мне)/i;
const OWN_WORD =
  /(мои\s+(?:публикац|колонк|стать|текст)|что\s+я\s+(?:писал|писала|публиковал|публиковала)|my\s+(?:publications|columns|articles|texts)|what\s+did\s+i\s+(?:write|publish))/i;
const TOPIC_VERB = /(обсужда|говорится|говорится\s+о|пишут\s+о|писали\s+о|про|about|on\s+the\s+topic|regulation|регулирован|цензур|искусственн|крипт|(?<![a-z])AI(?![a-z])|(?<![а-яё])ИИ(?![а-яё]))/i;

const MONTHS: Array<{ month: number; pattern: RegExp }> = [
  { month: 1, pattern: /(январ|january)/i },
  { month: 2, pattern: /(феврал|february)/i },
  { month: 3, pattern: /(март|march)/i },
  { month: 4, pattern: /(апрел|april)/i },
  { month: 5, pattern: /(ма[йя](?![а-яё])|\bmay\b)/i },
  { month: 6, pattern: /(июн|june)/i },
  { month: 7, pattern: /(июл|july)/i },
  { month: 8, pattern: /(август|august)/i },
  { month: 9, pattern: /(сентябр|september)/i },
  { month: 10, pattern: /(октябр|october)/i },
  { month: 11, pattern: /(ноябр|november)/i },
  { month: 12, pattern: /(декабр|december)/i },
];

const TOPICS: Array<{ canonical: string; pattern: RegExp }> = [
  { canonical: 'Internet & Censorship', pattern: /(интернет|цензур|регулирован|блокиров|digital|censorship|internet)/i },
  { canonical: 'AI & Tech', pattern: /(\bИИ\b|\bAI\b|искусственн|нейросет|технолог|telegram|телеграм|data\s*центр|data\s*center)/i },
  { canonical: 'Art & Culture', pattern: /(искусств|культур|\bart\b|culture|выставк|аукцион|sotheby|christie)/i },
  { canonical: 'Fintech & Crypto', pattern: /(крипт|crypto|финтех|fintech|блокчейн|blockchain|bitcoin|биткоин)/i },
];

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractYear(text: string): number | null {
  const match = text.match(/\b(19\d{2}|20\d{2})\b/);
  if (!match) return null;
  const year = Number(match[1]);
  return year >= 1900 && year <= 2200 ? year : null;
}

function extractMonth(text: string): number | null {
  for (const entry of MONTHS) {
    if (entry.pattern.test(text)) return entry.month;
  }
  return null;
}

function extractOutlet(text: string): string | null {
  const normalized = normalize(text);
  let best: { canonical: string; length: number } | null = null;

  for (const outlet of KNOWN_OUTLETS) {
    for (const alias of outlet.aliases) {
      if (!normalized.includes(alias)) continue;
      if (!best || alias.length > best.length) {
        best = { canonical: outlet.canonical, length: alias.length };
      }
    }
  }

  return best?.canonical || null;
}

function extractQuotedTitle(text: string): string | null {
  const patterns = [/[«"“„]([^»"”„]{3,180})[»"”„]/g, /'([^']{3,180})'/g];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const title = match[1].replace(/\s+/g, ' ').trim();
      if (title.length >= 3) return title;
    }
  }

  return null;
}

function extractNamedTitle(text: string): string | null {
  const quoted = extractQuotedTitle(text);
  if (quoted) return quoted;

  const named = text.match(
    /(?:публикац|стать|материал|документ|article|publication|document)[а-яёa-z]*\s*(?:под\s+названием|с\s+названием|названн[а-яё]*|titled|called)\s*[:\-—]?\s*([^,.!?\n]{3,180})/i
  );
  if (named) return named[1].replace(/\s+/g, ' ').trim();

  return null;
}

function extractPage(text: string): number {
  const match = text.match(/(?:страниц[аеу]?|page)\s*(\d{1,5})/i);
  if (!match) return 1;
  const value = Number(match[1]);
  return Number.isFinite(value) && value >= 1 ? Math.min(10_000, Math.trunc(value)) : 1;
}

function extractLanguage(text: string, foreignRequested: boolean): string | null {
  if (foreignRequested) return null;
  if (/(на\s+английском|in\s+english|english-language)/i.test(text)) return 'EN';
  if (/(на\s+русском|in\s+russian|russian-language)/i.test(text)) return 'RU';
  if (/(на\s+немецком|in\s+german)/i.test(text)) return 'DE';
  if (/(на\s+французском|in\s+french)/i.test(text)) return 'FR';
  return null;
}

function stripSemanticBoilerplate(text: string): string {
  return text
    .replace(/^[,:;\-—\s]+/, '')
    .replace(
      /^(?:найди|поищи|покажи|выведи|find|search|show)\s+(?:мне\s+)?(?:все\s+|всех\s+)?(?:мои\s+|my\s+)?(?:публикации|публикация|статьи|статья|материалы|материал|articles?|publications?)?\s*/i,
      ''
    )
    .replace(/^[,:;\-—\s]+/, '')
    .replace(
      /^(?:в\s+которых|где|which|that)\s+(?:обсуждается|говорится|пишут|discuss|mention|talk\s+about)\s*/i,
      ''
    )
    .replace(/^[,:;\-—\s]+/, '')
    .trim();
}

function buildPlan(
  kind: MediaQuestionKind,
  input: {
    originalQuery: string;
    text: string;
    scope?: MediaScope;
    signals: string[];
    confidence: number;
    titleQuery?: string | null;
    semanticQuery?: string | null;
    outlet?: string | null;
    year?: number | null;
    month?: number | null;
    language?: string | null;
    topic?: string | null;
    foreign?: boolean;
  }
): MediaCatalogPlan {
  const year = input.year ?? null;
  const month = input.month ?? null;

  return {
    kind,
    scope: input.scope || 'all',
    filters: {
      scope: input.scope || 'all',
      year,
      month,
      from: null,
      to: null,
      outlet: input.outlet || null,
      language: input.language || null,
      topic: input.topic || null,
      kind: null,
      author: null,
      title: input.titleQuery || null,
      query: null,
      status: 'published',
      foreign: input.foreign === true,
    },
    page: extractPage(input.text),
    pageSize: 100,
    titleQuery: input.titleQuery || null,
    semanticQuery: input.semanticQuery || null,
    outlet: input.outlet || null,
    year,
    month,
    language: input.language || null,
    topic: input.topic || null,
    signals: input.signals,
    confidence: input.confidence,
    originalQuery: input.originalQuery,
  };
}

/**
 * Returns null when the request is not a Media Archive request. This is
 * intentionally conservative: ambiguous publication questions keep their
 * existing Brain routing.
 */
export function detectMediaCatalogQuestion(message: string): MediaCatalogPlan | null {
  const originalQuery = message.trim();
  const text = normalize(originalQuery);

  if (!text) return null;

  // "Latest coverage" is already a deliberate timeline retrieval branch. Keep
  // it on that path so the answer is ordered by date; it is a limited latest
  // window, not a catalogue replacement.
  if (isLatestMediaQuery(originalQuery) && /(упомин|цитир|mentions?|mentioned|quoted)/i.test(text)) {
    return null;
  }

  // Explicit Brain/RAG source names keep Brain routing. A user who wants the
  // media archive can say "Media Archive", "СМИ" or use /media.
  if (/\b(?:brain|rag)\b|баз[ае]\s+знаний|knowledge\s+base/i.test(text)) {
    const hasSeparateMediaSource = /(media\s*archive|медиаархив|медиа-архив)/i.test(text);
    if (!hasSeparateMediaSource) return null;
  }

  // Preserve the existing deliberate clarification for the bare ambiguous
  // count. Period/outlet/mention questions are answered exactly below.
  if (/^сколько\s+(?:у\s+меня\s+)?публикац(?:ий|ии)?\s*\?*$/.test(text)) {
    return null;
  }

  const explicitMedia = EXPLICIT_MEDIA.test(text);
  const publicationWord = PUBLICATION_WORD.test(text);
  const firstPerson = FIRST_PERSON.test(text);
  const year = extractYear(text);
  const month = extractMonth(text);
  const outlet = extractOutlet(text);
  const language = extractLanguage(text, false);
  const foreignRequested = /(зарубежн|иностранн|международн|foreign|international)/i.test(text);
  const page = extractPage(text);
  const signals: string[] = [];
  if (explicitMedia) signals.push('explicit:media');
  if (publicationWord) signals.push('word:publication');
  if (firstPerson) signals.push('scope:first_person');
  if (year) signals.push(`year:${year}`);
  if (month) signals.push(`month:${month}`);
  if (outlet) signals.push(`outlet:${outlet}`);
  if (foreignRequested) signals.push('scope:foreign');
  if (page > 1) signals.push(`page:${page}`);

  const datedOrNamedPublication =
    explicitMedia || Boolean(year) || Boolean(month) || Boolean(outlet);
  const publicationContext = explicitMedia || (publicationWord && datedOrNamedPublication);

  // ---------------------------------------------------------------------
  // Diagnostics
  // ---------------------------------------------------------------------
  if (
    DIAGNOSTIC_WORD.test(text) &&
    (publicationContext || explicitMedia || DOCUMENT_WORD.test(text))
  ) {
    return buildPlan('diagnostics', {
      originalQuery,
      text,
      scope: 'all',
      signals: [...signals, 'kind:diagnostics'],
      confidence: 0.92,
    });
  }

  // ---------------------------------------------------------------------
  // Named publication content
  // ---------------------------------------------------------------------
  const wantsContent =
    /(полный\s+текст|что\s+говорится\s+в|что\s+сказано\s+в|цитаты\s+из|открой|прочитай|покажи\s+текст|full\s+text)/i.test(
      text
    );
  const title = extractNamedTitle(originalQuery);

  if ((wantsContent || (explicitMedia && title)) && (title || publicationWord)) {
    return buildPlan('content', {
      originalQuery,
      text,
      scope: 'all',
      signals: [...signals, 'kind:content'],
      confidence: 0.9,
      titleQuery: title,
    });
  }

  // A request that names a publication by its quoted title is a catalogue
  // title lookup unless it explicitly asks for content.
  if (title && SEARCH_VERB.test(text) && (publicationWord || explicitMedia)) {
    return buildPlan('title_search', {
      originalQuery,
      text,
      scope: 'all',
      signals: [...signals, 'kind:title_search'],
      confidence: 0.9,
      titleQuery: title,
    });
  }

  // ---------------------------------------------------------------------
  // Compare / confirmation
  // ---------------------------------------------------------------------
  if (/(сравн|compare)/i.test(text) && publicationContext) {
    return buildPlan('compare', {
      originalQuery,
      text,
      scope: firstPerson || OWN_WORD.test(text) ? 'own' : 'all',
      signals: [...signals, 'kind:compare'],
      confidence: 0.9,
      outlet,
      year,
      month,
      language,
    });
  }

  if (/(подтвержд|confirmation|evidence\s+for|доказ)/i.test(text) && (publicationContext || explicitMedia)) {
    return buildPlan('confirmation', {
      originalQuery,
      text,
      scope: 'all',
      signals: [...signals, 'kind:confirmation'],
      confidence: 0.85,
      outlet,
      year,
      month,
      language,
      semanticQuery: stripSemanticBoilerplate(originalQuery),
    });
  }

  // ---------------------------------------------------------------------
  // Mentions (external coverage, separate from own columns)
  // ---------------------------------------------------------------------
  if (MENTION_OF_ME.test(text) || (MENTION_WORD.test(text) && explicitMedia && !/я\s+упоминал/i.test(text))) {
    const count = COUNT_WORD.test(text);
    return buildPlan(count ? 'count' : 'mentions', {
      originalQuery,
      text,
      scope: 'mentions',
      signals: [...signals, count ? 'kind:count_mentions' : 'kind:mentions'],
      confidence: 0.92,
      outlet,
      year,
      month,
      language: foreignRequested ? null : language,
      foreign: foreignRequested,
    });
  }

  // ---------------------------------------------------------------------
  // Own authored publications
  // ---------------------------------------------------------------------
  if (OWN_WORD.test(text) && datedOrNamedPublication) {
    const count = COUNT_WORD.test(text);
    return buildPlan(count ? 'count' : 'own_period', {
      originalQuery,
      text,
      scope: 'own',
      signals: [...signals, count ? 'kind:count_own' : 'kind:own_period'],
      confidence: 0.9,
      outlet,
      year,
      month,
      language,
    });
  }

  // ---------------------------------------------------------------------
  // Explicit outlet catalogue
  // ---------------------------------------------------------------------
  if (outlet && (publicationWord || explicitMedia || SEARCH_VERB.test(text))) {
    return buildPlan('outlet_search', {
      originalQuery,
      text,
      scope: 'all',
      signals: [...signals, 'kind:outlet_search'],
      confidence: 0.9,
      outlet,
      year,
      month,
      language,
    });
  }

  // ---------------------------------------------------------------------
  // Topic / semantic retrieval
  // ---------------------------------------------------------------------
  if (
    (publicationContext || (publicationWord && TOPIC_VERB.test(text))) &&
    (TOPIC_VERB.test(text) || /(о\s+чем|about|про\s+что)/i.test(text)) &&
    !COUNT_WORD.test(text) &&
    !(firstPerson && !explicitMedia && !year && !month && !outlet)
  ) {
    return buildPlan('topic_search', {
      originalQuery,
      text,
      scope: 'all',
      signals: [...signals, 'kind:topic_search'],
      confidence: 0.82,
      year,
      month,
      outlet,
      language,
      semanticQuery: stripSemanticBoilerplate(originalQuery) || originalQuery,
    });
  }

  // ---------------------------------------------------------------------
  // Count
  // ---------------------------------------------------------------------
  if (COUNT_WORD.test(text) && (publicationContext || explicitMedia)) {
    return buildPlan('count', {
      originalQuery,
      text,
      scope: firstPerson || OWN_WORD.test(text) ? 'own' : 'all',
      signals: [...signals, 'kind:count'],
      confidence: 0.9,
      outlet,
      year,
      month,
      language,
      foreign: foreignRequested,
    });
  }

  // ---------------------------------------------------------------------
  // Analytics / statistics
  // ---------------------------------------------------------------------
  if (
    /(статистик|statistics|динамик|распределен|analytics|аналитик[аи]\s+(?:медиа|архива)|archive\s+stats)/i.test(
      text
    ) &&
    (explicitMedia || /архив|archive/i.test(text))
  ) {
    return buildPlan('analytics', {
      originalQuery,
      text,
      scope: 'all',
      signals: [...signals, 'kind:analytics'],
      confidence: 0.88,
      year,
      month,
      outlet,
      language,
    });
  }

  // ---------------------------------------------------------------------
  // List / catalogue
  // ---------------------------------------------------------------------
  if (
    (SEARCH_VERB.test(text) || /(все|all)(?![а-яёa-z])/i.test(text)) &&
    (publicationContext ||
      /(media\s*archive|медиаархив|медиа-архив|медиа(?![а-яё])|archive(?![a-z])|архив(?![а-яё]))/i.test(text))
  ) {
    return buildPlan('list', {
      originalQuery,
      text,
      scope: firstPerson || OWN_WORD.test(text) ? 'own' : 'all',
      signals: [...signals, 'kind:list'],
      confidence: 0.85,
      outlet,
      year,
      month,
      language,
      foreign: foreignRequested,
    });
  }

  // "What did the press write about me?" without an explicit verb is still a
  // mention request.
  if (/(что\s+писали\s+обо\s+мне|what\s+did\s+the\s+press\s+write\s+about\s+me)/i.test(text)) {
    return buildPlan('mentions', {
      originalQuery,
      text,
      scope: 'mentions',
      signals: [...signals, 'kind:mentions'],
      confidence: 0.88,
      outlet,
      year,
      month,
      language,
    });
  }

  return null;
}

export function isMediaCatalogQuestion(message: string): boolean {
  return detectMediaCatalogQuestion(message) !== null;
}
