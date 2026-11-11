/**
 * Typed entity model for Pierrot projects and their works.
 *
 * This is not a second project system. A project is one entity type inside the
 * same model; the existing `pierrot_projects` row remains the canonical project
 * record. Entity aliases and relations make it possible to say that
 * UNFRAMED_PROJECT has a SOURCE_WORK (the book) without collapsing the two.
 */

export const PIERROT_ENTITY_TYPES = [
  'PROJECT',
  'WORK',
  'BOOK',
  'CHAPTER',
  'DOCUMENT',
  'MEDIA_ASSET',
  'VIDEO',
  'SERIES',
  'EPISODE',
  'WEBSITE',
  'PAGE',
  'PROPOSAL',
  'TASK',
  'EVENT',
  'DECISION',
  'CONVERSATION',
] as const;

export type PierrotEntityType = (typeof PIERROT_ENTITY_TYPES)[number];

export const PIERROT_ENTITY_RELATIONS = [
  'SOURCE_WORK',
  'HAS_SERIES',
  'HAS_VIDEO',
  'HAS_PAGE',
  'HAS_PROPOSAL',
  'HAS_CONVERSATION',
  'HAS_CHAPTER',
  'HAS_EDITION',
  'HAS_DELIVERABLE',
  'HAS_DOCUMENT',
  'HAS_TASK',
  'HAS_DECISION',
  'HAS_EVENT',
  'PUBLISHED_AS',
  'PART_OF',
  'RELATED_TO',
  'MENTIONED_IN',
] as const;

export type PierrotEntityRelationType = (typeof PIERROT_ENTITY_RELATIONS)[number];

