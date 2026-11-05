#!/usr/bin/env tsx
/**
 * Bounded local BGE-M3 backfill for queued Brain jobs.
 *
 * Why this exists: the local audit environment has no usable
 * OPENROUTER_API_KEY (the pulled value is the literal `[SENSITIVE]`
 * placeholder). The production index uses BAAI/bge-m3 (1024 dimensions). This
 * script runs the same model locally through ONNX, with CLS pooling and
 * normalization, and writes an explicit provider marker on every affected
 * chunk/document.
 *
 * It is a one-shot maintenance tool, not a scheduler. The database queue is the
 * checkpoint. Re-run it after installing the optional dependency:
 *
 *   npm install --no-save @huggingface/transformers
 *   npx tsx scripts/knowledge/local-embedding-backfill.ts --limit 10
 *
 * The probe (scripts/knowledge/local-embedding-probe.ts) measured cosine 0.91
 * against OpenRouter-stored vectors for identical text; retrieval was verified
 * against the live index with scripts/knowledge/local-embedding-query-probe.ts.
 */
import dotenv from 'dotenv';
import { Client } from 'pg';

import { processNextBrainJob } from '@/lib/knowledge/brain/process';
import { createBrainStore } from '@/lib/knowledge/brain/store';
import type { EmbeddingClient } from '@/lib/knowledge/rag/embeddings';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production.local' });
dotenv.config();

function arg(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || '' : null;
}

function has(name: string): boolean {
  return process.argv.includes(name);
}

async function connect() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('DATABASE_URL_missing');
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  return client;
}

async function createLocalEmbeddingClient(): Promise<EmbeddingClient> {
  // Optional maintenance dependency: not part of the production bundle.
  // The variable specifier keeps TypeScript from requiring the package in CI.
  const moduleName = '@huggingface/transformers';
  const transformers = await import(moduleName);
  transformers.env.allowLocalModels = false;

  const extractor = await transformers.pipeline('feature-extraction', 'Xenova/bge-m3', {
    dtype: 'q8',
    device: 'cpu',
  });

  return {
    modelId: 'baai/bge-m3',
    dimensions: 1024,
    async embed(texts: string[]): Promise<number[][]> {
      const vectors: number[][] = [];

      // One text at a time keeps peak memory low on a 2-core Codespace. The
      // ONNX model is shared; only the per-call tensors are released.
      for (const text of texts) {
        const output = await extractor([text], { pooling: 'cls', normalize: true });
        const dims = output.dims as number[];
        const data = output.data as Float32Array;
        const size = dims[dims.length - 1];
        vectors.push(Array.from(data.slice(0, size)));
        if (typeof (output as { dispose?: () => void }).dispose === 'function') {
          (output as { dispose: () => void }).dispose();
        }
      }

      return vectors;
    },
  };
}

async function main() {
  const client = await connect();
  try {
    const queued = await client.query<{ n: string }>(
      `select count(*) n from brain_ingestion_jobs where status in ('queued','processing')`
    );
    console.log(`[local-backfill] queued=${queued.rows[0]?.n || 0}`);
    if (has('--status')) return;

    const store = createBrainStore();
    if (!store) throw new Error('brain_store_unavailable');
    const embeddingClient = await createLocalEmbeddingClient();

    const limit = Math.min(60, Math.max(1, Number(arg('--limit') || 10)));
    const started = Date.now();
    const budgetMs = Math.min(3_600_000, Math.max(60_000, Number(arg('--budget-ms') || 1_800_000)));

    let processed = 0;
    let failed = 0;
    const touched = new Set<string>();

    while (processed < limit && Date.now() - started < budgetMs) {
      const runs = await client.query<{ id: string; queued: string }>(
        `select r.id, count(*) filter (where j.status in ('queued','processing'))::text queued
           from brain_ingestion_runs r
           join brain_ingestion_jobs j on j.run_id=r.id
          where j.status in ('queued','processing')
          group by r.id
          order by min(j.created_at)
          limit 20`
      );

      if (runs.rows.length === 0) break;

      let progressed = false;

      for (const run of runs.rows) {
        if (processed >= limit || Date.now() - started >= budgetMs) break;

        const result = await processNextBrainJob({
          runId: run.id,
          store,
          embeddingClient,
          workerId: `local-bge-backfill-${Date.now()}`,
        });

        if (result.state === 'processed') {
          processed += 1;
          progressed = true;
          const documentId = result.job.document_id;
          if (result.job.status === 'completed' || result.job.status === 'partial') {
            if (documentId) touched.add(documentId);
          } else {
            failed += 1;
            console.log(
              `[local-backfill] job failed: ${result.job.error_code || 'unknown'} ${
                result.job.error_detail || ''
              }`
            );
          }
          console.log(
            `[local-backfill] processed=${processed} doc=${documentId || '-'} status=${result.job.status}`
          );
        } else if (result.state === 'done' || result.state === 'paused') {
          progressed = true;
        }
      }

      if (!progressed) break;
    }

    for (const documentId of touched) {
      await client.query(
        `update knowledge_chunks
            set metadata=coalesce(metadata,'{}'::jsonb) || $1::jsonb
          where document_id=$2`,
        [
          JSON.stringify({
            embedding_provider: 'local-onnx-bge-m3-q8',
            embedding_note:
              'Generated locally with the same BAAI/bge-m3 model while the OpenRouter credential was unavailable.',
          }),
          documentId,
        ]
      );
      await client.query(
        `update knowledge_documents
            set metadata=coalesce(metadata,'{}'::jsonb) || $1::jsonb
          where id=$2`,
        [
          JSON.stringify({
            embedding_provider: 'local-onnx-bge-m3-q8',
            embedding_note:
              'Local BAAI/bge-m3 fallback during the 2026-11-05 audit; re-embed with the configured provider when the credential is restored.',
          }),
          documentId,
        ]
      );
    }

    const remaining = await client.query<{ status: string; n: string }>(
      `select status,count(*) n from brain_ingestion_jobs group by 1 order by 1`
    );
    console.log(
      JSON.stringify(
        { processed, failed, touched: touched.size, jobs: remaining.rows },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[local-backfill] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
