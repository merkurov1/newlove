import { addZonedDays, startOfZonedDay, startOfZonedMonth, zonedWallTimeToUtc } from '@/lib/pierrot/reportingPeriod';
import {
  isValidTimeZone,
  resolveOwnerTimeZone,
} from '@/lib/pierrot/intake/time';
import type {
  ContextIntentName,
  ContextPeriod,
  ContextPeriodKey,
  ContextQueryPlan,
} from './types';

/**
 * Deterministic owner context intent detection.
 *
 * This module decides only whether the owner is asking for historical,
 * project, daily or entity context. It never calls a model and never touches
 * the database. Generic analytics, commercial and Flow/MSI questions are
 * deliberately left to their existing tools.
 */

export type DetectContextQueryOptions = {
  now?: Date;
  /** Explicit configured owner timezone. Defaults to the existing env value. */
  timezone?: string;
  /** Set to false when the caller knows no owner timezone is configured. */
  timezoneKnown?: boolean;
};

const MONTHS_RU: Record<string, number> = {
  января: 1,
  январь: 1,
  февраля: 2,
  февраль: 2,
  марта: 3,
  март: 3,
  апреля: 4,
  апрель: 4,
  мая: 5,
  май: 5,
  июня: 6,
  июнь: 6,
  июля: 7,
  июль: 7,
  августа: 8,
  август: 8,
  сентября: 9,
  сентябрь: 9,
  октября: 10,
  октябрь: 10,
  ноября: 11,
  ноябрь: 11,
  декабря: 12,
  декабрь: 12,
};

const MONTHS_EN: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(term));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validTimeZone(value: string | null | undefined): value is string {
  return typeof value === 'string' && isValidTimeZone(value);
}

/**
 * An explicit timezone in the request wins over the configured display zone.
 * The returned `known` flag tells the report whether a fallback was used.
 */
export function resolveContextTimezone(
  message: string,
  options: DetectContextQueryOptions = {}
): { timezone: string; known: boolean; explicit: boolean } {
  const text = normalize(message);
  const explicitPatterns: Array<{ pattern: RegExp; timezone: string }> = [
    {
      pattern: /(?:^|\s)(?:gmt|utc|гринвич|гмт)(?=$|\s|[.,;:!?])/i,
      timezone: 'UTC',
    },
    {
      pattern: /(?:^|\s)(?:msk|мск|московск\w*|moscow)(?=$|\s|[.,;:!?])/i,
      timezone: 'Europe/Moscow',
    },
    {
      pattern: /(?:^|\s)(?:est|edt|new york|нью-йорк)(?=$|\s|[.,;:!?])/i,
      timezone: 'America/New_York',
    },
    {
      pattern: /(?:^|\s)(?:pst|pdt|los angeles|лос-анджелес)(?=$|\s|[.,;:!?])/i,
      timezone: 'America/Los_Angeles',
    },
    {
      pattern: /(?:^|\s)(?:cet|cest|berlin|берлин)(?=$|\s|[.,;:!?])/i,
      timezone: 'Europe/Berlin',
    },
    {
      pattern: /(?:^|\s)(?:london|лондон)(?=$|\s|[.,;:!?])/i,
      timezone: 'Europe/London',
    },
  ];

  for (const entry of explicitPatterns) {
    if (entry.pattern.test(text)) {
      return { timezone: entry.timezone, known: true, explicit: true };
    }
  }

  const iana = text.match(/([a-z]+(?:\.[a-z]+)?\/[a-z_]+)/i);
  if (iana && validTimeZone(iana[1])) {
    return { timezone: iana[1], known: true, explicit: true };
  }

  if (options.timezone && validTimeZone(options.timezone)) {
    return {
      timezone: options.timezone,
      known: options.timezoneKnown !== false,
      explicit: false,
    };
  }

  const configured = resolveOwnerTimeZone();
  return {
    timezone: configured.timezone,
    known: configured.known,
    explicit: false,
  };
}

