/**
 * Client-safe parsing of the /api/pierrot-web JSON contract.
 *
 * Owner chat can opt into SSE with `stream: true`; the completed event carries
 * this same JSON shape. Non-streaming consumers (Telegram, public chat and the
 * legacy JSON path) continue to use the parser unchanged.
 */

export type BrainAnswerSource = {
  documentId: string | null;
  documentTitle: string | null;
  sourceType: string | null;
  sourceClass: string | null;
  sourceDomain: string | null;
  author: string | null;
  publishedAt: string | null;
  heading: string | null;
  excerpt: string | null;
  canonicalUrl: string | null;
  similarity: number | null;
  verificationStatus: string | null;
};

export type WebAnswerSource = {
  index: number | null;
  title: string | null;
  url: string | null;
  domain: string | null;
  publishedAt: string | null;
  author: string | null;
  excerpt: string | null;
};

export type SourceBundle = {
  brain: BrainAnswerSource[];
  web: WebAnswerSource[];
  outcome: string | null;
  code: string | null;
  mode: string | null;
  sourceStatus: Record<string, unknown> | null;
};

export type ParsedPierrotResponse = {
  reply: string | null;
  conversationId: string | null;
  sessionId: string | null;
  historyId: string | null;
  episodeId: string | null;
  assistantMessageId: string | null;
  provider: string | null;
  model: string | null;
  answerLabel: string | null;
  recorded: boolean;
  sources: SourceBundle;
  groomingPlan: import('@/lib/pierrot/grooming/types').GroomingPlanView | null;
  error: string | null;
  code: string | null;
  retryAfter: number | null;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function number(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function safeSourceUrl(value: unknown): string | null {
  const url = text(value);
  if (!url) return null;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  if (/^https?:\/\//i.test(url)) return url;
  return null;
}

function stringList(value: unknown, limit = 20): string[] {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .map((item) => item.slice(0, 1_000))
        .slice(0, limit)
    : [];
}

function parseGroomingPlan(
  value: unknown
): import('@/lib/pierrot/grooming/types').GroomingPlanView | null {
  const root = asRecord(value);
  if (!root || !Array.isArray(root.proposals)) return null;
  const auditId = text(root.auditId);
  if (!auditId) return null;
  const scope = text(root.scope) || 'all';
  const proposals = root.proposals
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      id: text(entry.id) || '',
      ordinal: number(entry.ordinal) || 0,
      operation: text(entry.operation) || 'update_task',
      title: text(entry.title) || '',
      reason: text(entry.reason) || '',
      expectedResult: text(entry.expectedResult) || '',
      risk:
        entry.risk === 'safe' || entry.risk === 'reversible'
          ? entry.risk
          : ('confirmation' as const),
      projectName: text(entry.projectName),
      sourceRefs: Array.isArray(entry.sourceRefs)
        ? entry.sourceRefs
            .map((ref) => asRecord(ref))
            .filter((ref): ref is Record<string, unknown> => Boolean(ref))
            .slice(0, 4)
            .map((ref) => ({
              type: text(ref.type) || 'workspace_rule',
              id: text(ref.id),
              title: text(ref.title),
              url: safeSourceUrl(ref.url),
              quote: text(ref.quote),
              createdAt: text(ref.createdAt),
              metadata: null,
            }))
        : [],
    }))
    .filter((entry) => entry.id && entry.ordinal > 0 && entry.title)
    .slice(0, 80);

  return {
    auditId,
    scope: scope as import('@/lib/pierrot/grooming/types').GroomingScope,
    proposals: proposals as import('@/lib/pierrot/grooming/types').GroomingPlanViewProposal[],
    warnings: stringList(root.warnings, 10),
    ambiguous: stringList(root.ambiguous, 20),
  };
}

export function parsePierrotResponse(payload: unknown): ParsedPierrotResponse {
  const root = asRecord(payload) || {};
  const rag = asRecord(root.rag);
  const rawBrainSources = Array.isArray(rag?.sources) ? rag?.sources : [];
  const web = asRecord(root.web);
  const rawWebSources = Array.isArray(web?.sources) ? web?.sources : [];
  const answerSources = asRecord(root.answerSources);

  const brain: BrainAnswerSource[] = rawBrainSources
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      documentId: text(entry.documentId),
      documentTitle: text(entry.documentTitle),
      sourceType: text(entry.sourceType),
      sourceClass: text(entry.sourceClass),
      sourceDomain: text(entry.sourceDomain),
      author: text(entry.author),
      publishedAt: text(entry.publishedAt),
      heading: text(entry.heading),
      excerpt: text(entry.excerpt),
      canonicalUrl: safeSourceUrl(entry.canonicalUrl),
      similarity: number(entry.similarity),
      verificationStatus: text(entry.verificationStatus),
    }))
    .slice(0, 30);

  const webSources: WebAnswerSource[] = rawWebSources
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      index: number(entry.index),
      title: text(entry.title),
      url: safeSourceUrl(entry.url),
      domain: text(entry.domain),
      publishedAt: text(entry.publishedAt),
      author: text(entry.author),
      excerpt: text(entry.excerpt),
    }))
    .slice(0, 30);

  return {
    reply: text(root.reply),
    conversationId: text(root.conversationId),
    sessionId: text(root.sessionId),
    historyId: text(root.historyId),
    episodeId: text(root.episodeId),
    assistantMessageId: text(root.assistantMessageId),
    provider: text(root.provider),
    model: text(root.model),
    answerLabel: text(answerSources?.label),
    recorded: root.recorded === true,
    sources: {
      brain,
      web: webSources,
      outcome: text(rag?.outcome),
      code: text(rag?.code),
      mode: text(rag?.mode),
      sourceStatus: asRecord(root.sourceStatus),
    },
    groomingPlan: parseGroomingPlan(root.grooming_plan),
    error: text(root.error),
    code: text(root.code),
    retryAfter: number(root.retryAfter),
  };
}

export function sourceTypeLabel(source: BrainAnswerSource): string {
  const type = source.sourceType || source.sourceClass || 'источник';

  switch (type) {
    case 'article':
      return 'статья';
    case 'pdf':
      return 'PDF';
    case 'txt':
      return 'TXT';
    case 'text':
      return 'заметка';
    case 'media_coverage':
      return 'медиа';
    case 'manuscript':
      return 'рукопись';
    case 'personal_writing':
      return 'личный текст';
    case 'art_project':
      return 'арт-проект';
    case 'biography':
      return 'биография';
    case 'research':
      return 'исследование';
    default:
      return type;
  }
}

export function retrievalStateLabel(outcome: string | null, code: string | null): string {
  if (!outcome) return 'состояние не передано';

  switch (outcome) {
    case 'relevant_results':
      return 'источники найдены';
    case 'weak_match':
      return 'слабое совпадение';
    case 'no_match':
      return 'совпадений нет';
    case 'partial_results':
      return 'частичный результат';
    case 'unavailable':
      if (code === 'timeout' || code === 'embedding_timeout') return 'поиск не ответил вовремя';
      if (code === 'unauthorized_scope') return 'нет доступа к источникам';
      if (code === 'missing_configuration' || code === 'disabled')
        return 'поиск источников не настроен';
      if (code === 'database_unavailable') return 'база источников недоступна';
      return 'поиск недоступен';
    default:
      return outcome;
  }
}

export function totalSourceCount(bundle: SourceBundle): number {
  return bundle.brain.length + bundle.web.length;
}
