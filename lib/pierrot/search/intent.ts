/**
 * Pure detection for the owner-wide search. It decides only that the owner
 * wants to find material across conversations and knowledge stores. It never
 * calls a model, Exa, GitHub or the database.
 */

export type UnifiedSearchScope =
  | 'all'
  | 'conversations'
  | 'tasks'
  | 'decisions'
  | 'documents'
  | 'issues';

export type UnifiedSearchIntent = {
  scope: UnifiedSearchScope;
  query: string;
  /** The owner explicitly asked for the result, not for a web search. */
  explicit: boolean;
};

const ALL_PATTERNS = [
  /^(?:найди|поищи|покажи)\s+(?:мне\s+)?(?:всё|все)[\s,]+(?:что|где)\s*(?:мы\s+)?/iu,
  /^(?:найди|поищи|покажи)\s+(?:мне\s+)?(?:все\s+)?(?:материалы|заметки|обсуждения|упоминания)\s*(?:по|про|об|о)?\s*/iu,
  /^где\s+(?:мы\s+)?(?:это\s+)?обсуждали\s*/iu,
  /^где\s+(?:это\s+)?было\s+(?:в\s+)?(?:истории|диалогах|разговорах)\s*/iu,
  /^(?:find|search)\s+(?:everything|all)\s+(?:about|on|for)?\s*/iu,
  /^where\s+did\s+(?:we|i)\s+(?:discuss|talk about)\s*/iu,
];

const TASK_PATTERNS = [
  /^(?:какие|что)\s+(?:ещё\s+|еще\s+)?(?:задачи|задач)\s+(?:остались|есть|открыты)\s*(?:по|в|для|про)?\s*/iu,
  /^(?:покажи|найди)\s+(?:все\s+)?(?:задачи|задач)\s*(?:по|в|для|про)?\s*/iu,
  /^(?:what|which)\s+tasks\s+(?:are\s+)?(?:left|open|remaining)\s*(?:for|in|on)?\s*/iu,
];

const DECISION_PATTERNS = [
  /^(?:покажи|найди)\s+(?:последние\s+|все\s+)?решения\s*(?:по|в|для|про)?\s*/iu,
  /^(?:какие|что)\s+(?:мы\s+)?(?:решили|решали)\s*(?:по|в|для|про)?\s*/iu,
  /^(?:show|find)\s+(?:the\s+)?(?:latest|recent|all)?\s*decisions\s*(?:about|on|for)?\s*/iu,
];

const DOCUMENT_PATTERNS = [
  /^(?:найди|покажи)\s+(?:заметку|заметки|документ|документы|материал|материалы)\s*(?:о|об|по|про|в)?\s*/iu,
  /^(?:find|show)\s+(?:a\s+)?(?:note|document|material)s?\s*(?:about|on|in)?\s*/iu,
];

const ISSUE_PATTERNS = [
  /^(?:найди|покажи)\s+(?:github\s+)?(?:issues|issue|задач[уи]\s+github)\s*(?:о|об|по|про|в)?\s*/iu,
  /^(?:find|show)\s+(?:github\s+)?issues?\s*(?:about|on|for|in)?\s*/iu,
];

function stripPrefix(value: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (!match) continue;
    return value
      .slice(match[0].length)
      .replace(/^[\s:—–,.-]+/u, '')
      .replace(/^(?:что|где)\s+(?:мы\s+)?(?:обсуждали|говорили|решали)\s*(?:по|про|об|о)?\s*/iu, '')
      .replace(/^(?:обсуждали|говорили|решали)\s*(?:по|про|об|о)?\s*/iu, '')
      .replace(/^по\s+проекту\s+/iu, '')
      .replace(/^проект[аеу]?\s+/iu, '')
      .replace(/[\s.!?;:]+$/u, '')
      .trim();
  }
  return null;
}

export function detectUnifiedSearchIntent(message: string): UnifiedSearchIntent | null {
  const value = message.trim();
  if (!value) return null;

  if (ISSUE_PATTERNS.some((pattern) => pattern.test(value))) {
    return {
      scope: 'issues',
      query: stripPrefix(value, ISSUE_PATTERNS) || value,
      explicit: true,
    };
  }

  const taskQuery = stripPrefix(value, TASK_PATTERNS);
  if (taskQuery !== null) {
    return { scope: 'tasks', query: taskQuery || value, explicit: true };
  }

  const decisionQuery = stripPrefix(value, DECISION_PATTERNS);
  if (decisionQuery !== null) {
    return { scope: 'decisions', query: decisionQuery || value, explicit: true };
  }

  const documentQuery = stripPrefix(value, DOCUMENT_PATTERNS);
  if (documentQuery !== null) {
    return { scope: 'documents', query: documentQuery || value, explicit: true };
  }

  const allQuery = stripPrefix(value, ALL_PATTERNS);
  if (allQuery !== null) {
    return { scope: 'all', query: allQuery || value, explicit: true };
  }

  // “Найди всё, что мы обсуждали по Heart & Angel” is caught by the all
  // pattern after the prefix. A bare “по проекту X” without a search verb is
  // not a search request.
  return null;
}
