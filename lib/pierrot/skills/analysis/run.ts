import { assertServerOnly } from '@/lib/serverOnly';
import type { SupabaseClient } from '@supabase/supabase-js';
import { collectSkillAnalysisEvidence } from './collect';
import { analyzeEvidence } from './analyze';
import { saveSkillAnalysis } from './store';
import type { SkillAnalysisReport, StoredSkillAnalysis } from '../types';

assertServerOnly('lib/pierrot/skills/analysis/run');

export type SkillAnalysisRunResult = {
  analysis: SkillAnalysisReport;
  persisted: boolean;
  stored: StoredSkillAnalysis | null;
  status: 'completed' | 'partial' | 'failed';
};

function primarySourcesUnavailable(report: SkillAnalysisReport): boolean {
  const primary = report.sources.filter((source) =>
    ['owner_chat', 'memory', 'dev_mode'].includes(source.key)
  );

  return primary.length > 0 && primary.every((source) => source.status === 'unavailable');
}

/**
 * One explicit, bounded analysis run. No model call, worker, cron or retry
 * loop: the report is derived deterministically from the owner's real records.
 */
export async function runOwnerSkillAnalysis(input: {
  store: SupabaseClient;
  userId: string;
  days?: number;
  now?: Date;
}): Promise<SkillAnalysisRunResult> {
  const evidence = await collectSkillAnalysisEvidence(input);
  const report = analyzeEvidence(evidence);

  const failed = primarySourcesUnavailable(report);
  const partial = report.sources.some(
    (source) =>
      ['owner_chat', 'memory', 'dev_mode', 'tool_events'].includes(source.key) &&
      (source.status === 'partial' || source.status === 'unavailable')
  );
  const status: SkillAnalysisRunResult['status'] = failed
    ? 'failed'
    : partial
      ? 'partial'
      : 'completed';

  if (failed) {
    report.overview = `${report.overview} Ни один основной источник не дал пригодной истории, поэтому отчёт не выдаётся за успешный анализ.`;
  }

  let stored: StoredSkillAnalysis | null = null;

  try {
    stored = await saveSkillAnalysis(input.store, input.userId, {
      status,
      report,
      periodStart: report.periodStart,
      periodEnd: report.periodEnd,
    });
  } catch {
    stored = null;
  }

  if (stored) {
    report.id = stored.id;
  }

  return {
    analysis: report,
    persisted: Boolean(stored),
    stored,
    status,
  };
}
