import { assertServerOnly } from '@/lib/serverOnly';
import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { lexicalSimilarity, tokenize } from '@/lib/pierrot/memory/similarity';
import type {
  SkillDefinition,
  SkillDetail,
  SkillRecord,
  SkillRun,
  SkillStatus,
  SkillVersion,
  SkillWriteInput,
} from './types';
import { SKILL_STATUSES } from './types';
import { validateSkillDefinition } from './validation';

assertServerOnly('lib/pierrot/skills/store');

const SKILLS_TABLE = 'pierrot_skills';
const VERSIONS_TABLE = 'pierrot_skill_versions';
const RUNS_TABLE = 'pierrot_skill_runs';

function isMissingRelation(error: { code?: unknown; message?: unknown } | null): boolean {
  const code = typeof error?.code === 'string' ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message.toLowerCase() : '';
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    message.includes('pierrot_skill') ||
    message.includes('does not exist')
  );
}

function unavailable(error: unknown): never {
  if (error instanceof Error && error.message === 'skills_unavailable') throw error;
  throw new Error('skills_unavailable');
}

function statusOf(value: unknown): SkillStatus {
  return typeof value === 'string' && (SKILL_STATUSES as readonly string[]).includes(value)
    ? (value as SkillStatus)
    : 'draft';
}

