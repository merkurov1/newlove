/**
 * Deterministic classification of owner corrections and negative feedback.
 *
 * The goal is not to guess the owner's mood. It is to separate a factual error
 * from a context loss, an entity confusion, a wrong tool or a formatting
 * complaint so the same failure can become a regression test.
 */

export type FeedbackErrorCategory =
  | 'WRONG_FACT'
  | 'HALLUCINATION'
  | 'WRONG_SOURCE'
  | 'CONTEXT_LOSS'
  | 'CROSS_SESSION_FAILURE'
  | 'ENTITY_CONFUSION'
  | 'INTENT_MISMATCH'
  | 'WRONG_TOOL'
  | 'INCOMPLETE_ANSWER'
  | 'REPETITION'
  | 'WRONG_FORMAT'
  | 'RENDERING_FAILURE'
  | 'ANALYTICS_ERROR'
  | 'PERIOD_ERROR'
  | 'PERFORMANCE_ERROR'
  | 'TIMEZONE_ERROR'
  | 'OTHER';

export const FEEDBACK_ERROR_CATEGORIES: FeedbackErrorCategory[] = [
  'WRONG_FACT',
  'HALLUCINATION',
  'WRONG_SOURCE',
  'CONTEXT_LOSS',
  'CROSS_SESSION_FAILURE',
  'ENTITY_CONFUSION',
  'INTENT_MISMATCH',
  'WRONG_TOOL',
  'INCOMPLETE_ANSWER',
  'REPETITION',
  'WRONG_FORMAT',
  'RENDERING_FAILURE',
  'ANALYTICS_ERROR',
  'PERIOD_ERROR',
  'PERFORMANCE_ERROR',
  'TIMEZONE_ERROR',
  'OTHER',
];

export type FeedbackClassification = {
  category: FeedbackErrorCategory;
  confidence: number;
  signals: string[];
  /** A factual correction is not a durable preference. */
  correctionKind: 'FACT' | 'PREFERENCE' | 'REQUEST';
  rootCause: string;
};

type Trace = Record<string, unknown> | null | undefined;

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s'"-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function traceString(trace: Trace, key: string): string {
  const value = trace && typeof trace === 'object' ? trace[key] : undefined;
  return typeof value === 'string' ? value : '';
}