function formatDay(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone: timezone,
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function isoDay(date: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function period(
  key: ContextPeriodKey,
  from: Date,
  to: Date,
  timezone: string,
  label?: string
): ContextPeriod {
  return {
    key,
    from: from.toISOString(),
    to: to.toISOString(),
    label: label || formatDay(from, timezone),
  };
}

function localMonthRange(date: Date, timezone: string, offset = 0): { from: Date; to: Date } {
  const start = startOfZonedMonth(date, timezone);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(start);
  const value = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  const target = new Date(Date.UTC(value('year'), value('month') - 1 + offset, 1));
  const from = zonedWallTimeToUtc(
    {
      year: target.getUTCFullYear(),
      month: target.getUTCMonth() + 1,
      day: 1,
    },
    timezone
  );
  const nextTarget = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 1));
  const to = zonedWallTimeToUtc(
    {
      year: nextTarget.getUTCFullYear(),
      month: nextTarget.getUTCMonth() + 1,
      day: 1,
    },
    timezone
  );
  return { from, to };
}

/**
 * Parses only periods that change retrieval. Ambiguous "recently" stays a
 * ranking hint, not a hard filter.
 */
export function parseContextPeriod(
  message: string,
  options: DetectContextQueryOptions & { defaultToday?: boolean } = {}
): ContextPeriod | null {
  const text = normalize(message);
  const now = options.now || new Date();
  const { timezone } = resolveContextTimezone(message, options);
  const today = startOfZonedDay(now, timezone);
  const tomorrow = addZonedDays(today, 1, timezone);

  const iso = text.match(/(20\d{2}-\d{2}-\d{2})/);
  if (iso) {
    const [year, month, day] = iso[1].split('-').map(Number);
    const from = zonedWallTimeToUtc({ year, month, day }, timezone);
    const to = addZonedDays(from, 1, timezone);
    return period('custom', from, to, timezone);
  }

  const ruDate = text.match(/(\d{1,2})\s+(января|январь|февраля|февраль|марта|март|апреля|апрель|мая|май|июня|июнь|июля|июль|августа|август|сентября|сентябрь|октября|октябрь|ноября|ноябрь|декабря|декабрь)(?:\s+(20\d{2}))?/);
  if (ruDate) {
    const day = Number(ruDate[1]);
    const month = MONTHS_RU[ruDate[2]] || 1;
    const year = ruDate[3] ? Number(ruDate[3]) : Number(isoDay(now, timezone).slice(0, 4));
    const from = zonedWallTimeToUtc({ year, month, day }, timezone);
    const to = addZonedDays(from, 1, timezone);
    return period('custom', from, to, timezone);
  }

  const enDate = text.match(
    /(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sep|sept|october|oct|november|nov|december|dec)\s+(\d{1,2})(?:,?\s+(20\d{2}))?/
  );
  if (enDate) {
    const month = MONTHS_EN[enDate[1]] || 1;
    const day = Number(enDate[2]);
    const year = enDate[3] ? Number(enDate[3]) : Number(isoDay(now, timezone).slice(0, 4));
    const from = zonedWallTimeToUtc({ year, month, day }, timezone);
    const to = addZonedDays(from, 1, timezone);
    return period('custom', from, to, timezone);
  }

  if (hasAny(text, ['сегодня', 'today', 'за сегодня', 'за сегодняшний день', 'за день'])) {
    return period('today', today, tomorrow, timezone);
  }

  if (hasAny(text, ['вчера', 'yesterday', 'за вчера', 'за вчерашний день'])) {
    return period('yesterday', addZonedDays(today, -1, timezone), today, timezone);
  }

  const lastDays = text.match(/(?:последние|за последние|last|past)\s+(\d{1,2})\s*(?:дней|дня|day|days)/);
  if (lastDays) {
    const days = Math.min(Math.max(Number(lastDays[1]) || 1, 1), 365);
    return period(
      'last_n_days',
      addZonedDays(today, -(days - 1), timezone),
      tomorrow,
      timezone
    );
  }

  if (hasAny(text, ['на этой неделе', 'эта неделя', 'эту неделю', 'this week', 'past week', 'за неделю', 'за последнюю неделю', 'последнюю неделю'])) {
    return period('this_week', addZonedDays(today, -6, timezone), tomorrow, timezone);
  }

  if (hasAny(text, ['прошлую неделю', 'прошлая неделя', 'previous week', 'last week'])) {
    return period(
      'last_week',
      addZonedDays(today, -13, timezone),
      addZonedDays(today, -6, timezone),
      timezone
    );
  }

  if (hasAny(text, ['этот месяц', 'текущий месяц', 'this month', 'current month'])) {
    const range = localMonthRange(now, timezone, 0);
    return period('this_month', range.from, tomorrow, timezone);
  }

  if (hasAny(text, ['в прошлом месяце', 'прошлый месяц', 'previous month', 'last month'])) {
    const range = localMonthRange(now, timezone, -1);
    return period('last_month', range.from, range.to, timezone);
  }

  if (options.defaultToday) return period('today', today, tomorrow, timezone);

  return null;
}

