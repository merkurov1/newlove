import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { projectAliases } from '@/lib/pierrot/projects/matching';
import {
  normalizeEntityName,
  resolveEntityCandidates,
  type EntityResolution,
  type PierrotEntity,
  type PierrotEntityRelation,
  type PierrotEntityRelationType,
  type PierrotEntityType,
  PIERROT_ENTITY_TYPES,
} from './types';

assertServerOnly('lib/pierrot/entities/store');

const text = (value: unknown) => (typeof value === 'string' ? value : '');
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

function isMissingTable(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /42P01|PGRST205|does not exist|relation .*not found/i.test(value);
}

function mapEntity(row: Record<string, unknown>): PierrotEntity | null {
  const entityType = text(row.entity_type) as PierrotEntityType;
  if (!entityType || !PIERROT_ENTITY_TYPES.includes(entityType)) return null;
  const id = text(row.id);
  const name = text(row.name);
  if (!id || !name) return null;

  return {
    id,
    ownerUserId: text(row.owner_user_id),
    entityType,
    name,
    canonicalName: text(row.canonical_name) || normalizeEntityName(name),
    description: text(row.description),
    projectId: text(row.project_id) || null,
    parentEntityId: text(row.parent_entity_id) || null,
    status: text(row.status) || 'active',
    aliases: Array.isArray(row.aliases)
      ? row.aliases.filter((alias): alias is string => typeof alias === 'string')
      : [],
    sourceRefs: Array.isArray(row.source_refs) ? row.source_refs : [],
    metadata: object(row.metadata),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

function projectEntity(row: Record<string, unknown>): PierrotEntity | null {
  const id = text(row.id);
  const name = text(row.name);
  if (!id || !name) return null;
  return {
    id: `project:${id}`,
    ownerUserId: text(row.owner_user_id),
    entityType: 'PROJECT',
    name,
    canonicalName: normalizeEntityName(name),
    description: text(row.description),
    projectId: id,
    parentEntityId: null,
    status: text(row.status) || 'active',
    aliases: projectAliases({ name, slug: text(row.slug) }),
    sourceRefs: [{ type: 'project', id }],
    metadata: { projectId: id, slug: text(row.slug), derived: true },
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
    derivedFromProject: true,
  };
}

/**
 * Loads typed entities and also exposes every existing project as a PROJECT
 * entity. The second part is not duplication: it guarantees that entity
 * resolution works before the additive entity migration is applied.
 */
export async function listEntities(
  store: SupabaseClient,
  ownerUserId: string,
  options: { entityTypes?: PierrotEntityType[]; projectId?: string | null; limit?: number } = {}
): Promise<PierrotEntity[]> {
  const limit = Math.min(Math.max(options.limit ?? 500, 1), 2000);
  let query = store
    .from('pierrot_entities')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (options.entityTypes?.length) query = query.in('entity_type', options.entityTypes);
  if (options.projectId) query = query.eq('project_id', options.projectId);

  const result = await query;
  const rows =
    result.error && isMissingTable(result.error)
      ? []
      : result.error
        ? []
        : Array.isArray(result.data)
          ? result.data
          : [];

  const entities = rows
    .map((row) => mapEntity(row as Record<string, unknown>))
    .filter((entity): entity is PierrotEntity => Boolean(entity));

  let projectQuery = store
    .from('pierrot_projects')
    .select('id,owner_user_id,slug,name,description,status,created_at,updated_at')
    .eq('owner_user_id', ownerUserId)
    .limit(limit);
  if (options.projectId) projectQuery = projectQuery.eq('id', options.projectId);
  const projectsResult = await projectQuery;

  const projects = (Array.isArray(projectsResult.data) ? projectsResult.data : [])
    .map((row) => projectEntity(row as Record<string, unknown>))
    .filter((entity): entity is PierrotEntity => Boolean(entity));

  const existingProjectIds = new Set(
    entities
      .filter((entity) => entity.entityType === 'PROJECT' && entity.projectId)
      .map((entity) => entity.projectId as string)
  );

  return [
    ...entities,
    ...projects.filter(
      (entity) => !entity.projectId || !existingProjectIds.has(entity.projectId)
    ),
  ];
}

export async function resolveEntityByName(
  store: SupabaseClient,
  ownerUserId: string,
  input: { query: string; typeHint?: string | null; projectId?: string | null }
): Promise<EntityResolution> {
  const entities = await listEntities(store, ownerUserId, {
    projectId: input.projectId ?? null,
    limit: 1000,
  });
  return resolveEntityCandidates({
    entities,
    query: input.query,
    typeHint: input.typeHint,
    projectId: input.projectId,
  });
}

export async function listEntityRelations(
  store: SupabaseClient,
  ownerUserId: string,
  input: { entityIds?: string[]; projectId?: string | null; limit?: number } = {}
): Promise<PierrotEntityRelation[]> {
  let query = store
    .from('pierrot_entity_relations')
    .select('*')
    .eq('owner_user_id', ownerUserId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(input.limit ?? 500, 1), 2000));

  if (input.entityIds?.length) query = query.in('from_entity_id', input.entityIds);

  const { data, error } = await query;
  if (error) {
    if (isMissingTable(error)) return [];
    return [];
  }

  return (Array.isArray(data) ? data : [])
    .map((row): PierrotEntityRelation | null => {
      const item = row as Record<string, unknown>;
      const id = text(item.id);
      const fromEntityId = text(item.from_entity_id);
      const toEntityId = text(item.to_entity_id);
      const relationType = text(item.relation_type) as PierrotEntityRelationType;
      if (!id || !fromEntityId || !toEntityId || !relationType) return null;
      return {
        id,
        ownerUserId: text(item.owner_user_id),
        fromEntityId,
        toEntityId,
        relationType,
        confidence: Number(item.confidence ?? 0.7),
        evidenceClass: text(item.evidence_class) || 'DOCUMENTED',
        sourceRefs: Array.isArray(item.source_refs) ? item.source_refs : [],
        createdAt: text(item.created_at),
      };
    })
    .filter((relation): relation is PierrotEntityRelation => Boolean(relation));
}

export async function createEntity(
  store: SupabaseClient,
  ownerUserId: string,
  input: {
    entityType: PierrotEntityType;
    name: string;
    description?: string;
    projectId?: string | null;
    parentEntityId?: string | null;
    status?: string;
    aliases?: string[];
    sourceRefs?: unknown[];
    metadata?: Record<string, unknown>;
  }
): Promise<PierrotEntity | null> {
  const name = input.name.trim();
  if (!name) return null;

  const { data, error } = await store
    .from('pierrot_entities')
    .upsert(
      {
        owner_user_id: ownerUserId,
        entity_type: input.entityType,
        name: name.slice(0, 240),
        canonical_name: normalizeEntityName(name).slice(0, 240),
        description: (input.description || '').slice(0, 4000),
        project_id: input.projectId || null,
        parent_entity_id: input.parentEntityId || null,
        status: input.status || 'active',
        aliases: input.aliases?.slice(0, 40) || [],
        source_refs: input.sourceRefs || [],
        metadata: input.metadata || {},
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_user_id,entity_type,canonical_name' }
    )
    .select('*')
    .maybeSingle();

  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data ? mapEntity(data as Record<string, unknown>) : null;
}

export async function linkEntities(
  store: SupabaseClient,
  ownerUserId: string,
  input: {
    fromEntityId: string;
    toEntityId: string;
    relationType: PierrotEntityRelationType;
    confidence?: number;
    evidenceClass?: string;
    sourceRefs?: unknown[];
  }
): Promise<void> {
  if (input.fromEntityId === input.toEntityId) return;
  const { error } = await store.from('pierrot_entity_relations').upsert(
    {
      owner_user_id: ownerUserId,
      from_entity_id: input.fromEntityId,
      to_entity_id: input.toEntityId,
      relation_type: input.relationType,
      confidence: Math.max(0, Math.min(1, input.confidence ?? 0.8)),
      evidence_class: input.evidenceClass || 'DOCUMENTED',
      source_refs: input.sourceRefs || [],
    },
    { onConflict: 'owner_user_id,from_entity_id,to_entity_id,relation_type' }
  );
  if (error && !isMissingTable(error)) throw error;
}