const RULES: Array<{
  category: FeedbackErrorCategory;
  patterns: RegExp[];
  signal: string;
  rootCause: string;
}> = [
  {
    category: 'HALLUCINATION',
    patterns: [
      /выдумал|выдумала|придумал|придумала|фантазир|галлюцин|с потолка|из головы/i,
      /made (?:that|this|it) up|invented|hallucinat|fabricat/i,
    ],
    signal: 'invented_content',
    rootCause: 'generation_without_evidence',
  },
  {
    category: 'CROSS_SESSION_FAILURE',
    patterns: [
      /в другом (?:чате|диалоге|разговоре)|другой чат|другом диалоге|из другого чата/i,
      /another (?:chat|conversation)|different conversation|separate chat|cross[- ]session/i,
    ],
    signal: 'cross_session_reference',
    rootCause: 'retrieval_scope_too_narrow',
  },
  {
    category: 'ENTITY_CONFUSION',
    patterns: [
      /книг[аиу].{0,40}проект|проект.{0,40}книг[аиу]/i,
      /это (?:книга|проект),? а не (?:проект|книга)/i,
      /перепутал.{0,40}(?:книг|проект|сущност|entity)/i,
      /(?:book|project).{0,40}(?:not|instead of).{0,40}(?:project|book)/i,
      /wrong entity|entity confusion|two different (?:things|entities)/i,
    ],
    signal: 'entity_confusion',
    rootCause: 'name_resolved_without_type',
  },
  {
    category: 'WRONG_SOURCE',
    patterns: [
      /не тот источник|не из того источника|не в той базе|не та база/i,
      /по базе (?:медиа|media),? а не (?:brain|мозг)|not brain|wrong source|wrong database/i,
    ],
    signal: 'wrong_source',
    rootCause: 'source_routing_mismatch',
  },
  {
    category: 'TIMEZONE_ERROR',
    patterns: [
      /часовой пояс|таймзон|timezone|time zone|не тот день|неправильн\w* (?:дата|время)/i,
      /gmt|utc|по москве|midnight|полночь/i,
    ],
    signal: 'timezone_or_day_boundary',
    rootCause: 'event_time_vs_ingestion_or_zone',
  },
  {
    category: 'CONTEXT_LOSS',
    patterns: [
      /не помнишь|забыл|потерял контекст|мы (?:же )?(?:это )?обсуждали|я (?:же )?(?:говорил|писал|просил)/i,
      /you forgot|lost context|we discussed|i already (?:said|told|asked)/i,
    ],
    signal: 'context_lost',
    rootCause: 'history_not_retrieved',
  },
  {
    category: 'INTENT_MISMATCH',
    patterns: [
      /я (?:же )?(?:просил|спрашивал) (?:не|другое|о другом)|не то,? что я (?:просил|спрашивал)|неправильно понял/i,
      /not what i asked|misunderstood|i asked for something else/i,
    ],
    signal: 'intent_mismatch',
    rootCause: 'intent_classification_error',
  },
  {
    category: 'WRONG_TOOL',
    patterns: [
      /не ту(?:ю)? (?:статистик|аналитик|инструмент|команду)|зачем (?:ты )?(?:показал|вывел) (?:аналитик|статистик)/i,
      /неверн\w*\s+(?:инструмент|тул)|не\s+просил\w*\s+(?:аналитик|статистик)|не\s+та\s+(?:аналитик|статистик)/i,
      /wrong tool|wrong analytics|incorrect tool|i did not ask for analytics|show(?:ed)? analytics/i,
    ],
    signal: 'wrong_tool',
    rootCause: 'tool_routing_error',
  },
  {
    category: 'INCOMPLETE_ANSWER',
    patterns: [
      /неполн|не всё|не все|только часть|продолжи|а остальное|где остальное/i,
      /incomplete|not all|only part|continue|what about the rest/i,
    ],
    signal: 'incomplete_answer',
    rootCause: 'answer_truncated_or_partial_retrieval',
  },
  {
    category: 'REPETITION',
    patterns: [
      /повторяешь|одно и то же|ты уже (?:это )?(?:говорил|писал)|копируешь/i,
      /repeating|same answer|you already said|copying/i,
    ],
    signal: 'repetition',
    rootCause: 'repeat_question_not_reconciled',
  },
  {
    category: 'RENDERING_FAILURE',
    patterns: [
      /не отображается|не отрисовал|сломался интерфейс|пустой экран|пропал ответ|битая вёрстка/i,
      /not rendered|rendering failed|blank screen|broken layout|chart did not render/i,
    ],
    signal: 'rendering_failure',
    rootCause: 'structured_block_render_failure',
  },
  {
    category: 'ANALYTICS_ERROR',
    patterns: [
      /аналитик[а-яё]*\s+(?:сломалась|ошибка|не работает|упала)|данные\s+(?:не загрузились|не пришли)|отчёт\s+(?:не построился|упал)/i,
      /analytics\s+(?:failed|error|broken|crash)|report\s+(?:failed|did not build)/i,
    ],
    signal: 'analytics_failure',
    rootCause: 'analytics_pipeline_failure',
  },
  {
    category: 'PERIOD_ERROR',
    patterns: [
      /не тот период|неверн[а-яё]*\s+период|неправильн[а-яё]*\s+диапазон|взял[а-яё]*\s+не те даты|сравнил[а-яё]*\s+разные периоды/i,
      /wrong period|wrong date range|different period lengths|compared different periods/i,
    ],
    signal: 'period_semantics_error',
    rootCause: 'period_resolution_or_comparison_error',
  },
  {
    category: 'PERFORMANCE_ERROR',
    patterns: [
      /слишком долго|тормозит|зависа|не отвечает|таймаут|очень медленно/i,
      /too slow|freezes|hangs|timeout|timed out|takes forever/i,
    ],
    signal: 'performance_failure',
    rootCause: 'latency_or_resource_limit',
  },
  {
    category: 'WRONG_FORMAT',
    patterns: [
      /формат|таблиц|слишком длинн|слишком коротк|не нужн[аы] (?:список|таблиц|заголовк)/i,
      /wrong format|too long|too short|no (?:list|table|headings)/i,
    ],
    signal: 'wrong_format',
    rootCause: 'format_contract_mismatch',
  },
  {
    category: 'WRONG_FACT',
    patterns: [
      /неверн|неправильн|ошибк|неточн|это не так|факт/i,
      /wrong|incorrect|inaccurate|not true/i,
    ],
    signal: 'factual_error',
    rootCause: 'unsupported_or_stale_fact',
  },
];

