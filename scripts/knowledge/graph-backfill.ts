#!/usr/bin/env tsx
/**
 * Controlled, resumable graph backfill from the command line.
 *
 * This does not create a scheduler. Each invocation processes a bounded number
 * of already-queued graph jobs; the database queue is the checkpoint.
 *
 *   npx tsx scripts/knowledge/graph-backfill.ts --status
 *   npx tsx scripts/knowledge/graph-backfill.ts --max-jobs 10
 */
import dotenv from 'dotenv';
import { Client } from 'pg';

import { createBrainGraphStore } from '@/lib/knowledge/graph/store';
import { runGraphWorker } from '@/lib/knowledge/brain/worker';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production.local' });
dotenv.config();

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || '' : null;
}

async function client() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('DATABASE_URL_missing');
  const c = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
}

async function status() {
  const c = await client();
  try {
    const { rows } = await c.query(
      `select j.status, count(*) n,
              count(distinct j.document_id) documents
         from brain_graph_jobs j
        group by 1 order by 1`
    );
    const runs = await c.query(
      `select r.status, count(*) n,
              count(*) filter (where exists (
                select 1 from brain_graph_jobs j where j.run_id=r.id and j.status='queued'
              )) with_queued
         from brain_graph_runs r group by 1 order by 1`
    );
    const extracted = await c.query(
      `select count(*) n from brain_document_extractions where status='completed'`
    );
    console.log(JSON.stringify({ jobs: rows, runs: runs.rows, completedExtractions: extracted.rows[0].n }, null, 2));
  } finally {
    await c.end();
  }
}

async function main() {
  if (process.argv.includes('--status')) {
    await status();
    return;
  }

  const store = createBrainGraphStore();
  if (!store) throw new Error('graph_store_unavailable');
  const maxJobs = Math.min(10, Math.max(1, Number(arg('--max-jobs') || 5)));

  const result = await runGraphWorker({
    trigger: 'admin',
    maxJobs,
    maxDurationMs: 240_000,
    store,
    skipGuard: true,
  });

  console.log(
    JSON.stringify(
      {
        status: result.status,
        processed: result.processed,
        failed: result.failed,
        runsTouched: result.runsTouched,
        stoppedBy: result.stoppedBy,
        errors: result.errors,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error('[graph-backfill] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