const ANALYTICS_TERMS = [
  'analytics',
  'аналитик',
  'статистик',
  'stats',
  'statistic',
  'метрик',
  'bluesky',
  'instagram',
  'threads',
  'telegram',
  'umami',
  'vercel',
  'google analytics',
  'search console',
  'msi',
  'конверси',
  'продаж',
  'выручк',
  'подписчик',
  'посещаем',
  'трафик',
  'охват',
  'engagement',
  'revenue',
  'metrics',
  'sales',
];

const HISTORY_MARKERS = [
  'истори',
  'history',
  'обсуждал',
  'discuss',
  'хронолог',
  'timeline',
  'решил',
  'decid',
  'сделал',
  'did i do',
  'complete',
  'заверш',
  'finished',
  'обсужден',
  'conversation',
  'разговор',
  'диалог',
  'первоисточник',
  'original',
  'что изменилось',
  'what changed',
  'last version',
  'последняя версия',
];

function analyticsHasHistoryMarker(text: string): boolean {
  return HISTORY_MARKERS.some((term) => text.includes(term));
}

const DAILY_PATTERNS = [
  /что\s+(?:я|мы)\s+(?:сегодня|вчера)\s+(?:делал|делали|сделал|сделали|успел|успели)/i,
  /что\s+(?:я|мы)\s+(?:делал|делали|сделал|сделали|успел|успели)\s+(?:сегодня|вчера)/i,
  /что\s+(?:было|произошло|случилось)\s+(?:сегодня|вчера)/i,
  /как\s+прош[её]л\s+(?:мой\s+|наш\s+)?(?:день|вечер|утро)/i,
  /(?:мой|наш)\s+день\b/i,
  /(?:покажи|дай|собери)\s+(?:мне\s+)?(?:нормальн[\p{L}]*\s+)?(?:картин[\p{L}]*\s+)?дня/iu,
  /картин[\p{L}]*\s+(?:моего\s+)?дня/iu,
  /итоги\s+(?:дня|сегодня|вчера)/i,
  /дневн[\p{L}]*\s+(?:отчет|отчёт|сводк)/iu,
  /what\s+did\s+(?:i|we)\s+(?:do|work on|get done)\s+(?:today|yesterday)/i,
  /how\s+(?:did|was)\s+(?:my|our)\s+day/i,
  /what\s+(?:happened|was done)\s+(?:today|yesterday)/i,
  /daily\s+(?:summary|report|digest)/i,
];