/**
 * `correctionText` is optional because the current feedback event stores a
 * rating and a trace. When a later message contains the correction, the same
 * classifier can be reused for it.
 */
export function classifyFeedback(input: {
  rating?: 'up' | 'down' | null;
  correctionText?: string | null;
  trace?: Trace;
}): FeedbackClassification | null {
  if (input.rating === 'up') return null;

  const text = normalize(input.correctionText || '');
  const trace = input.trace;

  if (!text && !trace) return null;

  // A low rating without a correction is still a signal, but not a category.
  if (!text && input.rating === 'down') {
    return {
      category: 'OTHER',
      confidence: 0.35,
      signals: ['negative_rating_without_text'],
      correctionKind: 'REQUEST',
      rootCause: 'unclassified_negative_feedback',
    };
  }

  for (const rule of RULES) {
    if (rule.patterns.some((pattern) => pattern.test(text))) {
      return {
        category: rule.category,
        confidence: 0.82,
        signals: [rule.signal],
        correctionKind: rule.category === 'WRONG_FORMAT' ? 'PREFERENCE' : 'FACT',
        rootCause: rule.rootCause,
      };
    }
  }

  // Trace-based fallbacks. These never override an explicit correction.
  const brainOutcome = traceString(trace, 'brain_outcome');
  const intent = traceString(trace, 'intent');
  const ownerTool = traceString(trace, 'owner_tool');
  const taskIntent = traceString(trace, 'task_intent');

  if (brainOutcome === 'no_match' || brainOutcome === 'weak_match') {
    return {
      category: 'CONTEXT_LOSS',
      confidence: 0.55,
      signals: [`brain_outcome:${brainOutcome}`],
      correctionKind: 'FACT',
      rootCause: 'retrieval_returned_no_usable_evidence',
    };
  }

  if (intent === 'analytics' && /history|histor|обсужда|discuss/i.test(text)) {
    return {
      category: 'WRONG_TOOL',
      confidence: 0.6,
      signals: [`intent:${intent}`],
      correctionKind: 'FACT',
      rootCause: 'analytics_tool_for_history_question',
    };
  }

  if (ownerTool && taskIntent && taskIntent !== ownerTool) {
    return {
      category: 'WRONG_TOOL',
      confidence: 0.5,
      signals: ['owner_tool_task_intent_mismatch'],
      correctionKind: 'FACT',
      rootCause: 'tool_selection_mismatch',
    };
  }

  return {
    category: 'OTHER',
    confidence: 0.4,
    signals: ['no_rule_matched'],
    correctionKind: 'REQUEST',
    rootCause: 'unclassified_feedback',
  };
}

