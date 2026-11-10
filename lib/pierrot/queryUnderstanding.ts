import { detectCommercialQuestion } from '@/lib/pierrot/commercialQuestion';
import { isMediaArchiveQuery } from '@/lib/pierrot/mediaIntent';
import {
  detectSourceCorrection,
  isCorrectionMessage,
  isRepeatRequest,
} from '@/lib/pierrot/correction';

/**
 * One deterministic, side-effect-free understanding layer for a Pierrot turn.
 *
 * This is deliberately not a second orchestration layer: it only turns the
 * current message (plus recent user turns for explicit corrections) into a
 * compact plan that the existing route can use to choose the tools it already
 * has. No model call and no database access happen here.
 */

export type PierrotQueryIntent =
  | 'document_lookup'
  | 'biography'
  | 'personal_analysis'
  | 'views_over_time'
  | 'media_mentions'
  | 'journal'
  | 'flow'
  | 'journal_flow'
  | 'web_research'
  | 'brain_web_research'
  | 'knowledge_graph'
  | 'analytics'
  | 'commercial'
  | 'project'
  | 'general';

export type PierrotQuerySourceName = 'brain' | 'media' | 'journal' | 'flow' | 'web';

export type PierrotQueryPeriod = {
  from: string;
  to: string;
  label: string;
};

export type PierrotQuerySources = {
  brain: boolean;
  media: boolean;
  journal: boolean;
  flow: boolean;
  web: boolean;
  graph: boolean;
  analytics: boolean;
  commercial: boolean;
  project: boolean;
};

export type PierrotQueryPlan = {
  originalQuery: string;
  normalizedQuery: string;
  language: 'ru' | 'en' | 'und';
  intent: PierrotQueryIntent;
  confidence: number;
  signals: string[];
  documentTitle: string | null;
  documentTitleKind: 'exact' | 'partial' | null;
  period: PierrotQueryPeriod | null;
  correction: boolean;
  followUp: boolean;
  /**
   * True when the owner asks to see the graph working (retrieval, traversal,
   * evidence and a representation), not only its entity/relationship counts.
   */
  graphDemo: boolean;
  /**
   * True when the current message explicitly chooses a new source/topic.
   * Such a turn must never inherit the previous tool or intent.
   */
  topicSwitch: boolean;
  /** A bounded number of records explicitly requested ("последние два выпуска"). */
  resultLimit: number | null;
  sources: PierrotQuerySources;
};

type HistoryItem = { role: 'user' | 'assistant'; content: string };

