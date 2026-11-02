import { detectCommercialQuestion } from '@/lib/pierrot/commercialQuestion';

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
  | 'web_research'
  | 'brain_web_research'
  | 'knowledge_graph'
  | 'analytics'
  | 'commercial'
  | 'project'
  | 'general';

export type PierrotQueryPeriod = {
  from: string;
  to: string;
  label: string;
};

export type PierrotQuerySources = {
  brain: boolean;
  media: boolean;
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
    if (title) quoted.push(title);
  }

  const hasDocumentCue =
    /(документ|document|файл|file|назван|title|называется|named|called|найди|find|show|покаж)/i.test(
      text
    ) || /\bbrain\b|базе|архив|archive/.test(text);

  if (quoted.length > 0 && hasDocumentCue) {
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

const CORRECTION_TERMS = [
  'не то',
  'не так',
  'стоп',
  'я имею в виду',
  'я имел в виду',
  'i mean',
  'i meant',
  'not that',
  'в brain',
  'в базе',
  'в архиве',
  'in brain',
  'in the archive',
];

const FOLLOW_UP_PATTERN =
  /^(а|и|но|and|but|so)?\s*(подробнее|дальше|продолжай|еще|ещё|more|continue|go on|почему|why|как|how|what about|а что|и что)\b/i;

function isCorrection(text: string): boolean {
  return hasAny(text, CORRECTION_TERMS);
}

function isFollowUp(text: string, message: string): boolean {
  const trimmed = message.trim();
  const continuation =
    /\b(это|этом|этого|его|ее|её|них|them|that|this|it|подробнее|дальше|продолжай|more|continue)\b/i.test(
      text
    );

  return FOLLOW_UP_PATTERN.test(text.trim()) || (trimmed.length <= 40 && continuation);
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

  if (detectCommercialQuestion(message)) {
    signals.push('commercial:context');
    return { intent: 'commercial', signals };
  }

  if (
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
    /(мои\s+текст|моих\s+текст|моим\s+текст|моими\s+текст|мои\s+стать|мои\s+запис|моей\s+биографии|мои\s+проект|моя\s+работ|my\s+texts|my\s+writing|my\s+articles|my\s+work|my\s+brain|в\s+brain|in\s+brain)/i.test(
      text
    );
  const externalMarker =
    /(что\s+известно|what\s+is\s+known|who\s+is|кто\s+такой|что\s+такое|what\s+is|what\s+are|в\s+интернете|on\s+the\s+web|external|внешн|сравни\s+с|compare\s+with)/i.test(
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

  const manuscriptMarker =
    /(unframed|manuscript|рукопис|мемуар|memoir|my\s+book|моя\s+книга|мои\s+книги|substack|новая\s+газета|novaya\s+gazeta|heart\s*&\s*angel|heartandangel|my\s+essays|мои\s+эссе)/i.test(
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
    /(в\s+интернете|интернет[еа]?|online|web\s+search|поищи\s+в\s+сети|latest\s+news|новости|что\s+происходит|what\s+is\s+happening|current\s+events)/i.test(
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
    web: base.web || extra.web === true,
    graph: base.graph || extra.graph === true,
    analytics: base.analytics || extra.analytics === true,
    commercial: base.commercial || extra.commercial === true,
    project: base.project || extra.project === true,
  };
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
  const signals: string[] = [];

  if (period) signals.push(`period:${period.label}`);
  if (correction) signals.push('correction');
  if (followUp) signals.push('follow_up');

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
    else if (intent === 'biography' || intent === 'views_over_time') confidence = 0.8;
    else if (intent === 'personal_analysis' || intent === 'project') confidence = 0.75;
    else if (intent === 'brain_web_research') confidence = 0.8;
    else if (intent === 'web_research') confidence = 0.7;
    else confidence = 0.45;
  }

  const sources = sourcesForIntent(intent);

  // Explicit corrections and short follow-ups inherit the previous user
  // request only when the current message does not itself establish a new
  // intent. This is what makes "Не то, я имею в виду документ в Brain" work
  // without pinning a tool forever.
  if (
    depth === 0 &&
    options.allowHistory !== false &&
    options.history &&
    options.history.length > 0 &&
    (correction || followUp) &&
    !documentTitle &&
    (intent === 'general' || intent === 'personal_analysis' || intent === 'web_research')
  ) {
    const lastUser = [...options.history]
      .reverse()
      .find((item) => item.role === 'user' && item.content.trim());

    if (lastUser) {
      const previous = understandPierrotQuery(lastUser.content, {
        allowHistory: false,
        depth: depth + 1,
      });

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
