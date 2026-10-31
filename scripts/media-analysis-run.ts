/**
 * Media Intelligence batch runner.
 *
 * Usage:
 *   npx tsx scripts/media-analysis-run.ts --enqueue-all --limit 115 --batch 3
 *   npx tsx scripts/media-analysis-run.ts --enqueue-all --force --limit 10
 *   npx tsx scripts/media-analysis-run.ts --process-only --batch 3
 *
 * The runner uses the same queue as the admin API. It processes small batches
 * and stops at the requested time budget. It never deletes documents.
 */

import fs from 'node:fs';
import path from 'node:path';

function loadEnvFile(file: string): void {
  if (!fs.existsSync(file)) return;

  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;

    let value = match[2].trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (!process.env[match[1]]) process.env[match[1]] = value;
  }
}

function arg(name: string): string | null {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return null;

  const value = process.argv[index + 1];
  return value && !value.startsWith('--') ? value : 'true';
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

loadEnvFile(path.join(process.cwd(), '.env.production.local'));
loadEnvFile(path.join(process.cwd(), '.env.local'));

const enqueueAll = flag('enqueue-all');
const processOnly = flag('process-only');
const refreshMissingTopics = flag('refresh-missing-topics');
const rebuildRelations = flag('rebuild-relations');
const force = flag('force');
const limit = Math.min(Math.max(Number(arg('limit')) || 25, 1), 2000);
const batch = Math.min(Math.max(Number(arg('batch')) || 3, 1), 10);
const maxMinutes = Math.min(Math.max(Number(arg('max-minutes')) || 60, 1), 600);

async function main(): Promise<void> {
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured.');
  }

  if (!process.env.DIRECT_URL && !process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL/DIRECT_URL is not configured.');
  }

  const { enqueueMediaAnalyses, processMediaAnalysisBatch } = await import(
    '../lib/knowledge/media/analysisQueue'
  );

  if (rebuildRelations) {
    const { rebuildMediaRelations } = await import(
      '../lib/knowledge/media/relationRebuild'
    );
    const result = await rebuildMediaRelations({ limit });
    console.log(JSON.stringify({ step: 'rebuild-relations', ...result }));
    return;
  }

  if (refreshMissingTopics) {
    const { createMediaAnalysisStore } = await import(
      '../lib/knowledge/media/analysisStore'
    );
    const store = createMediaAnalysisStore();

    if (!store) throw new Error('Media analysis database is not available.');

    const { data, error } = await store.client
      .from('media_analysis_runs')
      .select('media_record_id,topic_count,created_at')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(5000);

    if (error) throw new Error('Could not list completed analysis runs.');

    const latest = new Map<string, { topic_count: number }>();

    for (const row of (data || []) as Array<{ media_record_id: string; topic_count: number }>) {
      if (!latest.has(row.media_record_id)) {
        latest.set(row.media_record_id, { topic_count: row.topic_count });
      }
    }

    const recordIds = [...latest.entries()]
      .filter(([, value]) => value.topic_count === 0)
      .map(([id]) => id)
      .slice(0, limit);

    const enqueued = await enqueueMediaAnalyses({
      mode: 'selected',
      recordIds,
      force: true,
      limit: recordIds.length,
      requestedBy: 'cli',
      store,
    });

    console.log(JSON.stringify({ step: 'enqueue-missing-topics', ...enqueued }));
  } else if (!processOnly) {
    const enqueued = await enqueueMediaAnalyses({
      mode: 'all',
      limit,
      force,
      requestedBy: 'cli',
    });

    console.log(
      JSON.stringify({
        step: 'enqueue',
        ...enqueued,
      })
    );
  }

  const startedAt = Date.now();
  let iteration = 0;

  while (Date.now() - startedAt < maxMinutes * 60_000) {
    iteration += 1;

    const result = await processMediaAnalysisBatch({
      limit: batch,
      maxDurationMs: 240_000,
      workerId: `media-analysis-cli-${process.pid}`,
      trigger: 'scheduler',
    });

    console.log(
      JSON.stringify({
        step: 'process',
        iteration,
        claimed: result.claimed,
        processed: result.processed,
        retried: result.retried,
        failed: result.failed,
        results: result.results.map((item) => ({
          mediaRecordId: item.mediaRecordId,
          runId: item.runId,
          status: item.status,
          quoteCount: 'quoteCount' in item ? item.quoteCount : undefined,
          relationCount: 'relationCount' in item ? item.relationCount : undefined,
          error: 'error' in item ? item.error : undefined,
        })),
      })
    );

    if (result.claimed === 0) break;
  }

  console.log(JSON.stringify({ step: 'done', minutes: (Date.now() - startedAt) / 60_000 }));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