export type UnderstandPierrotQueryOptions = {
  history?: HistoryItem[];
  /** History inheritance is used only for explicit corrections and short follow-ups. */
  allowHistory?: boolean;
  depth?: number;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * URL paths are web-analytics subjects, not editorial source names.
 * "/flow" means the page whose traffic should be measured; it is not the
 * Flow stream, and "/journal" is not the Journal archive.
 */
function stripUrlPathTokens(value: string): string {
  return value
    .replace(/https?:\/\/[^\s]+/gi, ' ')
    .replace(/(^|\s)\/[a-z0-9][a-z0-9\-/]*/gi, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasTrafficContext(text: string): boolean {
  return /(посещаем|трафик|просмотр|посетител|визит|visitors?|traffic|pageviews?|page\s*views?|analytics|аналитик|статистик|метрик)/i.test(
    text
  );
}

function hasEditorialRecordContext(text: string): boolean {
  return /(выпуск|запис|пост|note|entries|entry|issues?|letters?)/i.test(text);
}

function hasTerm(text: string, term: string): boolean {
  const value = normalize(term);
  if (!value) return false;

  if (/^[a-zа-я0-9]+$/i.test(value) && value.length <= 5) {
    return new RegExp(`(^|[^a-zа-я0-9])${value}([^a-zа-я0-9]|$)`, 'i').test(text);
  }

  return text.includes(value);
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => hasTerm(text, term));
}

function detectLanguage(text: string): 'ru' | 'en' | 'und' {
  const cyrillic = (text.match(/[\u0400-\u04FF]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;

  if (cyrillic === 0 && latin === 0) return 'und';
  if (cyrillic > latin) return 'ru';
  if (latin > cyrillic) return 'en';
  return 'und';
}

function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function daysAgo(now: Date, days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function isoDateRange(from: Date, to: Date, label: string): PierrotQueryPeriod {
  return { from: from.toISOString(), to: to.toISOString(), label };
}

/**
 * Periods that change retrieval, not just wording. A period is deliberately
 * limited to questions where the user actually states a window; "latest"
 * alone stays a ranking hint rather than a hard date filter.
 */
export function detectPierrotQueryPeriod(
  message: string,
  now: Date = new Date()
): PierrotQueryPeriod | null {
  const text = normalize(message);

  if (hasAny(text, ['сегодня', 'today', 'за сегодня'])) {
    return isoDateRange(startOfUtcDay(now), now, 'today');
  }

  if (hasAny(text, ['вчера', 'yesterday', 'за вчера'])) {
    const today = startOfUtcDay(now);
    return isoDateRange(new Date(today.getTime() - 86400000), today, 'yesterday');
  }

  if (
    hasAny(text, [
      'на этой неделе',
      'эта неделя',
      'эту неделю',
      'за эту неделю',
      'за последнюю неделю',
      'последнюю неделю',
      'this week',
      'past week',
      'last 7 days',
      'последние 7 дней',
    ])
  ) {
    return isoDateRange(daysAgo(now, 7), now, 'last_7_days');
  }

  if (hasAny(text, ['прошлую неделю', 'за прошлую неделю', 'previous week', 'last week'])) {
    return isoDateRange(daysAgo(now, 14), daysAgo(now, 7), 'previous_7_days');
  }

  if (
    hasAny(text, [
      'за последний месяц',
      'последний месяц',
      'последние 30 дней',
      'за 30 дней',
      'last 30 days',
      'past month',
    ])
  ) {
    return isoDateRange(daysAgo(now, 30), now, 'last_30_days');
  }

  if (hasAny(text, ['этот месяц', 'текущий месяц', 'current month'])) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return isoDateRange(start, now, 'current_month');
  }

  if (hasAny(text, ['в прошлом месяце', 'прошлый месяц', 'previous month'])) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    return isoDateRange(start, end, 'previous_month');
  }

  if (hasAny(text, ['за последние два месяца', 'последние 2 месяца', 'last two months'])) {
    return isoDateRange(daysAgo(now, 62), now, 'last_two_months');
  }

  return null;
}

function cleanDocumentTitle(value: string): string | null {
  const cleaned = value
    .replace(/\s+/g, ' ')
    .replace(/^[\s«»"“”„'`]+|[\s«»"“”„'`]+$/g, '')
    .replace(/\s+(?:в|in)\s+(?:brain|базе|архиве|archive)\b.*$/i, '')
    .replace(/\s+(?:датирован|dated|за|from|for)\b.*$/i, '')
    .replace(/[.,;:!?]+$/g, '')
    .trim();

  if (cleaned.length < 3 || cleaned.length > 180) return null;
  if (!/[\p{L}\p{N}]/u.test(cleaned)) return null;
  if (
    /^(документ|document|файл|file|текст|text|brain|база|архив|archive|weekly|review)$/i.test(
      cleaned
    )
  ) {
    return null;
  }

  return cleaned;
}

/**
 * Interface labels are not document titles. This matters because the chat has
 * buttons and sections named Media, Journal, Flow and Brain; a quoted button
 * name must not turn into a Brain document lookup.
 */
const UI_LABEL =
  /^(media|медиа|journal|журнал|flow|поток|brain|мозг|graph|граф|analytics|аналитика|stats|статистика|projects?|проекты?|chat|чат|settings|настройки|menu|меню|home|главная|archive|архив|issues?|выпуски?)$/i;

function looksLikeUiLabel(title: string, raw: string): boolean {
  if (!UI_LABEL.test(title.trim())) return false;

  // Explicit document language overrides the UI-label heuristic:
  // «документ с названием "Media"» is still a document request.
  if (
    /(документ|document|файл|file)[^.!?\n]{0,48}(назван|называется|titled|named|called)/i.test(
      raw
    )
  ) {
    return false;
  }

  return true;
}

function isUiNavigationRequest(text: string): boolean {
  return /(нажми|нажать|открой|открыть|перейди|перейти|кликни|click|open|go\s+to|navigate)/i.test(
    text
  );
}

/**
 * Extracts a requested document title from quotes or from the established
 * "Weekly Review" / "document named ..." patterns. It never treats a generic
 * word such as "unframed" alone as a title: manuscript questions keep using
 * source-scoped retrieval.
 */
export function extractRequestedDocumentTitle(
  message: string
): { title: string; kind: 'exact' | 'partial' } | null {
  const raw = message.trim();
  const text = normalize(raw);

  const quoted: string[] = [];
  const quotedPattern = /[«"“„]([^»"”„]{3,180})[»"”„]/g;
  for (const match of raw.matchAll(quotedPattern)) {
    const title = cleanDocumentTitle(match[1]);
    if (title && !looksLikeUiLabel(title, raw)) quoted.push(title);
  }

  const hasDocumentCue =
    /(документ|document|файл|file|назван|title|называется|named|called|найди|find|show|покаж)/i.test(
      text
    ) || /\bbrain\b|базе|архив|archive/.test(text);

  if (quoted.length > 0 && hasDocumentCue && !isUiNavigationRequest(text)) {
    return { title: quoted[0], kind: 'exact' };
  }

  const named = raw.match(
    /(?:документ|document|файл|file)[^«"“„]{0,24}(?:с\s+)?(?:точным\s+)?(?:названием|название|title|называется|named|called)\s*[:\-—]?\s*([^,.!?\n]{3,180})/i
  );
  if (named) {
    const title = cleanDocumentTitle(named[1]);
    if (title) return { title, kind: 'partial' };
  }

  if (/(weekly\s*review|weekly\s*report)/i.test(raw)) {
    const weeklyCue =
      hasDocumentCue ||
      (/(weekly\s*review|weekly\s*report)/i.test(raw) &&
        /(найди|find|show|покаж|brain|баз|документ|document|weekly)/i.test(raw));

    // A commercial weekly report is handled by commercial intent before this
    // helper is consulted; here "weekly review" is a document title.
    if (weeklyCue) return { title: 'Weekly Review', kind: 'partial' };
  }

  return null;
}

/**
 * A document request that names the container rather than a title
 * ("я имел в виду документ в Brain"). It must switch a failed commercial or
 * media answer back to Brain without inventing a title.
 */
function isExplicitBrainDocumentRequest(text: string): boolean {
  if (/(?:сколько|число|количество|count|how\s+many|list|список|все\s+документ|all\s+documents)/i.test(text)) {
    return false;
  }

  return /(?:документ|document|файл|file)(?![а-яёa-z])[^.!?\n]{0,48}(?:в\s+brain|in\s+brain|в\s+базе|in\s+the\s+database|в\s+архиве|in\s+the\s+archive)/i.test(
    text
  );
}

const NUMBER_WORDS: Record<string, number> = {
  один: 1,
  одна: 1,
  одно: 1,
  два: 2,
  две: 2,
  три: 3,
  четыре: 4,
  пять: 5,
  шесть: 6,
  семь: 7,
  восемь: 8,
  девять: 9,
  десять: 10,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
};

/** "последние два выпуска", "last 3 issues", "две последние записи". */
export function detectRequestedResultLimit(message: string): number | null {
  const text = normalize(message);
  const numeric = text.match(
    /(?:последн|свеж|нов|last|latest|recent)[а-яёa-z]*\s+(\d{1,2})\b|(\d{1,2})\s+(?:последн|свеж|нов|last|latest|recent)/i
  );
  if (numeric) {
    const value = Number(numeric[1] || numeric[2]);
    return Number.isFinite(value) && value > 0 ? Math.min(20, Math.trunc(value)) : null;
  }

  const word = text.match(
    /(?:последн|свеж|нов|last|latest|recent)[а-яёa-z]*\s+(один|одна|одно|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|one|two|three|four|five|six|seven|eight|nine|ten)(?=\s|$)|(один|одна|одно|два|две|три|четыре|пять|шесть|семь|восемь|девять|десять|one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:последн|свеж|нов|last|latest|recent)/i
  );
  if (word) {
    const value = NUMBER_WORDS[word[1] || word[2]];
    return value ? Math.min(20, value) : null;
  }

  return null;
}

/**
 * "Покажи, как работает граф" is a request for a real graph retrieval, not
 * for the administrative counters. A bare "покажи граф знаний" may still be a
 * status/visualisation request, so the demo detector requires an explicit
 * how/traverse/relationships/provenance language.
 */
export function detectGraphDemoRequest(message: string): boolean {
  const text = normalize(message);

  if (!/(граф|graph|связ|relationship|entity|сущност)/i.test(text)) return false;

  return /(как\s+(?:работает|устроен|работают|строится)\s+(?:граф|граф\s+знаний|связ)|продемонстрир|покажи\s+(?:мне\s+)?(?:как\s+(?:работает|работают|строится)\s+(?:граф|связ)|связи|relations)|пройди\s+по\s+связ|multi[-\s]?hop|graph\s+(?:demo|traversal|visuali[sz]ation|search)|поиск\s+по\s+граф|graph\s+retrieval)/i.test(
    text
  );
}

export type PierrotSourceSwitch = 'media' | 'journal' | 'flow' | 'brain' | null;

/**
 * "Теперь только Media", "А теперь Journal", "переключись на Flow" are explicit
 * source switches. They must override the previous intent instead of being
 * interpreted as a vague follow-up.
 */
export function detectExplicitSourceSwitch(message: string): PierrotSourceSwitch {
  const text = normalize(message)
    .replace(/[.!?,;:]+$/g, '')
    .trim();

  if (!text) return null;

  const prefix =
    /^(?:а\s+)?(?:теперь|сейчас|давай|давайте|ладно|ок|ok|now|and\s+now)?\s*(?:только|лишь|only|just)?\s*(?:по\s+)?/i;
  const rest = text.replace(prefix, '').replace(/(?:пожалуйста|please)$/i, '').trim();

  if (/^(?:медиа|media|сми|пресс[аеуы]?|media\s*archive|медиа\s*архив)$/i.test(rest)) {
    return 'media';
  }
  if (/^(?:journal|журнал|выпуск[а-яё]*|issues?|letters?)$/i.test(rest)) {
    return 'journal';
  }
  if (/^(?:flow|поток|лента)$/i.test(rest)) return 'flow';
  if (/^(?:brain|мозг|rag|база\s+знаний|knowledge\s+base)$/i.test(rest)) return 'brain';

  return null;
}

/**
 * Journal and Flow are separate editorial sources with separate tables. They
 * stay distinguishable even when a question compares them.
 */
export function detectJournalFlowIntent(message: string): {
  intent: 'journal' | 'flow' | 'journal_flow' | null;
  signals: string[];
} {
  // Evaluate editorial words after removing explicit URL paths. Otherwise the
  // page "/flow" would be misrouted to the Flow stream instead of analytics.
  const text = normalize(stripUrlPathTokens(message));
  const signals: string[] = [];

  // GitHub issues are a development source, not the Journal.
  if (/(?:github\s+)?issues?\b/i.test(text) && !/(?:journal|журнал|выпуск)/i.test(text)) {
    return { intent: null, signals };
  }

  const journal =
    /(?:^|[^a-zа-яё])(?:journal|журнал[а-яё]*|выпуск[а-яё]*|issues?|letters?)(?=$|[^a-zа-яё])/i.test(
      text
    ) ||
    /(?:последн|свеж|нов)[а-яё]*\s+(?:два|две|три|\d+)?\s*(?:выпуск|номер)/i.test(text) ||
    /(?:последн|свеж|нов)[а-яё]*\s+(?:выпуск|номер)/i.test(text);

  const flow =
    /(?:^|[^a-zа-яё])(?:flow|поток[а-яё]*|лент[а-яё]*)(?=$|[^a-zа-яё])/i.test(text) ||
    /(?:записи|посты|заметки|публикации)[^.!?\n]{0,32}(?:flow|поток|лент)/i.test(text) ||
    /(?:flow|поток|лент)[^.!?\n]{0,32}(?:записи|посты|заметки|публикации)/i.test(text);

  // "Посещаемость Flow" / "трафик Flow" asks about the project page, not the
  // editorial stream. Journal keeps its own inventory questions ("статистика
  // Journal" means issue counts), so this guard is Flow-only.
  if (flow && !journal && hasTrafficContext(text) && !hasEditorialRecordContext(text)) {
    return { intent: null, signals: ['flow:traffic_not_editorial'] };
  }

  if (journal) signals.push('journal:request');
  if (flow) signals.push('flow:request');

  if (journal && flow) return { intent: 'journal_flow', signals };
  if (journal) return { intent: 'journal', signals };
  if (flow) return { intent: 'flow', signals };
  return { intent: null, signals };
}

/**
 * A follow-up changes or continues the *previous* request. A new question that
 * happens to start with "как", "что" or "почему" is not a follow-up: it must
 * be classified on its own merits.
 */
const FOLLOW_UP_PATTERN =
  /^(?:а\s+)?(?:теперь|за|есть|только)(?=\s|$)|^(?:а|и|но|and|but|so)?\s*(?:подробнее|дальше|продолжай|еще|ещё|more|continue|go on|what about|а что|и что|and now|and for)(?=\s|$)/i;

function isCorrection(text: string): boolean {
  return isCorrectionMessage(text);
}

function isFollowUp(text: string, message: string): boolean {
  const trimmed = message.trim();
  const continuation =
    /(это|этом|этого|его|ее|её|них|them|that|this|it|подробнее|дальше|продолжай|more|continue)/i.test(
      text
    );

  return (
    isRepeatRequest(message) ||
    FOLLOW_UP_PATTERN.test(text.trim()) ||
    (trimmed.length <= 40 && continuation)
  );
}

function previousUserTitle(history: HistoryItem[] | undefined): string | null {
  if (!history) return null;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item.role !== 'user' || !item.content.trim()) continue;

    const found = extractRequestedDocumentTitle(item.content);
    if (found) return found.title;
  }

  return null;
}

function sourcesForIntent(intent: PierrotQueryIntent): PierrotQuerySources {
  return {
    brain:
      intent === 'document_lookup' ||
      intent === 'biography' ||
      intent === 'personal_analysis' ||
      intent === 'views_over_time' ||
      intent === 'project' ||
      intent === 'brain_web_research',
    media: intent === 'media_mentions',
    journal: intent === 'journal' || intent === 'journal_flow',
    flow: intent === 'flow' || intent === 'journal_flow',
    web:
      intent === 'media_mentions' || intent === 'web_research' || intent === 'brain_web_research',
    graph: intent === 'knowledge_graph',
    analytics: intent === 'analytics',
    commercial: intent === 'commercial',
    project: intent === 'project',
  };
}

function classifyIntent(input: {
  message: string;
  text: string;
  documentTitle: string | null;
  period: PierrotQueryPeriod | null;
}): { intent: PierrotQueryIntent; signals: string[] } {
  const { message, text, documentTitle } = input;
  const signals: string[] = [];

  if (documentTitle) {
    signals.push('document:title');
    return { intent: 'document_lookup', signals };
  }

  if (isExplicitBrainDocumentRequest(text)) {
    signals.push('document:brain_request');
    return { intent: 'document_lookup', signals };
  }

  const sourceSwitch = detectExplicitSourceSwitch(message);
  if (sourceSwitch) {
    signals.push(`source_switch:${sourceSwitch}`);
    if (sourceSwitch === 'media') return { intent: 'media_mentions', signals };
    if (sourceSwitch === 'journal') return { intent: 'journal', signals };
    if (sourceSwitch === 'flow') return { intent: 'flow', signals };
    if (sourceSwitch === 'brain') return { intent: 'personal_analysis', signals };
  }

  // "Как дела с Journal?" is a project-status question, not a request for the
  // published issue archive. The project resolver supplies the actual state.
  if (
    /(?:как\s+дела|how\s+is|how\s+are|как\s+продвигается|как\s+ид[её]т)/i.test(text) &&
    /(?:journal|журнал|flow|поток)/i.test(text) &&
    !/(?:выпуск|issue|запис|публикац|archive|архив)/i.test(text)
  ) {
    signals.push('project:status');
    return { intent: 'project', signals };
  }

  const journalFlow = detectJournalFlowIntent(message);
  if (journalFlow.intent) {
    signals.push(...journalFlow.signals);
    return { intent: journalFlow.intent, signals };
  }

  if (detectGraphDemoRequest(message)) {
    signals.push('graph:demo_request');
    return { intent: 'knowledge_graph', signals };
  }

  if (
    /(knowledge\s*graph|граф\s*знаний|состояни[ея]\s+граф|graph\s+(status|state)|покажи\s+граф)/i.test(
      text
    )
  ) {
    signals.push('explicit:graph');
    return { intent: 'knowledge_graph', signals };
  }

  if (
    /(pierrot\s+analytics|аналитик[аи]\s+pierrot|observatory|обсерватор|аналитика\s+пьеро)/i.test(
      text
    )
  ) {
    signals.push('explicit:analytics');
    return { intent: 'analytics', signals };
  }

  // Website/traffic questions are analytics too. Classifying them here keeps
  // them from inheriting an unrelated previous intent on a phrase such as
  // "И что теперь с сайтом?".
  if (
    /(сайт|website|веб-?сайт|трафик|traffic|посещаем|посетител|visitor|pageviews?|page\s*views?|ga4|google\s*analytics|search\s*console|seo|органик|organic)/i.test(
      text
    ) &&
    /(статистик|statistics|метрик|metrics|аналитик|analytics|трафик|traffic|посещаем|посетител|visitor|pageviews?|конверси|conversion|seo|органик|organic|изменил|динамик|откуда|источник[а-яё]*\s+трафика|происходит|что\s+(?:у\s+нас\s+)?(?:с|теперь))/i.test(
      text
    )
  ) {
    signals.push('analytics:website');
    return { intent: 'analytics', signals };
  }

  // Analytics for a named public source is still analytics, not a general
  // site report and not a request for the source's editorial records.
  if (
    /(bluesky|bsky|блускай|блюскай|newsletter|рассылк[а-яё]*|public\s+presence|публичн[а-яё]*\s+присутств|digital\s+footprint|цифров[а-яё]*\s+след)/i.test(
      text
    ) &&
    /(статистик|statistics|метрик|metrics|аналитик|analytics|покажи|show|сколько|how\s+many|данные|data|аудитор|audience|подписчик|follower|охват|reach|взаимодейств|engagement|результат|performance)/i.test(
      text
    )
  ) {
    signals.push('analytics:source');
    return { intent: 'analytics', signals };
  }

  if (detectCommercialQuestion(message)) {
    signals.push('commercial:context');
    return { intent: 'commercial', signals };
  }

  // Authoritative Media source detection. This runs before the generic
  // manuscript/publication heuristics so «анализ медиа», «база медиа» and
  // «медиа за 2026» cannot fall through to Brain or general.
  if (
    isMediaArchiveQuery(message) ||
    /(сми|пресс[аеуы]?|media|press|цитир|цитат|упоминани|публикаци[яи]\s+обо\s+мне|публикаци[яи]\s+в\s+сми|quoted|interview|coverage)/i.test(
      text
    )
  ) {
    signals.push('media:request');
    return { intent: 'media_mentions', signals };
  }

  if (
    /(биограф|biography|обо\s+мне|about\s+me|моя\s+жизнь|my\s+background|кто\s+я\b|who\s+am\s+i|кто\s+такой\s+антон|who\s+is\s+anton|расскажи\s+про\s+меня|tell\s+me\s+about\s+myself)/i.test(
      text
    )
  ) {
    signals.push('personal:biography');
    return { intent: 'biography', signals };
  }

  if (
    /(как\s+(изменились|менялись)\s+мои\s+взгляды|как\s+менялись\s+мои\s+приоритеты|что\s+я\s+думал\s+раньше|что\s+я\s+сейчас\s+делаю\s+иначе|what\s+did\s+i\s+think|how\s+have\s+my\s+views\s+changed|what\s+changed\s+in\s+my\s+views|my\s+priorities\s+changed)/i.test(
      text
    )
  ) {
    signals.push('personal:views_over_time');
    return { intent: 'views_over_time', signals };
  }

  const personalMarker =
    /(мои\s+текст|моих\s+текст|моим\s+текст|моими\s+текст|мои\s+стать|мои\s+запис|моей\s+биографии|мои\s+проект|моя\s+работ|my\s+texts|my\s+writing|my\s+articles|my\s+work|my\s+brain|my\s+archive|мой\s+архив|моем\s+архиве|моём\s+архиве|в\s+brain|in\s+brain)/i.test(
      text
    );
  const externalMarker =
    /(что\s+известно|what\s+is\s+known|who\s+is|кто\s+такой|что\s+такое|what\s+is|what\s+are|интернет[а-я]*|on\s+the\s+web|web\s+search|online|\bweb\b|external|внешн|сравни\s+с|compare\s+with)/i.test(
      text
    );

  if (personalMarker && externalMarker) {
    signals.push('combined:brain_web');
    return { intent: 'brain_web_research', signals };
  }

  if (
    /(ios|iphone|ipad|expo|мобильн[а-яё]*\s+приложен|приложени[ея]|application|mobile\s+app|\bapp\b|телеграм[-\s]*бот|telegram\s+bot|github|проект[а-яё]*\s+(pierrot|пьеро)|pierrot\s+(app|mobile))/i.test(
      text
    )
  ) {
    signals.push('project:context');
    return { intent: 'project', signals };
  }

  if (
    /(найди|поищи|найти|искать|find|search|покажи|show)/i.test(text) &&
    /(brain|rag|стать|публикац|документ|запис|текст|article|document|recipe|рецепт)/i.test(text)
  ) {
    signals.push('search:request');
    return { intent: 'personal_analysis', signals };
  }

  const manuscriptMarker =
    /(unframed|manuscript|рукопис|мемуар|memoir|my\s+book|моя\s+книга|мои\s+книги|substack|новая\s+газета|новой\s+газет|новую\s+газет|novaya\s+gazeta|heart\s*&\s*angel|heartandangel|my\s+essays|мои\s+эссе)/i.test(
      text
    );
  const publicationMarker =
    /(what\s+have\s+i\s+(written|published)|what\s+did\s+i\s+(write|publish)|my\s+publications|мои\s+публикации|что\s+я\s+(писал|публиковал|публиковала)|мои\s+статьи|мои\s+тексты)/i.test(
      text
    );

  if (manuscriptMarker || publicationMarker) {
    signals.push(manuscriptMarker ? 'personal:manuscript' : 'personal:publications');
    return { intent: 'personal_analysis', signals };
  }

  if (
    /(как\s+у\s+меня\s+дела|как\s+мои\s+дела|что\s+у\s+меня\s+(происходит|нового)|как\s+прошла\s+неделя|моя\s+неделя|чем\s+я\s+сейчас\s+занят|what\s+am\s+i\s+working\s+on|how\s+am\s+i\s+doing|my\s+week|what\s+have\s+i\s+been\s+doing)/i.test(
      text
    )
  ) {
    signals.push('personal:current_state');
    return { intent: 'personal_analysis', signals };
  }

  if (
    /(последн|нов|все|мои|свеж)[а-яё]*\s+(текст|публикац|стат|материал|запис)/i.test(text) ||
    /(текст|публикац|стат|материал|запис)[а-яё]*.*(новая\s+газета|новой\s+газет|новую\s+газет|novaya|substack|sotheby|christie|архив|archive)/i.test(
      text
    ) ||
    /(все|последние|новые)\s+(материалы|записи|тексты)/i.test(text) ||
    /(что\s+нового\s+в\s+мо[её]м\s+архиве|what.s\s+new\s+in\s+my\s+archive)/i.test(text)
  ) {
    signals.push('personal:publications');
    return { intent: 'personal_analysis', signals };
  }

  if (
    /((?:найди|поищи|посмотри|проверь)(?:те)?\s+(?:в|во)\s+(?:интернете|сети|вебе)|что\s+(?:пишут|говорят|известно)\s+(?:в|во)\s+(?:интернете|сети|вебе)|search\s+(?:the\s+)?web|find\s+(?:it\s+)?online|look\s+(?:it\s+)?up|check\s+online|web\s+search|в\s+интернете|интернет[еа]?|online|поищи\s+в\s+сети|latest\s+news|новости|что\s+происходит|what\s+is\s+happening|current\s+events)/i.test(
      text
    )
  ) {
    signals.push('web:explicit');
    return { intent: 'web_research', signals };
  }

  if (
    /^(кто\s+(такой|такая|такие)|who\s+(is|was|are)|что\s+(такое|такая|такие)|what\s+(is|are|was|were)|расскажи\s+о|tell\s+me\s+about)\b/i.test(
      text
    )
  ) {
    signals.push('general:factual');
    return { intent: 'general', signals };
  }

  if (personalMarker) {
    signals.push('personal:context');
    return { intent: 'personal_analysis', signals };
  }

  return { intent: 'general', signals };
}

function mergeSources(
  base: PierrotQuerySources,
  extra: Partial<PierrotQuerySources>
): PierrotQuerySources {
  return {
    brain: base.brain || extra.brain === true,
    media: base.media || extra.media === true,
    journal: base.journal || extra.journal === true,
    flow: base.flow || extra.flow === true,
    web: base.web || extra.web === true,
    graph: base.graph || extra.graph === true,
    analytics: base.analytics || extra.analytics === true,
    commercial: base.commercial || extra.commercial === true,
    project: base.project || extra.project === true,
  };
}

/**
 * A correction often follows a chain of follow-ups. The original intent lives
 * further back than the immediate previous user turn, so walk back to the last
 * substantive request instead of stopping at "А подробнее?" or "Не то".
 */
export function previousSubstantiveUserMessage(
  history: HistoryItem[] | undefined
): HistoryItem | null {
  if (!history) return null;

  let fallback: HistoryItem | null = null;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item.role !== 'user' || !item.content.trim()) continue;

    if (!fallback) fallback = item;

    const normalized = normalize(item.content);
    if (isCorrection(normalized) || isFollowUp(normalized, item.content)) continue;

    return item;
  }

  return fallback;
}

/**
 * Main entry point. The function is deterministic and intentionally cheap.
 * History is inspected only to resolve an explicit correction or a short
 * follow-up, never to keep an old tool alive after a topic change.
 */
export function understandPierrotQuery(
  message: string,
  options: UnderstandPierrotQueryOptions = {}
): PierrotQueryPlan {
  const originalQuery = typeof message === 'string' ? message.trim() : '';
  const normalizedQuery = normalize(originalQuery);
  const language = detectLanguage(originalQuery);
  const depth = options.depth ?? 0;
  const period = detectPierrotQueryPeriod(originalQuery);
  const extracted = extractRequestedDocumentTitle(originalQuery);
  const correction = isCorrection(normalizedQuery);
  const followUp = isFollowUp(normalizedQuery, originalQuery);
  const graphDemo = detectGraphDemoRequest(originalQuery);
  const topicSwitch = detectExplicitSourceSwitch(originalQuery) !== null;
  const resultLimit = detectRequestedResultLimit(originalQuery);
  const signals: string[] = [];

  if (period) signals.push(`period:${period.label}`);
  if (correction) signals.push('correction');
  if (followUp) signals.push('follow_up');
  if (graphDemo) signals.push('graph:demo');
  if (topicSwitch) signals.push('topic_switch');
  if (resultLimit) signals.push(`limit:${resultLimit}`);

  let documentTitle = extracted?.title ?? null;
  let documentTitleKind = extracted?.kind ?? null;
  let intent: PierrotQueryIntent;
  let confidence = 0.55;

  if (documentTitle) {
    intent = 'document_lookup';
    confidence = extracted?.kind === 'exact' ? 0.95 : 0.9;
    signals.push('document:title');
  } else {
    const classified = classifyIntent({
      message: originalQuery,
      text: normalizedQuery,
      documentTitle,
      period,
    });
    intent = classified.intent;
    signals.push(...classified.signals);

    if (intent === 'document_lookup') confidence = 0.9;
    else if (intent === 'commercial') confidence = 0.9;
    else if (intent === 'knowledge_graph' || intent === 'analytics') confidence = 0.9;
    else if (intent === 'media_mentions') confidence = 0.85;
    else if (intent === 'journal' || intent === 'flow' || intent === 'journal_flow') confidence = 0.85;
    else if (intent === 'biography' || intent === 'views_over_time') confidence = 0.8;
    else if (intent === 'personal_analysis' || intent === 'project') confidence = 0.75;
    else if (intent === 'brain_web_research') confidence = 0.8;
    else if (intent === 'web_research') confidence = 0.7;
    else confidence = 0.45;
  }

  let sources = sourcesForIntent(intent);

  // An explicit source switch means exactly that source. It must not silently
  // bring the web or a previous source along ("Теперь только Media").
  if (topicSwitch && intent === 'media_mentions') {
    sources = { ...sources, web: false };
  }

  // Combined editorial questions must keep both sources instead of letting the
  // first classifier win: "Journal и Media", "сопоставь выпуски с прессой".
  if ((sources.journal || sources.flow) && isMediaArchiveQuery(originalQuery)) {
    sources = { ...sources, media: true };
  }

  if (
    (sources.journal || sources.flow) &&
    /(?:^|[^a-zа-яё])(?:brain|rag)(?=$|[^a-zа-яё])|баз[ае]\s+знаний|мои\s+(?:текст|запис)/i.test(
      normalizedQuery
    )
  ) {
    sources = { ...sources, brain: true };
  }

  // Explicit corrections and short follow-ups inherit the previous user
  // request only when the current message does not itself establish a new
  // intent. A classified request ("Как у меня дела?", "Покажи статистику
  // Journal") is a new request, not a continuation of whatever was discussed
  // before it.
  if (
    depth === 0 &&
    options.allowHistory !== false &&
    options.history &&
    options.history.length > 0 &&
    (correction || followUp) &&
    !topicSwitch &&
    !documentTitle &&
    intent === 'general'
  ) {
    const lastUser = previousSubstantiveUserMessage(options.history);

    if (lastUser) {
      const previous = understandPierrotQuery(lastUser.content, {
        allowHistory: false,
        depth: depth + 1,
      });

      // An explicit source correction ("по базе медиа, а не Brain") changes
      // only the source constraint. It must not inherit the previous Brain
      // intent, otherwise the correction is silently ignored.
      if (detectSourceCorrection(originalQuery) === 'media') {
        return {
          originalQuery,
          normalizedQuery,
          language,
          intent: 'media_mentions',
          confidence: 0.95,
          signals: Array.from(new Set([...signals, 'correction:source:media'])).slice(0, 12),
          documentTitle: null,
          documentTitleKind: null,
          period: period ?? previous.period,
          correction: true,
          followUp,
          graphDemo,
          topicSwitch,
          resultLimit,
          sources: sourcesForIntent('media_mentions'),
        };
      }

      if (previous.intent !== 'general' || previous.documentTitle) {
        const inheritedTitle = previous.documentTitle ?? previousUserTitle(options.history);

        if (inheritedTitle) {
          documentTitle = inheritedTitle;
          documentTitleKind = 'partial';
          intent = 'document_lookup';
          confidence = 0.88;
          signals.push('history:document_title');
        } else {
          intent = previous.intent;
          confidence = Math.max(0.6, previous.confidence - 0.05);
          signals.push(`history:intent:${previous.intent}`);
        }

        const merged = mergeSources(sourcesForIntent(intent), {
          ...sourcesForIntent(previous.intent),
          ...(correction && normalizedQuery.includes('brain') ? { brain: true } : {}),
        });

        return {
          originalQuery,
          normalizedQuery,
          language,
          intent,
          confidence,
          signals: Array.from(new Set([...signals, ...previous.signals.slice(0, 4)])).slice(0, 12),
          documentTitle,
          documentTitleKind,
          period: period ?? previous.period,
          correction,
          followUp,
          graphDemo: graphDemo || previous.graphDemo,
          topicSwitch,
          resultLimit: resultLimit ?? previous.resultLimit,
          sources: merged,
        };
      }
    }
  }

  if (intent === 'document_lookup' && !documentTitle) {
    const historyTitle = previousUserTitle(options.history);
    if (historyTitle) {
      documentTitle = historyTitle;
      documentTitleKind = 'partial';
      signals.push('history:document_title');
    }
  }

  if (intent === 'document_lookup' && !documentTitle) {
    // A document request without a usable title is still handled honestly by
    // the route, but should not be confused with a commercial question.
    signals.push('document:title_missing');
  }

  return {
    originalQuery,
    normalizedQuery,
    language,
    intent,
    confidence: Number(confidence.toFixed(2)),
    signals: Array.from(new Set(signals)).slice(0, 12),
    documentTitle,
    documentTitleKind,
    period,
    correction,
    followUp,
    graphDemo,
    topicSwitch,
    resultLimit,
    sources,
  };
}

/**
 * True when the plan expects an external-source answer. The route uses this to
 * decide whether a failed Web call must be disclosed instead of silently
 * ignored.
 */
export function planExpectsWeb(plan: PierrotQueryPlan): boolean {
  return plan.sources.web;
}

/**
 * True when a plan must not be intercepted by a deterministic owner status
 * tool before Brain retrieval.
 */
export function planNeedsBrainLookup(plan: PierrotQueryPlan): boolean {
  return plan.intent === 'document_lookup' || plan.sources.brain;
}