export type PierrotEntity = {
  id: string;
  ownerUserId: string;
  entityType: PierrotEntityType;
  name: string;
  canonicalName: string;
  description: string;
  projectId: string | null;
  parentEntityId: string | null;
  status: string;
  aliases: string[];
  sourceRefs: unknown[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  /** Ephemeral project-backed entity, not a separate database row. */
  derivedFromProject?: boolean;
};

export type PierrotEntityRelation = {
  id: string;
  ownerUserId: string;
  fromEntityId: string;
  toEntityId: string;
  relationType: PierrotEntityRelationType;
  confidence: number;
  evidenceClass: string;
  sourceRefs: unknown[];
  createdAt: string;
};

export type EntityResolutionCandidate = {
  entity: PierrotEntity;
  score: number;
};

export type EntityResolution = {
  query: string;
  resolved: PierrotEntity | null;
  candidates: EntityResolutionCandidate[];
  ambiguous: boolean;
  reason: 'EXACT' | 'TYPE_HINT' | 'PROJECT_CONTEXT' | 'MULTIPLE_TYPES' | 'MULTIPLE_ENTITIES' | 'NO_MATCH';
};

export function normalizeEntityName(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[—–−-]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compact(value: string): string {
  return normalizeEntityName(value).replace(/\s+/g, '');
}

function tokens(value: string): string[] {
  return normalizeEntityName(value)
    .split(' ')
    .filter((token) => token.length >= 3);
}

function scoreName(entity: PierrotEntity, query: string): number {
  const target = normalizeEntityName(query);
  if (!target) return 0;

  const names = [entity.name, entity.canonicalName, ...entity.aliases]
    .map(normalizeEntityName)
    .filter(Boolean);
  const targetCompact = compact(query);

  let best = 0;
  for (const name of names) {
    if (name === target) best = Math.max(best, 1);
    else if (compact(name) === targetCompact) best = Math.max(best, 0.98);
    else if (name.startsWith(target) || target.startsWith(name)) best = Math.max(best, 0.86);
    else if (name.includes(target) || target.includes(name)) best = Math.max(best, 0.76);
  }

  if (best === 0) {
    const queryTokens = tokens(query);
    if (queryTokens.length >= 2) {
      const matched = queryTokens.filter((token) =>
        names.some((name) => name.includes(token))
      ).length;
      if (matched >= 2) best = 0.45 + (matched / queryTokens.length) * 0.25;
    }
  }

  return best;
}

/**
 * Deterministic entity resolution. A name shared by a BOOK and a PROJECT is
 * ambiguous, not an invitation to pick one silently. A type hint ("книга" or
 * "project") or a project context may legitimately break the tie.
 */
export function resolveEntityCandidates(input: {
  entities: PierrotEntity[];
  query: string;
  typeHint?: string | null;
  projectId?: string | null;
  limit?: number;
}): EntityResolution {
  const typeHint = input.typeHint ? input.typeHint.toUpperCase() : null;
  const limit = Math.min(Math.max(input.limit ?? 6, 1), 12);

  const candidates = input.entities
    .map((entity) => {
      let score = scoreName(entity, input.query);
      if (score <= 0) return null;

      if (typeHint && entity.entityType === typeHint) score += 0.08;
      else if (typeHint && entity.entityType !== typeHint) score -= 0.14;

      if (input.projectId && entity.projectId === input.projectId) score += 0.05;
      if (entity.status === 'archived') score -= 0.05;

      return { entity, score: Number(Math.max(0, Math.min(1, score)).toFixed(4)) };
    })
    .filter((candidate): candidate is EntityResolutionCandidate => candidate !== null)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.entity.name.localeCompare(right.entity.name) ||
        left.entity.id.localeCompare(right.entity.id)
    )
    .slice(0, limit);

  if (candidates.length === 0) {
    return {
      query: input.query,
      resolved: null,
      candidates: [],
      ambiguous: false,
      reason: 'NO_MATCH',
    };
  }

  const top = candidates[0];
  const close = candidates.filter(
    (candidate) => candidate.entity.id !== top.entity.id && top.score - candidate.score <= 0.08
  );

  if (close.length > 0) {
    const differentTypes = close.some(
      (candidate) => candidate.entity.entityType !== top.entity.entityType
    );
    return {
      query: input.query,
      resolved: null,
      candidates: [top, ...close],
      ambiguous: true,
      reason: differentTypes ? 'MULTIPLE_TYPES' : 'MULTIPLE_ENTITIES',
    };
  }

  return {
    query: input.query,
    resolved: top.entity,
    candidates: [top],
    ambiguous: false,
    reason:
      typeHint && top.entity.entityType === typeHint
        ? 'TYPE_HINT'
        : input.projectId && top.entity.projectId === input.projectId
          ? 'PROJECT_CONTEXT'
          : 'EXACT',
  };
}

export function entityTypeLabel(entityType: string): { ru: string; en: string } {
  const labels: Record<string, { ru: string; en: string }> = {
    PROJECT: { ru: 'проект', en: 'project' },
    WORK: { ru: 'произведение', en: 'work' },
    BOOK: { ru: 'книга', en: 'book' },
    CHAPTER: { ru: 'глава', en: 'chapter' },
    DOCUMENT: { ru: 'документ', en: 'document' },
    MEDIA_ASSET: { ru: 'медиаматериал', en: 'media asset' },
    VIDEO: { ru: 'видео', en: 'video' },
    SERIES: { ru: 'сериал', en: 'series' },
    EPISODE: { ru: 'эпизод', en: 'episode' },
    WEBSITE: { ru: 'сайт', en: 'website' },
    PAGE: { ru: 'страница', en: 'page' },
    PROPOSAL: { ru: 'предложение', en: 'proposal' },
    TASK: { ru: 'задача', en: 'task' },
    EVENT: { ru: 'событие', en: 'event' },
    DECISION: { ru: 'решение', en: 'decision' },
    CONVERSATION: { ru: 'диалог', en: 'conversation' },
  };
  return labels[entityType] || { ru: entityType.toLowerCase(), en: entityType.toLowerCase() };
}
