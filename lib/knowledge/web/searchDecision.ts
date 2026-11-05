import { WEB_SEARCH_MAX_QUERY_CHARS } from './config';

export type ExplicitWebSource = 'web' | 'brain' | 'media' | 'brain_web';

export type ContextualWebQuery = {
  query: string;
  usedContext: boolean;
  topicChanged: boolean;
  explicit: boolean;
};

/**
 * Deterministic, side-effect-free routing for autonomous web search.
 *
 * The goal is deliberately conservative: search only when external evidence
 * materially improves the answer. General knowledge, casual conversation,
 * writing tasks, follow-ups and questions about Anton's own texts stay on the
 * model/Brain path. No model call is made to decide.
 */

export type WebSearchReason =
  | 'greeting'
  | 'casual'
  | 'follow_up'
  | 'writing_request'
  | 'personal_brain'
  | 'owner_brain'
  | 'current_events'
  | 'verification'
  | 'factual_lookup'
  | 'explicit_web'
  | 'explicit_brain'
  | 'explicit_media'
  | 'explicit_brain_web'
  | 'web_follow_up'
  | 'ambiguous';

export type WebSearchDecision = {
  shouldSearch: boolean;
  query: string;
  reason: WebSearchReason;
  signals: string[];
  confidence: number;
  /** True when the query was expanded with the previous explicit web topic. */
  usedContext: boolean;
  /** The user explicitly switched to a different topic. */
  topicChanged: boolean;
  /** Explicit source command detected in the current message. */
  explicitSource: ExplicitWebSource | null;
};