const ACHIEVEMENT_PATTERNS = [
  /что\s+(?:я|мы)\s+(?:завершил|завершила|завершили|закончил|закончила|закончили|выполнил|выполнила|выполнили|сделал|сделала|сделали|опубликовал|опубликовала|опубликовали)/i,
  /что\s+(?:уже\s+)?(?:готово|завершено|сделано|опубликовано)/i,
  /what\s+(?:have\s+i|did\s+i|have\s+we|did\s+we)\s+(?:complete|completed|finish|finished|publish|published|ship|shipped)/i,
  /what\s+is\s+(?:actually\s+)?(?:completed|finished|done|published)/i,
  /achievements?|достижени/i,
];

const STATUS_PATTERNS = [
  /(?:текущ\w*|нынешн\w*)\s+(?:состояни|статус)/i,
  /состояни\w*\s+проекта/i,
  /статус\s+проекта/i,
  /что\s+(?:сейчас\s+)?(?:завершено|готово|осталось|в\s+работе)/i,
  /что\s+(?:ещ[её]\s+)?(?:осталось|не\s+завершено|незавершено|не\s+закончено)/i,
  /что\s+не\s+(?:завершено|закончено|сделано)/i,
  /current\s+(?:state|status)/i,
  /project\s+status/i,
  /what\s+(?:remains|is left|is completed|is done|is unfinished|is incomplete)/i,
  /what\s+(?:still\s+)?needs?\s+to\s+be\s+(?:done|finished)/i,
  /what\s+is\s+the\s+state\s+of/i,
];

const ENTITY_PATTERNS = [
  /чем\s+отлича\w*/i,
  /what\s+is\s+the\s+difference/i,
  /(?:книга|book)\s+(?:или|and|or)\s+(?:проект|project)/i,
  /(?:проект|project)\s+(?:или|and|or)\s+(?:книга|book)/i,
  /как\s+связан\w*/i,
  /how\s+is\s+.+\s+related/i,
  /это\s+(?:книга|проект)\s+или/i,
  /is\s+.+\s+the\s+(?:book|project)/i,
  /перепутал\w*\s+(?:книг|проект|book|project)/i,
  /(?:book|project)\s+and\s+(?:book|project)\s+are\s+different/i,
];

const HISTORY_PATTERNS = [
  /истори[яю]\s+(?:проекта|диалогов|разговоров|обсуждений|работы)/i,
  /истори[яю]\s+(?:наших|всех|моих|этих)\s+(?:диалогов|разговоров|обсуждений|чатов)/i,
  /покажи\s+(?:мне\s+)?истори/i,
  /расскажи\s+истори/i,
  /хронологи/i,
  /(?:show|tell)\s+(?:me\s+)?(?:the\s+)?history/i,
  /project\s+history/i,
  /timeline/i,
  /что\s+(?:мы|я)\s+(?:обсуждал|обсуждали|говорил|говорили|решал|решали|договорил|договаривались)/i,
  /о\s+ч[её]м\s+(?:мы|я)\s+(?:договорил|договаривал|говорил|обсуждал)/i,
  /найди,?\s+(?:о\s+ч[её]м\s+)?(?:мы|я)\s+(?:договорил|говорил|обсуждал)/i,
  /what\s+did\s+(?:we|i)\s+(?:discuss|talk about|decide|agree)/i,
  /what\s+did\s+(?:we|i)\s+agree\s+(?:on|about)/i,
  /что\s+(?:произошло|случилось)\s+с\s+(?:проект|книг|сериал|unframed)/i,
  /что\s+(?:изменилось|поменялось)\s+(?:после|since)/i,
  /what\s+(?:happened|changed)\s+(?:to|with|since)\s+(?:the\s+)?(?:project|book|series|unframed)/i,
  /(?:последн\w*|last)\s+верси\w*/i,
  /last\s+version\s+of/i,
  /continue\s+from\s+where\s+(?:we|i)\s+(?:stopped|left off)/i,
  /(?:продолжи|продолжить|продолжаем)\s+(?:с|от)\s+(?:того|места)/i,
  /(?:продолжим|продолжить|продолжаем)\s+(?:проект|работу|книг|сериал|unframed|episode)/i,
  /(?:верн[её]мся|return)\s+(?:к\s+)?(?:проект|project)/i,
  /где\s+(?:мы|я)\s+остановились/i,
  /what\s+did\s+(?:i|we)\s+(?:explicitly\s+)?(?:exclude|reject|approve|choose|decide|say|write|mention)/i,
  /(?:что|кого)\s+я\s+(?:исключил|исключила|отклонил|отклонила|выбрал|выбрала|решил|решила|сказал|сказала|написал|написала|упомянул|упомянула)/i,
  /which\s+.*\s+did\s+(?:i|we)\s+(?:exclude|reject|approve|choose|decide)/i,
];