export function feedbackCategoryLabel(
  category: FeedbackErrorCategory,
  language: 'ru' | 'en' = 'ru'
): string {
  const ru: Record<FeedbackErrorCategory, string> = {
    WRONG_FACT: 'Неверный факт',
    HALLUCINATION: 'Выдуманный ответ',
    WRONG_SOURCE: 'Неверный источник',
    CONTEXT_LOSS: 'Потеря контекста',
    CROSS_SESSION_FAILURE: 'Не найден другой диалог',
    ENTITY_CONFUSION: 'Смешение сущностей',
    INTENT_MISMATCH: 'Неверно понятый запрос',
    WRONG_TOOL: 'Неверный инструмент',
    INCOMPLETE_ANSWER: 'Неполный ответ',
    REPETITION: 'Повтор',
    WRONG_FORMAT: 'Неверный формат',
    RENDERING_FAILURE: 'Ошибка отображения',
    ANALYTICS_ERROR: 'Ошибка аналитики',
    PERIOD_ERROR: 'Неверный период',
    PERFORMANCE_ERROR: 'Медленный ответ',
    TIMEZONE_ERROR: 'Ошибка времени/часового пояса',
    OTHER: 'Другое',
  };
  const en: Record<FeedbackErrorCategory, string> = {
    WRONG_FACT: 'Wrong fact',
    HALLUCINATION: 'Hallucination',
    WRONG_SOURCE: 'Wrong source',
    CONTEXT_LOSS: 'Context loss',
    CROSS_SESSION_FAILURE: 'Cross-session failure',
    ENTITY_CONFUSION: 'Entity confusion',
    INTENT_MISMATCH: 'Intent mismatch',
    WRONG_TOOL: 'Wrong tool',
    INCOMPLETE_ANSWER: 'Incomplete answer',
    REPETITION: 'Repetition',
    WRONG_FORMAT: 'Wrong format',
    RENDERING_FAILURE: 'Rendering failure',
    ANALYTICS_ERROR: 'Analytics error',
    PERIOD_ERROR: 'Wrong period',
    PERFORMANCE_ERROR: 'Slow response',
    TIMEZONE_ERROR: 'Timezone error',
    OTHER: 'Other',
  };
  return language === 'ru' ? ru[category] : en[category];
}

export type FeedbackRegressionCase = {
  id: string;
  category: FeedbackErrorCategory;
  originalQuestion: string | null;
  failedAnswer: string | null;
  correction: string | null;
  rootCause: string;
  expectedBehavior: string;
  createdAt: string;
};

/**
 * Converts a classified correction into the fixture shape used by the
 * regression suite. This is deliberately pure: persisting the case is the
 * caller's decision, so ordinary chat never writes test fixtures.
 */
export function toRegressionCase(input: {
  id: string;
  classification: FeedbackClassification;
  originalQuestion?: string | null;
  failedAnswer?: string | null;
  correction?: string | null;
  now?: Date;
}): FeedbackRegressionCase {
  const expected: Record<FeedbackErrorCategory, string> = {
    WRONG_FACT: 'Answer only from retrieved evidence; state the source or say it is unknown.',
    HALLUCINATION: 'Do not invent content; say when retrieval is empty.',
    WRONG_SOURCE: 'Use the requested source and disclose when it is unavailable.',
    CONTEXT_LOSS: 'Retrieve relevant earlier messages before answering.',
    CROSS_SESSION_FAILURE: 'Search all related conversations and preserve source references.',
    ENTITY_CONFUSION: 'Resolve the entity type and present ambiguous candidates separately.',
    INTENT_MISMATCH: 'Classify the requested operation before calling a tool.',
    WRONG_TOOL: 'Route the request to the subsystem matching the intent.',
    INCOMPLETE_ANSWER: 'Cover every part of the request or name the missing part.',
    REPETITION: 'Continue from the previous answer instead of repeating it.',
    WRONG_FORMAT: 'Follow the requested format and length.',
    RENDERING_FAILURE: 'Validate the structured payload and render a safe Markdown fallback.',
    ANALYTICS_ERROR: 'Report the failing source and correlation id; never return a misleading zero.',
    PERIOD_ERROR: 'Resolve the requested period explicitly and compare equal-length windows.',
    PERFORMANCE_ERROR: 'Bound latency, reuse cached context and avoid duplicate retrieval.',
    TIMEZONE_ERROR: 'Apply the explicit timezone and distinguish event time from ingestion time.',
    OTHER: 'Investigate the failure and add a targeted regression case.',
  };

  return {
    id: input.id,
    category: input.classification.category,
    originalQuestion: input.originalQuestion?.slice(0, 4_000) || null,
    failedAnswer: input.failedAnswer?.slice(0, 8_000) || null,
    correction: input.correction?.slice(0, 4_000) || null,
    rootCause: input.classification.rootCause,
    expectedBehavior: expected[input.classification.category],
    createdAt: (input.now || new Date()).toISOString(),
  };
}