export type WebSearchDecisionInput = {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** Optional explicit previous search topic, when the caller already knows it. */
  previousWebQuery?: string | null;
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasTerm(text: string, term: string): boolean {
  const value = normalize(term);

  if (!value) return false;

  if (/^[a-zа-я0-9]+$/i.test(value) && value.length <= 5) {
    return new RegExp(`(^|[^a-zа-я0-9])${escapeRegExp(value)}([^a-zа-я0-9]|$)`, 'i').test(text);
  }

  return text.includes(value);
}

function hasAny(text: string, terms: string[]): boolean {
  return terms.some((term) => hasTerm(text, term));
}

const GREETING_EXACT =
  /^(hi|hii|hello|hey|yo|hiya|good morning|good afternoon|good evening|thanks|thank you|cheers|bye|goodbye|see you|ok|okay|sure|great|nice|cool|привет|здравствуй|здравствуйте|добрый день|добрый вечер|доброе утро|спасибо|пока|до свидания|ок|хорошо|отлично)[\s!.,?…]*$/i;

const CASUAL_META_TERMS = [
  'how are you',
  'how is it going',
  "how's it going",
  'how old are you',
  'who are you',
  'what is your name',
  "what's your name",
  'tell me a joke',
  'what can you do',
  'what do you do',
  'как дела',
  'как ты',
  'кто ты',
  'твое имя',
  'твое имя?',
  'расскажи шутку',
  'что ты умеешь',
  'что ты делаешь',
];

const FOLLOW_UP_EXACT =
  /^(and|but|so|why|how|then what|and then|what about (that|him|her|it|them|this)|tell me more|more|continue|go on|и|а|но|почему|зачем|как|а что|и что|что дальше|подробнее|продолжай|еще|ещё|дальше)[\s!?.,…]*$/i;

const EXPLICIT_WEB_PATTERNS: RegExp[] = [
  /(?:^|\s)(?:найди(?:те)?|поищи(?:те)?|посмотри(?:те)?|проверь(?:те)?)\s+(?:в|во)\s+(?:интернете|сети|вебе)(?=\s|[:—–,?.!-]|$)/i,
  /(?:^|\s)что\s+(?:пишут|говорят|известно)\s+(?:в|во)\s+(?:интернете|сети|вебе)(?=\s|[?.!]|$)/i,
  /(?:^|\s)search\s+(?:the\s+)?web(?=\s|[:—–,?.!-]|$)/i,
  /(?:^|\s)web\s+search(?=\s|[:—–,?.!-]|$)/i,
  /(?:^|\s)find\s+(?:it\s+)?online(?=\s|[:—–,?.!-]|$)/i,
  /(?:^|\s)look\s+(?:it\s+)?up(?=\s|[:—–,?.!-]|$)/i,
  /(?:^|\s)check\s+online(?=\s|[:—–,?.!-]|$)/i,
];

const EXPLICIT_BRAIN_PATTERNS: RegExp[] = [
  /(?:^|\s)(?:найди(?:те)?|поищи(?:те)?|посмотри(?:те)?|проверь(?:те)?)\s+(?:в|во)\s+(?:brain|базе\s+знаний|мозге|rag)(?=\s|$)/i,
  /(?:^|\s)(?:search|look\s+up|find)\s+(?:in\s+)?(?:brain|knowledge\s+base|rag)(?=\s|$)/i,
  /(?:^|\s)in\s+brain(?=\s|$)/i,
];

const EXPLICIT_MEDIA_PATTERNS: RegExp[] = [
  /(?:^|\s)(?:найди(?:те)?|поищи(?:те)?|посмотри(?:те)?|проверь(?:те)?)\s+(?:в|во)\s+(?:media\s+archive|медиа\s*архиве|медиа|сми)(?=\s|$)/i,
  /(?:^|\s)(?:search|look\s+up|find)\s+(?:in\s+)?media\s+archive(?=\s|$)/i,
  /(?:^|\s)media\s+archive(?=\s|$)/i,
];

const BRAIN_MENTION = /(?:^|\s)(?:brain|rag|баз[ае]\s+знаний|мозг|мой\s+архив|мои\s+текст|my\s+texts|my\s+writing)(?=\s|$)/i;
const WEB_MENTION = /(?:^|\s)(?:интернет[а-я]*|в\s+сети|web|online)(?=\s|$)/i;
const COMPARE_WITH_WEB = /(?:сравни|compare).{0,120}(?:интернет|web|online|сми|media)/i;

const FOLLOW_UP_WEB =
  /^(?:а\s+)?(?:теперь|дальше|подробнее|еще|ещё|и\s+что|а\s+что|что\s+известно|what\s+about|and\s+now|tell\s+me\s+more|more|continue)(?=\s|$|[,.;:!?])/i;

const TOPIC_SWITCH =
  /^(?:а\s+)?(?:теперь|now|next)\s+(?:про|о|об|about|on)\s+|(?:другая\s+тема|new\s+topic|switch\s+to|instead)/i;

function stripLeadingFiller(value: string): string {
  return value
    .replace(/^(?:please|can you|could you|would you|will you|пожалуйста|можешь|не мог бы)\s*[,]?\s*/i, '')
    .trim();
}

function cleanWebRemainder(value: string): string {
  return value
    .replace(/^[\s:—–,.-]+/, '')
    .replace(/^(?:о|об|про|about|on|for|of)\s+/i, '')
    .replace(/^(?:the\s+)?(?:web|internet|online)\s+/i, '')
    .replace(/[\s?.!]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, WEB_SEARCH_MAX_QUERY_CHARS);
}

/**
 * Returns the user-provided part of an explicit web command, or null when the
 * message does not explicitly ask for the web. The command itself is removed
 * from the query so Exa never receives "найди в интернете".
 */
export function extractExplicitWebQuery(message: string): string | null {
  const cleaned = stripLeadingFiller(typeof message === 'string' ? message : '');
  if (!cleaned) return null;

  for (const pattern of EXPLICIT_WEB_PATTERNS) {
    const match = cleaned.match(pattern);
    if (!match) continue;

    const withoutCommand = cleaned.replace(pattern, ' ');
    return (
      cleanWebRemainder(
        withoutCommand
          .replace(/^(?:сравни|compare)\s+/i, '')
          .replace(/\s+(?:с\s+тем,?|with what)\s*$/i, ' ')
      ) ?? ''
    );
  }

  return null;
}

export function hasExplicitWebCommand(message: string): boolean {
  return extractExplicitWebQuery(message) !== null;
}

export function detectExplicitSource(message: string): ExplicitWebSource | null {
  const text = normalize(message);
  const web = EXPLICIT_WEB_PATTERNS.some((pattern) => pattern.test(text));
  const brain = EXPLICIT_BRAIN_PATTERNS.some((pattern) => pattern.test(text));
  const media = EXPLICIT_MEDIA_PATTERNS.some((pattern) => pattern.test(text));
  const webSignal = web || WEB_MENTION.test(text);

  if (webSignal && (brain || BRAIN_MENTION.test(text) || COMPARE_WITH_WEB.test(text))) {
    return 'brain_web';
  }
  if (brain) return 'brain';
  if (media && !web) return 'media';
  if (web) return 'web';
  return null;
}

function isWebFollowUp(message: string): boolean {
  const text = normalize(message);
  if (FOLLOW_UP_EXACT.test(text) || FOLLOW_UP_WEB.test(text)) return true;

  return (
    text.length <= 220 &&
    /\b(?:его|её|ее|их|этого|этом|этой|этих|this|that|it|its|their)\b/i.test(text)
  );
}

function isTopicSwitch(message: string): boolean {
  return TOPIC_SWITCH.test(normalize(message));
}

function stripFollowUpPrefix(message: string): string {
  return cleanWebRemainder(
    message
      .replace(
        /^(?:а\s+)?(?:теперь|and\s+now)\s+(?:подробнее|дальше|more|next)?\s*(?:про|о|об|about|on)?\s*/i,
        ' '
      )
      .replace(/^(?:а\s+)?(?:теперь|дальше|подробнее)\s*(?:про|о|об|about|on)?\s*/i, ' ')
      .replace(/^(?:а\s+)?что\s+(?:известно|пишут|говорят)\s*(?:о|об|про|about|on)?\s*/i, ' ')
      .replace(/^(?:tell\s+me\s+more|more|continue|go\s+on|and\s+now|what\s+about)\s*/i, ' ')
      .replace(/^\s*(?:его|её|ее|их|этого|этом|этой|этих|this|that|it|its|their)\s+/i, ' ')
  );
}

function stripTopicSwitchPrefix(message: string): string {
  return cleanWebRemainder(
    message.replace(/^(?:а\s+)?(?:теперь|now|next)\s*(?:про|о|об|about|on)\s*/i, ' ')
  );
}

function combineWebQueries(previous: string, detail: string): string {
  const topic = previous.replace(/\s+/g, ' ').trim().slice(0, 320);
  const next = detail.replace(/\s+/g, ' ').trim();
  if (!next) return topic.slice(0, WEB_SEARCH_MAX_QUERY_CHARS);
  if (!topic) return next.slice(0, WEB_SEARCH_MAX_QUERY_CHARS);
  return `${topic} ${next}`.replace(/\s+/g, ' ').trim().slice(0, WEB_SEARCH_MAX_QUERY_CHARS);
}

export function findPreviousWebQuery(
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
): string | null {
  if (!history) return null;

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const item = history[index];
    if (item?.role !== 'user' || !item.content) continue;
    const query = extractExplicitWebQuery(item.content);
    if (query && query.length >= 2) return query;
  }

  return null;
}

