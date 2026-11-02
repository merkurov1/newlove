import { WEB_SEARCH_MAX_QUERY_CHARS } from './config';

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
  | 'ambiguous';

export type WebSearchDecision = {
  shouldSearch: boolean;
  query: string;
  reason: WebSearchReason;
  signals: string[];
  confidence: number;
};

export type WebSearchDecisionInput = {
  message: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
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

  let query = message.replace(/\s+/g, ' ').trim();

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
  confidence: number
): WebSearchDecision {
  return {
    shouldSearch,
    query: shouldSearch ? buildWebSearchQuery(message) : '',
    reason,
    signals,
    confidence,
  };
}

export function decideWebSearch(input: WebSearchDecisionInput): WebSearchDecision {
  const message = typeof input.message === 'string' ? input.message.trim() : '';
  const normalized = normalize(message);

  if (!normalized) return decision(false, 'ambiguous', message, [], 0);

  if (GREETING_EXACT.test(normalized) || hasAny(normalized, CASUAL_META_TERMS)) {
    return decision(false, 'greeting', message, ['casual'], 0.05);
  }

  const hasHistory = Boolean(input.history && input.history.length > 0);

  if (hasHistory && FOLLOW_UP_EXACT.test(normalized)) {
    return decision(false, 'follow_up', message, ['history_follow_up'], 0.1);
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