function stringOf(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function definitionOf(value: unknown): SkillDefinition {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const list = (input: unknown): string[] =>
    Array.isArray(input) ? input.filter((item): item is string => typeof item === 'string') : [];

  return {
    name: stringOf(record.name),
    description: stringOf(record.description),
    purpose: stringOf(record.purpose),
    conditions: list(record.conditions),
    inputs: list(record.inputs),
    steps: list(record.steps),
    tools: list(record.tools),
    constraints: list(record.constraints),
    expectedResult: stringOf(record.expectedResult),
    tests: Array.isArray(record.tests)
      ? record.tests.flatMap((test) => {
          if (!test || typeof test !== 'object') return [];
          const item = test as Record<string, unknown>;
          if (typeof item.name !== 'string' || typeof item.expected !== 'string') return [];
          return [
            {
              name: item.name,
              ...(typeof item.input === 'string' ? { input: item.input } : {}),
              expected: item.expected,
              ...(Array.isArray(item.checks)
                ? {
                    checks: item.checks.filter(
                      (check): check is string => typeof check === 'string'
                    ),
                  }
                : {}),
            },
          ];
        })
      : [],
    examples: Array.isArray(record.examples)
      ? record.examples.flatMap((example) => {
          if (!example || typeof example !== 'object') return [];
          const item = example as Record<string, unknown>;
          if (typeof item.title !== 'string' || typeof item.result !== 'string') return [];
          return [
            {
              title: item.title,
              ...(typeof item.input === 'string' ? { input: item.input } : {}),
              result: item.result,
              ...(typeof item.date === 'string' ? { date: item.date } : {}),
            },
          ];
        })
      : [],
  };
}

function versionOf(row: Record<string, unknown>): SkillVersion | null {
  if (typeof row.id !== 'string' || typeof row.skill_id !== 'string') return null;

  return {
    id: row.id,
    skillId: row.skill_id,
    version: typeof row.version === 'number' ? row.version : 1,
    definition: definitionOf(row.definition),
    changelog: typeof row.changelog === 'string' ? row.changelog : null,
    status: statusOf(row.status),
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

function skillOf(
  row: Record<string, unknown>,
  currentVersion: SkillVersion | null
): SkillRecord | null {
  if (typeof row.id !== 'string' || typeof row.slug !== 'string') return null;

  return {
    id: row.id,
    slug: row.slug,
    name: stringOf(row.name),
    description: stringOf(row.description),
    status: statusOf(row.status),
    currentVersionId: typeof row.current_version_id === 'string' ? row.current_version_id : null,
    currentVersion,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : new Date().toISOString(),
  };
}

function slugify(value: string): string {
  const base = value
    .toLowerCase()
    .replace(/ё/g, 'e')
    .replace(/[^a-z0-9а-я]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);

  return `${base || 'skill'}-${randomUUID().slice(0, 8)}`;
}

async function loadVersions(
  store: SupabaseClient,
  userId: string,
  skillId: string
): Promise<SkillVersion[]> {
  const { data, error } = await store
    .from(VERSIONS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('skill_id', skillId)
    .order('version', { ascending: false })
    .limit(50);

  if (error) {
    if (isMissingRelation(error)) unavailable(error);
    throw error;
  }

  return (data ?? [])
    .map((row) => versionOf(row as Record<string, unknown>))
    .filter((row): row is SkillVersion => row !== null);
}

export async function listSkills(
  store: SupabaseClient,
  userId: string,
  options: { query?: string | null; status?: SkillStatus | null; limit?: number } = {}
): Promise<SkillRecord[]> {
  const limit = Math.min(Math.max(options.limit ?? 60, 1), 100);

  let query = store
    .from(SKILLS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (options.status) query = query.eq('status', options.status);

  const search = options.query?.trim();
  if (search) {
    const escaped = search.replace(/[%_\\]/g, '\\$&');
    query = query.or(`name.ilike.%${escaped}%,description.ilike.%${escaped}%`);
  }

  const { data, error } = await query;
  if (error) {
    if (isMissingRelation(error)) unavailable(error);
    throw error;
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const currentIds = rows
    .map((row) => (typeof row.current_version_id === 'string' ? row.current_version_id : null))
    .filter((id): id is string => Boolean(id));

  const versions = new Map<string, SkillVersion>();

  if (currentIds.length > 0) {
    const versionResult = await store
      .from(VERSIONS_TABLE)
      .select('*')
      .eq('user_id', userId)
      .in('id', currentIds);

    if (versionResult.error) {
      if (isMissingRelation(versionResult.error)) unavailable(versionResult.error);
      throw versionResult.error;
    }

    for (const row of (versionResult.data ?? []) as Array<Record<string, unknown>>) {
      const version = versionOf(row);
      if (version) versions.set(version.id, version);
    }
  }

  return rows
    .map((row) =>
      skillOf(
        row,
        typeof row.current_version_id === 'string'
          ? (versions.get(row.current_version_id) ?? null)
          : null
      )
    )
    .filter((row): row is SkillRecord => row !== null);
}

async function loadLatestRun(
  store: SupabaseClient,
  userId: string,
  versionId: string | null
): Promise<SkillRun | null> {
  if (!versionId) return null;

  const { data, error } = await store
    .from(RUNS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('version_id', versionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  if (typeof row.id !== 'string') return null;

  return {
    id: row.id,
    skillId: stringOf(row.skill_id),
    versionId: stringOf(row.version_id),
    status: row.status === 'passed' ? 'passed' : 'failed',
    checks: Array.isArray(row.checks) ? (row.checks as SkillRun['checks']) : [],
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

export async function getSkill(
  store: SupabaseClient,
  userId: string,
  id: string
): Promise<SkillDetail | null> {
  const { data, error } = await store
    .from(SKILLS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('id', id)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) unavailable(error);
    throw error;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  const versions = await loadVersions(store, userId, id);
  const currentVersion =
    versions.find((version) => version.id === row.current_version_id) ?? versions[0] ?? null;
  const record = skillOf(row, currentVersion);

  if (!record) return null;

  return {
    ...record,
    versions,
    latestRun: await loadLatestRun(store, userId, currentVersion?.id ?? null),
  };
}

export async function createSkillDraft(
  store: SupabaseClient,
  userId: string,
  input: SkillWriteInput
): Promise<SkillDetail> {
  const definition = definitionOf(input.definition);
  const skillId = randomUUID();
  const versionId = randomUUID();
  const now = new Date().toISOString();

  const { error: skillError } = await store.from(SKILLS_TABLE).insert({
    id: skillId,
    user_id: userId,
    slug: input.slug || slugify(definition.name || 'skill'),
    name: definition.name || 'Untitled skill',
    description: definition.description,
    status: 'draft',
    current_version_id: versionId,
    created_at: now,
    updated_at: now,
  });

  if (skillError) {
    if (isMissingRelation(skillError)) unavailable(skillError);
    throw skillError;
  }

  const { error: versionError } = await store.from(VERSIONS_TABLE).insert({
    id: versionId,
    skill_id: skillId,
    user_id: userId,
    version: 1,
    definition,
    changelog: input.changelog || 'Initial draft',
    status: 'draft',
    created_at: now,
  });

  if (versionError) {
    await store.from(SKILLS_TABLE).delete().eq('id', skillId).eq('user_id', userId);
    if (isMissingRelation(versionError)) unavailable(versionError);
    throw versionError;
  }

  const detail = await getSkill(store, userId, skillId);
  if (!detail) throw new Error('skill_create_failed');
  return detail;
}

export async function createSkillVersion(
  store: SupabaseClient,
  userId: string,
  skillId: string,
  input: SkillWriteInput
): Promise<SkillDetail> {
  const existing = await getSkill(store, userId, skillId);
  if (!existing) throw new Error('skill_not_found');

  const definition = definitionOf(input.definition);
  const nextVersion =
    existing.versions.reduce((max, version) => Math.max(max, version.version), 0) + 1;
  const versionId = randomUUID();
  const now = new Date().toISOString();

  const { error: versionError } = await store.from(VERSIONS_TABLE).insert({
    id: versionId,
    skill_id: skillId,
    user_id: userId,
    version: nextVersion,
    definition,
    changelog: input.changelog || `Version ${nextVersion}`,
    status: 'draft',
    created_at: now,
  });

  if (versionError) {
    if (isMissingRelation(versionError)) unavailable(versionError);
    throw versionError;
  }

  const { error: skillError } = await store
    .from(SKILLS_TABLE)
    .update({
      name: definition.name || existing.name,
      description: definition.description,
      status: 'draft',
      current_version_id: versionId,
      updated_at: now,
    })
    .eq('id', skillId)
    .eq('user_id', userId);

  if (skillError) throw skillError;

  const detail = await getSkill(store, userId, skillId);
  if (!detail) throw new Error('skill_update_failed');
  return detail;
}

export async function testSkill(
  store: SupabaseClient,
  userId: string,
  skillId: string,
  versionId?: string | null,
  options: { includeHistorical?: boolean; days?: number } = {}
): Promise<SkillRun> {
  const skill = await getSkill(store, userId, skillId);
  if (!skill) throw new Error('skill_not_found');

  const version =
    (versionId ? skill.versions.find((item) => item.id === versionId) : skill.currentVersion) ||
    null;

  if (!version) throw new Error('skill_version_not_found');

  const validation = validateSkillDefinition(version.definition);
  const structuralChecks = validation.checks.map((check) => ({
    ...check,
    phase: 'structural' as const,
    blocking: true,
  }));

  const historicalChecks =
    options.includeHistorical === false
      ? []
      : await import('./historical')
          .then((module) =>
            module.loadHistoricalSkillChecks({
              store,
              userId,
              definition: version.definition,
              days: options.days,
            })
          )
          .catch(() => []);

  const checks = [...structuralChecks, ...historicalChecks];
  const passed = structuralChecks.every((check) => check.passed);
  const now = new Date().toISOString();

  const { data, error } = await store
    .from(RUNS_TABLE)
    .insert({
      user_id: userId,
      skill_id: skillId,
      version_id: version.id,
      status: passed ? 'passed' : 'failed',
      checks,
      created_at: now,
    })
    .select('*')
    .single();

  if (error) {
    if (isMissingRelation(error)) unavailable(error);
    throw error;
  }

  await Promise.all([
    store
      .from(VERSIONS_TABLE)
      .update({ status: passed ? 'testing' : 'draft' })
      .eq('id', version.id)
      .eq('user_id', userId),
    store
      .from(SKILLS_TABLE)
      .update({ status: passed ? 'testing' : 'draft', updated_at: now })
      .eq('id', skillId)
      .eq('user_id', userId),
  ]).catch(() => undefined);

  const row = data as Record<string, unknown>;

  return {
    id: stringOf(row.id),
    skillId,
    versionId: version.id,
    status: passed ? 'passed' : 'failed',
    checks,
    createdAt: now,
  };
}

async function latestPassingRun(
  store: SupabaseClient,
  userId: string,
  versionId: string
): Promise<SkillRun | null> {
  const { data, error } = await store
    .from(RUNS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .eq('version_id', versionId)
    .eq('status', 'passed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }
  if (!data) return null;

  const row = data as Record<string, unknown>;
  return {
    id: stringOf(row.id),
    skillId: stringOf(row.skill_id),
    versionId: stringOf(row.version_id),
    status: 'passed',
    checks: Array.isArray(row.checks) ? (row.checks as SkillRun['checks']) : [],
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

export async function approveSkill(
  store: SupabaseClient,
  userId: string,
  skillId: string,
  versionId?: string | null
): Promise<SkillDetail> {
  const skill = await getSkill(store, userId, skillId);
  if (!skill) throw new Error('skill_not_found');

  const target =
    (versionId
      ? skill.versions.find((version) => version.id === versionId)
      : skill.currentVersion) || null;

  if (!target) throw new Error('skill_version_not_found');

  const run = await latestPassingRun(store, userId, target.id);
  if (!run) throw new Error('skill_test_required');

  const now = new Date().toISOString();

  await Promise.all([
    store
      .from(VERSIONS_TABLE)
      .update({ status: 'archived' })
      .eq('user_id', userId)
      .eq('skill_id', skillId)
      .eq('status', 'active'),
    store
      .from(VERSIONS_TABLE)
      .update({ status: 'active' })
      .eq('user_id', userId)
      .eq('id', target.id),
    store
      .from(SKILLS_TABLE)
      .update({
        status: 'active',
        current_version_id: target.id,
        name: target.definition.name || skill.name,
        description: target.definition.description || skill.description,
        updated_at: now,
      })
      .eq('user_id', userId)
      .eq('id', skillId),
  ]);

  const detail = await getSkill(store, userId, skillId);
  if (!detail) throw new Error('skill_update_failed');
  return detail;
}

export async function disableSkill(
  store: SupabaseClient,
  userId: string,
  skillId: string
): Promise<SkillDetail> {
  const { error } = await store
    .from(SKILLS_TABLE)
    .update({ status: 'disabled', updated_at: new Date().toISOString() })
    .eq('user_id', userId)
    .eq('id', skillId);

  if (error) {
    if (isMissingRelation(error)) unavailable(error);
    throw error;
  }

  const detail = await getSkill(store, userId, skillId);
  if (!detail) throw new Error('skill_not_found');
  return detail;
}

export async function restoreSkillVersion(
  store: SupabaseClient,
  userId: string,
  skillId: string,
  versionId: string
): Promise<SkillDetail> {
  const skill = await getSkill(store, userId, skillId);
  if (!skill) throw new Error('skill_not_found');

  const target = skill.versions.find((version) => version.id === versionId);
  if (!target) throw new Error('skill_version_not_found');

  const run = await latestPassingRun(store, userId, target.id);
  if (!run) throw new Error('skill_test_required');

  const now = new Date().toISOString();

  await Promise.all([
    store
      .from(VERSIONS_TABLE)
      .update({ status: 'archived' })
      .eq('user_id', userId)
      .eq('skill_id', skillId)
      .eq('status', 'active'),
    store
      .from(VERSIONS_TABLE)
      .update({ status: 'active' })
      .eq('user_id', userId)
      .eq('id', target.id),
    store
      .from(SKILLS_TABLE)
      .update({
        status: 'active',
        current_version_id: target.id,
        name: target.definition.name || skill.name,
        description: target.definition.description || skill.description,
        updated_at: now,
      })
      .eq('user_id', userId)
      .eq('id', skillId),
  ]);

  const detail = await getSkill(store, userId, skillId);
  if (!detail) throw new Error('skill_update_failed');
  return detail;
}

export type SkillMatch = {
  skill: SkillRecord;
  score: number;
};

/**
 * Deterministic applicability hint. It only decides whether a skill is worth
 * putting in front of the model; it never executes the procedure and never
 * grants a permission.
 */
export async function matchActiveSkills(
  store: SupabaseClient,
  userId: string,
  message: string,
  limit = 2
): Promise<SkillMatch[]> {
  const skills = await listSkills(store, userId, { status: 'active', limit: 40 }).catch(() => []);

  const normalized = message.trim().toLowerCase();

  return skills
    .map((skill) => {
      const definition = skill.currentVersion?.definition;
      if (!definition) return { skill, score: 0 };

      const name = definition.name.toLowerCase();
      const text = [
        definition.name,
        definition.description,
        definition.purpose,
        ...definition.conditions,
      ].join(' ');

      const nameBonus = normalized.includes(name) ? 0.6 : 0;
      const score =
        nameBonus +
        lexicalSimilarity(message, text) * 0.8 +
        Math.min(0.15, tokenize(message).filter((token) => name.includes(token)).length * 0.03);

      return { skill, score };
    })
    .filter((entry) => entry.score >= 0.18)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

/** Compact, bounded prompt block. No private content beyond the skill body. */
export async function buildSkillsContext(
  store: SupabaseClient,
  userId: string,
  message: string
): Promise<string | null> {
  const matches = await matchActiveSkills(store, userId, message, 2);
  if (matches.length === 0) return null;

  const lines = [
    'APPROVED SKILLS (procedures, not facts):',
    'Use a skill only when its conditions match the owner’s request. Existing authorization, tool limits and approval requirements still apply. Never invent a step, never bypass owner-only access and never perform a production change without explicit approval.',
  ];

  for (const { skill } of matches) {
    const definition = skill.currentVersion?.definition;
    if (!definition) continue;

    lines.push(
      '',
      `${definition.name} (v${skill.currentVersion?.version ?? 1})`,
      `Purpose: ${definition.purpose}`,
      `Conditions: ${definition.conditions.slice(0, 6).join('; ')}`,
      `Steps: ${definition.steps.slice(0, 10).join(' → ')}`,
      `Tools: ${definition.tools.join(', ') || 'none'}`,
      `Constraints: ${definition.constraints.slice(0, 6).join('; ')}`,
      `Expected result: ${definition.expectedResult}`
    );
  }

  return lines.join('\n').slice(0, 3_000);
}