const CONVERSATION_PATTERNS = [
  /(?:найди|покажи)\s+(?:тот\s+)?(?:диалог|разговор|обсуждение|чат)/i,
  /где\s+(?:мы|я)\s+(?:это\s+)?(?:обсуждал|обсуждали|говорил|говорили|решал|решали)/i,
  /найди\s+(?:исходн\w*|оригинальн\w*)\s+(?:сообщение|обсуждение|источник)/i,
  /покажи\s+(?:где|исходн\w*|оригинальн\w*)/i,
  /find\s+(?:the\s+)?(?:conversation|chat|discussion|thread)\s+(?:where|about)/i,
  /where\s+did\s+(?:we|i)\s+(?:discuss|decide|talk about)/i,
  /show\s+(?:me\s+)?where\s+(?:we|i)\s+(?:decided|discussed)/i,
  /original\s+(?:discussion|message|source)/i,
  /(?:найди|покажи)[^?.!]{0,40}(?:о\s+ч[её]м|где)\s+(?:мы|я)\s+(?:договорил|говорил|обсуждал|решал)/i,
  /find[^?.!]{0,40}(?:where|what)\s+(?:we|i)\s+(?:agreed|discussed|decided)/i,
];

const DOCUMENT_PATTERNS = [
  /(?:найди|покажи)\s+(?:документ|документы|заметку|заметки)\s+(?:в\s+brain|в\s+мозге)?/i,
  /find\s+(?:the\s+)?(?:document|doc|note)\s+(?:in\s+brain)?/i,
  /найди\s+в\s+brain/i,
  /search\s+(?:the\s+)?brain/i,
];

const VISUALIZATION_PATTERNS = [
  /(?:покажи|построй|сделай|show|build|draw)\s+(?:мне\s+)?(?:график|диаграмм|схем|chart|diagram|graph|plot)/i,
  /(?:график|диаграмм|chart|diagram)\s+(?:и|and)\s+(?:график|диаграмм|chart|diagram)/i,
];