/**
 * Builds the only string sent to Exa. It never includes assistant messages,
 * Brain passages, memory records or system prompts. Context is limited to the
 * previous explicit user web query, which is already public-search intent.
 */
export function buildContextualWebQuery(input: {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  previousWebQuery?: string | null;
}): ContextualWebQuery {
  const message = typeof input.message === 'string' ? input.message : '';
  const explicitQuery = extractExplicitWebQuery(message);
  const previous =
    (input.previousWebQuery ?? findPreviousWebQuery(input.history) ?? '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 320);
  const topicChanged = isTopicSwitch(message);

  if (explicitQuery !== null) {
    if (
      previous &&
      !topicChanged &&
      (isWebFollowUp(message) || /\b(?:его|её|ее|их|this|that|it)\b/i.test(explicitQuery))
    ) {
      return {
        query: combineWebQueries(previous, explicitQuery || stripFollowUpPrefix(message)),
        usedContext: true,
        topicChanged: false,
        explicit: true,
      };
    }

    return {
      query: explicitQuery || buildWebSearchQuery(message),
      usedContext: false,
      topicChanged,
      explicit: true,
    };
  }

  if (previous && (isWebFollowUp(message) || topicChanged)) {
    const detail = topicChanged ? stripTopicSwitchPrefix(message) : stripFollowUpPrefix(message);
    const query = topicChanged
      ? detail
      : combineWebQueries(previous, detail);
    return {
      query: query || previous,
      usedContext: !topicChanged,
      topicChanged,
      explicit: false,
    };
  }

  return {
    query: buildWebSearchQuery(message),
    usedContext: false,
    topicChanged: false,
    explicit: false,
  };
}

const WRITING_REQUEST_TERMS = [
  'write',
  'rewrite',
  'edit',
  'proofread',
  'translate',
  'draft',
  'compose',
  'summarize',
  'summarise',
  'shorten',
  'expand',
  'rephrase',
  'improve',
  'polish',
  'format',
  'напиши',
  'написать',
  'перепиши',
  'переписать',
  'отредактируй',
  'редактировать',
  'переведи',
  'перевести',
  'сократи',
  'расширь',
  'составь',
  'сформулируй',
  'улучши',
  'отформатируй',
  'суммируй',
];

const PERSONAL_BRAIN_TERMS = [
  'your previous',
  'your earlier',
  'your last answer',
  'your opinion',
  'your view',
  'your views',
  'your take',
  'your position',
  'you said',
  'you wrote',
  'you mentioned',
  'you argued',
  'you believed',
  'you thought',
  'you think',
  'do you remember',
  'what did you say',
  'what did you write',
  'what did you mean',
  'what did you think',
  'in your texts',
  'in your writing',
  'in your book',
  'in your essays',
  "anton's opinion",
  "anton's view",
  "anton's previous",
  "anton's position",
  'anton said',
  'anton wrote',
  'anton mentioned',
  'anton thinks',
  'anton believes',
  'what did anton say',
  'what did anton write',
  'what did anton mean',
  'мнение меркурова',
  'меркуров говорил',
  'меркуров писал',
  'меркуров считает',
  'что говорил меркуров',
  'что писал меркуров',
  'твое мнение',
  'твоя позиция',
  'твой взгляд',
  'ты говорил',
  'ты писала',
  'ты писал',
  'ты думал',
  'ты считаешь',
  'ты помнишь',
  'что ты говорил',
  'что ты писал',
  'что ты думал',
  'что ты считаешь',
  'что ты имел в виду',
  'в твоих текстах',
  'в твоих статьях',
  'в твоей книге',
  'раньше ты',
];

const OWNER_BRAIN_TERMS = [
  'my book',
  'my manuscript',
  'my writing',
  'my texts',
  'my articles',
  'my columns',
  'my essays',
  'my brain',
  'what have i written',
  'what did i write',
  'what do i write',
  'in my book',
  'in my manuscript',
  'мои тексты',
  'мои статьи',
  'мои колонки',
  'мои книги',
  'мои рукописи',
  'что я писал',
  'что я написал',
  'что я пишу',
  'в моей книге',
  'в моей рукописи',
  'unframed',
  'manuscript',
  'manuscripts',
  'рукопись',
  'рукописи',
  'мемуар',
  'мемуары',
  'memoir',
  'memoirs',
  'novaya gazeta',
  'новая газета',
  'новой газете',
  'substack',
];

const CURRENT_EVENT_STRONG_TERMS = [
  'latest',
  'recent',
  'recently',
  'today',
  'tonight',
  'this morning',
  'this week',
  'this month',
  'this year',
  'current',
  'currently',
  'right now',
  'now',
  'news',
  'breaking',
  'developments',
  'development',
  'what is happening',
  "what's happening",
  'what happened',
  'what has happened',
  'status of',
  'update',
  'updated',
  'announced',
  'announcement',
  'released',
  'release',
  'launched',
  'newly',
  'just now',
  'as of',
  'so far',
  'next week',
  'next month',
  'upcoming',
  'последние',
  'последний',
  'последняя',
  'последнее',
  'недавно',
  'сейчас',
  'сегодня',
  'на этой неделе',
  'в этом месяце',
  'в этом году',
  'новости',
  'что происходит',
  'что случилось',
  'что произошло',
  'статус',
  'обновление',
  'объявлен',
  'объявили',
  'выпущен',
  'выпустили',
  'запущен',
  'на данный момент',
];

const CURRENT_EVENT_WEAK_TERMS = [
  'market',
  'stock',
  'stocks',
  'shares',
  'price',
  'prices',
  'inflation',
  'economy',
  'election',
  'law',
  'bill',
  'regulation',
  'lawsuit',
  'court',
  'company',
  'startup',
  'ceo',
  'earnings',
  'valuation',
  'funding',
  'acquisition',
  'merger',
  'died',
  'appointed',
  'resigned',
  'рынок',
  'акции',
  'цена',
  'цены',
  'инфляция',
  'экономика',
  'выборы',
  'закон',
  'суд',
  'компания',
  'стартап',
  'умер',
  'назначен',
  'уволился',
];

const VERIFICATION_TERMS = [
  'verify',
  'fact check',
  'fact-check',
  'is it true',
  'is this true',
  'true that',
  'confirm whether',
  'according to recent',
  'according to current',
  'source for',
  'evidence that',
  'did really',
  'правда ли',
  'это правда',
  'проверь',
  'подтверди',
  'по данным',
  'источник',
];

const FACTUAL_LOOKUP_TERMS = [
  'who is',
  'who was',
  'who are',
  'what is',
  'what are',
  'what was',
  'what were',
  'when did',
  'when was',
  'when is',
  'where is',
  'where was',
  'how many',
  'how much',
  'tell me about',
  'explain',
  'define',
  'definition of',
  'meaning of',
  'compare',
  'difference between',
  'history of',
  'biography of',
  'what does',
  'кто такой',
  'кто такая',
  'кто такие',
  'что такое',
  'что значит',
  'когда',
  'где',
  'сколько',
  'расскажи о',
  'объясни',
  'определение',
  'история',
  'биография',
  'в чем разница',
];

const QUESTION_START =
  /^(who|whose|what|when|where|why|which|how|is|are|was|were|do|does|did|can|could|should|would|will|кто|что|когда|где|почему|зачем|как|какой|какая|какие|каких|сколько|можно|стоит|есть)(?![a-zа-я0-9])/i;

function isQuestion(message: string, normalized: string): boolean {
  return message.includes('?') || QUESTION_START.test(normalized);
}

/**
 * Produces the external research query. Only this string is ever sent to Exa;
 * conversation history, Brain passages and owner material are never included.
 */
export function buildWebSearchQuery(message: string): string {
  const filler =
    /^(please|can you|could you|would you|will you|tell me|about|расскажи|объясни|пожалуйста)[\s,]+/i;

  const explicit = extractExplicitWebQuery(message);
  let query = (explicit === null ? message : explicit).replace(/\s+/g, ' ').trim();

  for (let index = 0; index < 4; index += 1) {
    const next = query.replace(filler, '').trim();
    if (next === query) break;
    query = next;
  }

  return query.slice(0, WEB_SEARCH_MAX_QUERY_CHARS);
}

function decision(
  shouldSearch: boolean,
  reason: WebSearchReason,
  message: string,
  signals: string[],
  confidence: number,
  options: {
    query?: string;
    usedContext?: boolean;
    topicChanged?: boolean;
    explicitSource?: ExplicitWebSource | null;
  } = {}
): WebSearchDecision {
  return {
    shouldSearch,
    query: shouldSearch
      ? (options.query ?? buildWebSearchQuery(message)).slice(0, WEB_SEARCH_MAX_QUERY_CHARS)
      : '',
    reason,
    signals,
    confidence,
    usedContext: options.usedContext ?? false,
    topicChanged: options.topicChanged ?? false,
    explicitSource: options.explicitSource ?? null,
  };
}

export function decideWebSearch(input: WebSearchDecisionInput): WebSearchDecision {
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  const normalized = normalize(message);

  if (!normalized) return decision(false, 'ambiguous', message, [], 0);

  const explicitSource = detectExplicitSource(message);
  const contextual = buildContextualWebQuery({
    message,
    history: input.history,
    previousWebQuery: input.previousWebQuery,
  });
  const previousWebQuery =
    (input.previousWebQuery ?? findPreviousWebQuery(input.history) ?? '').trim();

  // An explicit source command wins over every heuristic. “Найди в Brain” or
  // “Найди в Media Archive” must not be hijacked by web search, and an explicit
  // web command must not be turned into a Brain/owner-tool request.
  if (explicitSource === 'web' || explicitSource === 'brain_web') {
    if (!contextual.query || contextual.query.length < 2) {
      return decision(false, 'ambiguous', message, ['explicit_web', 'empty_query'], 0.35, {
        explicitSource,
      });
    }
    return decision(
      true,
      explicitSource === 'brain_web' ? 'explicit_brain_web' : 'explicit_web',
      message,
      [
        'explicit_web',
        ...(explicitSource === 'brain_web' ? ['combined:brain_web'] : []),
        ...(contextual.usedContext ? ['previous_web_context'] : []),
        ...(contextual.topicChanged ? ['topic_switch'] : []),
      ],
      0.98,
      {
        query: contextual.query,
        usedContext: contextual.usedContext,
        topicChanged: contextual.topicChanged,
        explicitSource,
      }
    );
  }

  if (explicitSource === 'brain') {
    return decision(false, 'explicit_brain', message, ['explicit_brain'], 0.98, {
      explicitSource,
    });
  }

  if (explicitSource === 'media') {
    return decision(false, 'explicit_media', message, ['explicit_media'], 0.98, {
      explicitSource,
    });
  }

  // A follow-up after a previous web search keeps the same public topic even
  // when the user does not repeat “в интернете”.
  if (previousWebQuery && (isWebFollowUp(message) || isTopicSwitch(message))) {
    if (contextual.query && contextual.query.length >= 2) {
      return decision(true, 'web_follow_up', message, ['web_follow_up', 'previous_web_context'], 0.88, {
        query: contextual.query,
        usedContext: contextual.usedContext,
        topicChanged: contextual.topicChanged,
        explicitSource,
      });
    }
  }

  if (GREETING_EXACT.test(normalized) || hasAny(normalized, CASUAL_META_TERMS)) {
    return decision(false, 'greeting', message, ['casual'], 0.05, { explicitSource });
  }

  const hasHistory = Boolean(input.history && input.history.length > 0);

  if (hasHistory && FOLLOW_UP_EXACT.test(normalized)) {
    return decision(false, 'follow_up', message, ['history_follow_up'], 0.1, {
      explicitSource,
    });
  }

  const currentEvents =
    hasAny(normalized, CURRENT_EVENT_STRONG_TERMS) || hasAny(normalized, CURRENT_EVENT_WEAK_TERMS);
  const verification = hasAny(normalized, VERIFICATION_TERMS);
  const personalBrain = hasAny(normalized, PERSONAL_BRAIN_TERMS);
  const ownerBrain = hasAny(normalized, OWNER_BRAIN_TERMS);
  const writingRequest = hasAny(normalized, WRITING_REQUEST_TERMS);
  const factualLookup = isQuestion(message, normalized) && hasAny(normalized, FACTUAL_LOOKUP_TERMS);

  const signals: string[] = [];
  if (currentEvents) signals.push('current_events');
  if (verification) signals.push('verification');
  if (personalBrain) signals.push('personal_brain');
  if (ownerBrain) signals.push('owner_brain');
  if (writingRequest) signals.push('writing_request');
  if (factualLookup) signals.push('factual_lookup');

  // External verification wins over owner/personal scope: the answer can compare
  // what Brain says with what the world currently says.
  if (personalBrain && !currentEvents && !verification) {
    return decision(false, 'personal_brain', message, signals, 0.2);
  }

  if (ownerBrain && !currentEvents && !verification) {
    return decision(false, 'owner_brain', message, signals, 0.2);
  }

  if (writingRequest && !currentEvents && !verification) {
    return decision(false, 'writing_request', message, signals, 0.15);
  }

  if (currentEvents) {
    return decision(true, 'current_events', message, signals, 0.9);
  }

  if (verification) {
    return decision(true, 'verification', message, signals, 0.85);
  }

  if (factualLookup) {
    return decision(true, 'factual_lookup', message, signals, 0.7);
  }

  // Ambiguous questions use model knowledge. External verification is not
  // assumed to improve every conversational turn.
  return decision(false, 'ambiguous', message, signals, 0.25);
}
