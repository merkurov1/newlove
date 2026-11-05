import { understandPierrotQuery, type PierrotQueryPlan } from '@/lib/pierrot/queryUnderstanding';
import { detectOwnerTool, type OwnerToolRequest } from '@/lib/pierrot/ownerTools';

export type PierrotOperation =
  | 'brain.search'
  | 'brain.document'
  | 'brain.stats'
  | 'media.search'
  | 'media.stats'
  | 'commercial.report'
  | 'analytics.report'
  | 'graph.report'
  | 'system.health'
  | 'system.stats'
  | 'web.search'
  | 'brain_web.search'
  | 'clarify.publications'
  | 'general';

export type PierrotFallbackPolicy =
  'brain_then_web_only_when_explicit' | 'media_then_web' | 'no_source_substitution' | 'none';

export type PierrotExecutionPlan = {
  queryPlan: PierrotQueryPlan;
  operation: PierrotOperation;
  tool: string;
  ownerOnly: boolean;
  requiresWeb: boolean;
  requiresConversationContext: boolean;
  fallbackPolicy: PierrotFallbackPolicy;
  status: 'planned';
  ownerTool: OwnerToolRequest | null;
  searchQuery: string;
};

type HistoryItem = { role: 'user' | 'assistant'; content: string };

const SEARCH_VERBS =
  /(найди|поищи|найти|искать|покажи|выведи|подбери|find|search|show me|look for)/i;
const STATS_TERMS =
  /(статистик|stats|statistics|состояни|status|state|индекс|index|очеред|queue|сколько\s+(документ|фрагмент|chunk|chunks|источник)|health|диагностик|diagnostic)/i;
const MEDIA_STATS_TERMS =
  /(media\s+(archive\s+)?(stats|statistics|status)|статистик[а-яё]*\s+(медиа|сми|media)|состояни[а-яё]*\s+(медиа|сми|media)|сколько[^?.!]*(медиа|media|сми|публикац))/i;

function searchQueryFor(message: string, followUp: boolean): string {
  if (!followUp) return message.trim();

  return message
    .replace(/^(а|и|но|and|but|so)\s+/i, '')
    .replace(/^(а\s+)?(теперь|за|есть|только|now|for)\s+/i, '')
    .replace(/^(and\s+now|and\s+for)\s+/i, '')
    .trim();
}

function operationForIntent(plan: PierrotQueryPlan): {
  operation: PierrotOperation;
  tool: string;
  ownerOnly: boolean;
  fallbackPolicy: PierrotFallbackPolicy;
} {
  switch (plan.intent) {
    case 'document_lookup':
      return {
        operation: 'brain.document',
        tool: 'brain',
        ownerOnly: true,
        fallbackPolicy: 'no_source_substitution',
      };
    case 'media_mentions':
      return {
        operation: 'media.search',
        tool: 'media',
        ownerOnly: false,
        fallbackPolicy: 'media_then_web',
      };
    case 'commercial':
      return {
        operation: 'commercial.report',
        tool: 'commercial',
        ownerOnly: true,
        fallbackPolicy: 'no_source_substitution',
      };
    case 'knowledge_graph':
      return {
        operation: 'graph.report',
        tool: 'graph',
        ownerOnly: true,
        fallbackPolicy: 'no_source_substitution',
      };
    case 'analytics':
      return {
        operation: 'analytics.report',
        tool: 'analytics',
        ownerOnly: true,
        fallbackPolicy: 'no_source_substitution',
      };
    case 'web_research':
      return {
        operation: 'web.search',
        tool: 'web',
        ownerOnly: false,
        fallbackPolicy: 'none',
      };
    case 'brain_web_research':
      return {
        operation: 'brain_web.search',
        tool: 'brain+web',
        ownerOnly: true,
        fallbackPolicy: 'brain_then_web_only_when_explicit',
      };
    case 'biography':
    case 'personal_analysis':
    case 'views_over_time':
    case 'project':
      return {
        operation: 'brain.search',
        tool: 'brain',
        ownerOnly: true,
        fallbackPolicy: 'no_source_substitution',
      };
    default:
      return {
        operation: 'general',
        tool: 'model',
        ownerOnly: false,
        fallbackPolicy: 'none',
      };
  }
}

/**
 * Resolves the existing query understanding and owner-tool detection into one
 * execution plan. It does not call any source and does not replace the route's
 * existing retrieval/commercial/media implementations.
 */