const PROJECT_HINT =
  /(?:проект[аеу]?\s+|project\s+)([«"“']?[\p{L}\p{N}][\p{L}\p{N} &._-]{1,80}[»"”']?)/iu;

function cleanQuery(value: string, intent: ContextIntentName): string {
  let text = value.trim();

  const prefixes: RegExp[] = [
    /^(?:пьеро[,:]?\s*)/i,
    /^(?:пожалуйста[,:]?\s*)/i,
    /^(?:покажи|показать|найди|найти|расскажи|рассказать|show|find|tell)\s+(?:мне\s+)?/i,
    /^(?:что|what)\s+(?:я|мы|i|we)\s+(?:делал|делали|сделал|сделали|обсуждал|обсуждали|решал|решали|говорил|говорили|did|do)\s+/i,
    /^(?:что|what)\s+(?:было|произошло|случилось|happened)\s+/i,
    /^(?:как\s+прош[её]л|how\s+(?:did|was))\s+(?:мой\s+|my\s+)?(?:день|day)\b/i,
    /^(?:изучи|изучить|study|review|examine)\s+/i,
    /^(?:какова|какой|какое|what\s+is)\s+(?:история|history|состояние|state|статус|status)\s+(?:проекта\s+|of\s+|the\s+)?/i,
    /^(?:история|history|хронология|timeline|статус|status|состояние|state)\s+(?:проекта\s+|of\s+|the\s+)?/i,
    /^(?:найди|find)\s+(?:тот\s+)?(?:диалог|разговор|обсуждение|conversation|chat|discussion)\s*(?:где|where|about|про|о|об)?\s*/i,
    /^(?:где|where)\s+(?:мы|я|we|i)\s+(?:это\s+)?(?:обсуждали|обсуждал|говорили|говорил|решали|решал|discussed|decided|talked about)\s*/i,
    /^(?:покажи|show)\s+(?:мне\s+)?(?:где|where)\s*/i,
  ];

  for (const prefix of prefixes) text = text.replace(prefix, '');

  if (intent === 'DAILY_SUMMARY' || intent === 'ACHIEVEMENT_LOG') {
    text = text
      .replace(
        /(?:сегодня|вчера|today|yesterday|за\s+сегодня|за\s+вчера|за\s+последние\s+\d+\s+дней|last\s+\d+\s+days)/gi,
        ' '
      )
      .replace(/(?:итоги|дня|daily|summary|report|digest|достижени\w*|achievements?)/gi, ' ')
      .trim();
  }

  text = text
    .replace(/(?:в|in)\s+(?:gmt|utc|msk|мск|москве|moscow)/gi, ' ')
    .replace(/[?.!;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return text.slice(0, 300);
}

function projectHintFor(value: string): string | null {
  const match = value.match(PROJECT_HINT);
  if (!match) return null;
  const raw = match[1].replace(/^[«"“']|[»"”']$/g, '').trim();
  // "project history" / "проект вчера" are not names.
  if (!raw || /^(?:history|истори|status|статус|state|состояние|today|сегодня|вчера)$/i.test(raw)) {
    return null;
  }
  return raw.slice(0, 80);
}

function entityTypeHintFor(value: string): string | null {
  const text = normalize(value);
  const word = (terms: string) =>
    new RegExp(`(?:^|\\s)(?:${terms})(?=$|\\s|[.,;:!?])`, 'iu').test(text);
  const book = word('book|books|книг[\\p{L}]*|рукопис[\\p{L}]*|manuscript|роман');
  const project = word('project|projects|проект[\\p{L}]*');
  if (book && project) return null;
  if (book) return 'BOOK';
  if (project) return 'PROJECT';
  if (word('series|сериал[\\p{L}]*')) return 'SERIES';
  if (word('video|видео')) return 'VIDEO';
  if (word('website|сайт')) return 'WEBSITE';
  if (word('proposal|предложени[\\p{L}]*')) return 'PROPOSAL';
  return null;
}

/**
 * Returns null for ordinary chat and for requests owned by another subsystem
 * (analytics, commercial, MSI, Flow). The route keeps those paths unchanged.
 */
export function detectContextQuery(
  message: string,
  options: DetectContextQueryOptions = {}
): ContextQueryPlan | null {
  const originalQuery = message.trim();
  if (!originalQuery) return null;

  const text = normalize(originalQuery);
  const analytics = hasAny(text, ANALYTICS_TERMS);

  if (analytics && !analyticsHasHistoryMarker(text)) return null;

  const timezone = resolveContextTimezone(originalQuery, options);
  const signals: string[] = [];
  const visualization = VISUALIZATION_PATTERNS.some((pattern) => pattern.test(originalQuery));

  let intent: ContextIntentName | null = null;

  if (DAILY_PATTERNS.some((pattern) => pattern.test(text))) {
    intent = 'DAILY_SUMMARY';
    signals.push('intent:daily');
  } else if (ACHIEVEMENT_PATTERNS.some((pattern) => pattern.test(text))) {
    intent = 'ACHIEVEMENT_LOG';
    signals.push('intent:achievement');
  } else if (STATUS_PATTERNS.some((pattern) => pattern.test(text))) {
    intent = 'PROJECT_STATUS';
    signals.push('intent:project_status');
  } else if (
    // A short "What is UNFRAMED?" question about an all-caps name is an
    // entity question. Sentence-case questions ("What is Pierrot?") stay in
    // ordinary chat; lowercasing the whole query would hide the distinction.
    /^(?:что такое|Что такое|what is|What is|WHAT IS)\s+([A-ZА-Я0-9][A-ZА-Я0-9 &._-]{2,60})\??$/u.test(
      originalQuery.trim()
    )
  ) {
    intent = 'ENTITY_DISTINCTION';
    signals.push('intent:entity_question');
  } else if (ENTITY_PATTERNS.some((pattern) => pattern.test(text))) {
    intent = 'ENTITY_DISTINCTION';
    signals.push('intent:entity_distinction');
  } else if (CONVERSATION_PATTERNS.some((pattern) => pattern.test(text))) {
    intent = 'CONVERSATION_SEARCH';
    signals.push('intent:conversation_search');
  } else if (HISTORY_PATTERNS.some((pattern) => pattern.test(text))) {
    intent = 'PROJECT_HISTORY';
    signals.push('intent:project_history');
  } else if (DOCUMENT_PATTERNS.some((pattern) => pattern.test(text))) {
    intent = 'DOCUMENT_SEARCH';
    signals.push('intent:document_search');
  } else if (visualization) {
    // "Покажи график" / "построй диаграмму" has no separate data store. It
    // retrieves the same dated context records and lets the presentation layer
    // decide whether a real chart or diagram can be drawn without invention.
    intent = 'PROJECT_HISTORY';
    signals.push('intent:visualization');
  }

  if (!intent) return null;

  const defaultToday = intent === 'DAILY_SUMMARY';
  let period = parseContextPeriod(originalQuery, { ...options, defaultToday });

  if (!period && visualization) {
    const zone = timezone.timezone;
    const today = startOfZonedDay(options.now || new Date(), zone);
    const tomorrow = addZonedDays(today, 1, zone);
    period = {
      key: 'last_n_days',
      from: addZonedDays(today, -6, zone).toISOString(),
      to: tomorrow.toISOString(),
      label: formatDay(addZonedDays(today, -6, zone), zone),
    };
    signals.push('period:last_7_days');
  }

  if (period) signals.push(`period:${period.key}`);
  if (timezone.explicit) signals.push('timezone:explicit');
  if (!timezone.known) signals.push('timezone:fallback');

  const query = cleanQuery(originalQuery, intent);
  const projectHint = projectHintFor(originalQuery);
  const entityTypeHint = entityTypeHintFor(originalQuery);
  const wantsOriginalSource =
    /(?:первоисточник|исходн\w*|оригинальн\w*|where\s+did|покажи\s+где|original\s+(?:source|message|discussion)|source\s+message)/i.test(
      originalQuery
    );

  let confidence = 0.66;
  if (period) confidence += 0.08;
  if (projectHint) confidence += 0.06;
  if (entityTypeHint) confidence += 0.04;
  if (wantsOriginalSource) confidence += 0.05;
  if (intent === 'DAILY_SUMMARY' || intent === 'ACHIEVEMENT_LOG') confidence += 0.05;

  return {
    intent,
    originalQuery,
    query,
    confidence: Math.min(0.96, Number(confidence.toFixed(2))),
    signals,
    period,
    timezone: timezone.timezone,
    timezoneKnown: timezone.known,
    projectHint,
    entityTypeHint,
    wantsOriginalSource,
    explicit: true,
  };
}

/** Used by tests and diagnostics; keeps the exported pattern set auditable. */
export const CONTEXT_INTENT_PATTERNS = {
  DAILY_PATTERNS,
  ACHIEVEMENT_PATTERNS,
  STATUS_PATTERNS,
  ENTITY_PATTERNS,
  HISTORY_PATTERNS,
  CONVERSATION_PATTERNS,
  DOCUMENT_PATTERNS,
  escapeRegExp,
};
