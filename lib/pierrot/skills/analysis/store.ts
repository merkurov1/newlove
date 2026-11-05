import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SkillAnalysisReport, StoredSkillAnalysis } from '../types';

assertServerOnly('lib/pierrot/skills/analysis/store');

const ANALYSES_TABLE = 'pierrot_skill_analyses';

function isMissingRelation(error: unknown): boolean {
  const value =
    error && typeof error === 'object'
      ? `${String((error as { code?: unknown }).code || '')} ${String(
          (error as { message?: unknown }).message || ''
        )}`
      : '';
  return /PGRST205|42P01|relation .* does not exist/i.test(value);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function mapRow(row: Record<string, unknown>): StoredSkillAnalysis | null {
  if (typeof row.id !== 'string') return null;

  const report = asRecord(row.report);
  if (!report) return null;

  const status =
    row.status === 'completed' || row.status === 'partial' || row.status === 'failed'
      ? row.status
      : 'partial';

  return {
    id: row.id,
    status,
    report: report as unknown as SkillAnalysisReport,
    createdAt: typeof row.created_at === 'string' ? row.created_at : new Date().toISOString(),
  };
}

export async function saveSkillAnalysis(
  store: SupabaseClient,
  userId: string,
  input: {
    status: 'completed' | 'partial' | 'failed';
    report: SkillAnalysisReport;
    periodStart: string;
    periodEnd: string;
  }
): Promise<StoredSkillAnalysis | null> {
  const { data, error } = await store
    .from(ANALYSES_TABLE)
    .insert({
      user_id: userId,
      status: input.status,
      period_start: input.periodStart,
      period_end: input.periodEnd,
      sources: input.report.sources,
      report: input.report,
      created_at: new Date().toISOString(),
    })
    .select('id,status,report,created_at')
    .single();

  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }

  const row = asRecord(data);
  if (!row) return null;

  const mapped = mapRow(row);
  if (!mapped) return null;

  return {
    ...mapped,
    report: {
      ...mapped.report,
      id: mapped.id,
      generatedAt: mapped.report.generatedAt || mapped.createdAt,
    },
  };
}

export async function getLatestSkillAnalysis(
  store: SupabaseClient,
  userId: string
): Promise<StoredSkillAnalysis | null> {
  const { data, error } = await store
    .from(ANALYSES_TABLE)
    .select('id,status,report,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) return null;
    throw error;
  }

  const row = asRecord(data);
  return row ? mapRow(row) : null;
}

export async function listRecentSkillAnalyses(
  store: SupabaseClient,
  userId: string,
  limit = 8
): Promise<StoredSkillAnalysis[]> {
  const { data, error } = await store
    .from(ANALYSES_TABLE)
    .select('id,status,report,created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 20));

  if (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }

  return (Array.isArray(data) ? data : [])
    .map((row) => mapRow(asRecord(row) || {}))
    .filter((row): row is StoredSkillAnalysis => row !== null);
}

export async function isSkillAnalysisStoreAvailable(store: SupabaseClient): Promise<boolean> {
  const { error } = await store.from(ANALYSES_TABLE).select('id').limit(1);
  return !error;
}