export function buildPierrotExecutionPlan(
  message: string,
  options: {
    history?: HistoryItem[];
    queryPlan?: PierrotQueryPlan;
    ownerMode?: boolean;
  } = {}
): PierrotExecutionPlan {
  const queryPlan =
    options.queryPlan ??
    understandPierrotQuery(message, {
      history: options.history,
    });

  let ownerTool = detectOwnerTool(message, { queryPlan });
  const resolved = operationForIntent(queryPlan);
  const searchVerb = SEARCH_VERBS.test(message);
  const statsTerms = STATS_TERMS.test(message);
  const mediaStats = MEDIA_STATS_TERMS.test(message);
  const explicitWebIntent =
    queryPlan.intent === 'web_research' || queryPlan.intent === 'brain_web_research';

  // An explicit web source command has absolute priority. Owner tools and the
  // generic owner searchVerb heuristic must not intercept it.
  if (explicitWebIntent) {
    ownerTool = null;
    resolved.operation =
      queryPlan.intent === 'brain_web_research' ? 'brain_web.search' : 'web.search';
    resolved.tool = queryPlan.intent === 'brain_web_research' ? 'brain+web' : 'web';
    resolved.ownerOnly = false;
    resolved.fallbackPolicy =
      queryPlan.intent === 'brain_web_research'
        ? 'brain_then_web_only_when_explicit'
        : 'none';
  }

  // "RAG", "Brain" and "Media" are source names, not statistics commands by
  // themselves. Search verbs win unless the message also asks for status.
  if (
    !explicitWebIntent &&
    ownerTool &&
    (ownerTool.kind === 'rag' || ownerTool.kind === 'brain') &&
    searchVerb &&
    !statsTerms
  ) {
    ownerTool = null;
    resolved.operation = 'brain.search';
    resolved.tool = 'brain';
    resolved.ownerOnly = true;
    resolved.fallbackPolicy = 'no_source_substitution';
  }

  if (ownerTool && !explicitWebIntent) {
    if (ownerTool.kind === 'commercial') {
      resolved.operation = 'commercial.report';
      resolved.tool = 'commercial';
      resolved.ownerOnly = true;
      resolved.fallbackPolicy = 'no_source_substitution';
    } else if (ownerTool.kind === 'analytics') {
      const mediaSearch = queryPlan.intent === 'media_mentions' && !mediaStats;
      resolved.operation = mediaStats
        ? 'media.stats'
        : mediaSearch
          ? 'media.search'
          : 'analytics.report';
      resolved.tool = mediaStats || mediaSearch ? 'media' : 'analytics';
      resolved.ownerOnly = true;
      resolved.fallbackPolicy = 'no_source_substitution';
    } else if (ownerTool.kind === 'rag' || ownerTool.kind === 'brain') {
      resolved.operation = 'brain.stats';
      resolved.tool = 'brain';
      resolved.ownerOnly = true;
      resolved.fallbackPolicy = 'no_source_substitution';
    } else if (ownerTool.kind === 'graph') {
      resolved.operation = 'graph.report';
      resolved.tool = 'graph';
      resolved.ownerOnly = true;
      resolved.fallbackPolicy = 'no_source_substitution';
    } else if (ownerTool.kind === 'diagnostics') {
      resolved.operation = 'system.health';
      resolved.tool = 'diagnostics';
      resolved.ownerOnly = true;
      resolved.fallbackPolicy = 'no_source_substitution';
    } else if (ownerTool.kind === 'stats') {
      const brainStats = /(brain|rag|мозг)/i.test(message);
      resolved.operation = brainStats ? 'brain.stats' : 'system.stats';
      resolved.tool = brainStats ? 'brain' : 'stats';
      resolved.ownerOnly = true;
      resolved.fallbackPolicy = 'no_source_substitution';
    } else if (ownerTool.kind === 'research') {
      resolved.operation = 'graph.report';
      resolved.tool = 'research';
      resolved.ownerOnly = true;
      resolved.fallbackPolicy = 'no_source_substitution';
    }
  }

  if (
    !explicitWebIntent &&
    options.ownerMode &&
    resolved.operation === 'general' &&
    searchVerb
  ) {
    resolved.operation = 'brain.search';
    resolved.tool = 'brain';
    resolved.ownerOnly = true;
    resolved.fallbackPolicy = 'no_source_substitution';
  }

  if (
    options.ownerMode &&
    resolved.operation === 'general' &&
    /сколько\s+(?:у\s+меня\s+)?публикац/i.test(message)
  ) {
    resolved.operation = 'clarify.publications';
    resolved.tool = 'clarify';
    resolved.ownerOnly = true;
    resolved.fallbackPolicy = 'none';
  }

  return {
    queryPlan,
    operation: resolved.operation,
    tool: resolved.tool,
    ownerOnly: resolved.ownerOnly,
    requiresWeb:
      queryPlan.sources.web ||
      resolved.operation === 'web.search' ||
      resolved.operation === 'brain_web.search',
    requiresConversationContext: queryPlan.followUp || queryPlan.correction,
    fallbackPolicy: resolved.fallbackPolicy,
    status: 'planned',
    ownerTool,
    searchQuery: searchQueryFor(queryPlan.originalQuery, queryPlan.followUp),
  };
}
