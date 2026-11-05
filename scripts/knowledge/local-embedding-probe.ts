#!/usr/bin/env tsx
/**
 * Diagnostic: compare a locally generated BGE-M3 vector with a vector stored by
 * OpenRouter for the same chunk. Used only to decide whether a local ONNX
 * embedding fallback is compatible. Not part of production runtime.
 *
 *   npx tsx scripts/knowledge/local-embedding-probe.ts
 */
import dotenv from 'dotenv';
import { Client } from 'pg';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production.local' });
dotenv.config();

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function main() {
  const c = new Client({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const { rows } = await c.query<{ id: string; content: string; emb: string }>(
    `select id, content, embedding::text emb from knowledge_chunks
      where embedding is not null and length(content) between 500 and 1200 order by length(content) asc limit 1`
  );
  await c.end();
  const row = rows[0];
  if (!row) throw new Error('no_chunks');
  const stored = JSON.parse(row.emb);
  console.log(`chunk=${row.id} chars=${row.content.length} storedDims=${stored.length}`);

  const moduleName = '@huggingface/transformers';
  const transformers = await import(moduleName);
  transformers.env.allowLocalModels = false;
  const extractor = await transformers.pipeline('feature-extraction', 'Xenova/bge-m3', {
    dtype: 'fp32',
    device: 'cpu',
  });
  const output = await extractor([row.content], { pooling: 'cls', normalize: true });
  const local = Array.from(output.data as Float32Array);
  console.log(`localDims=${local.length} cosine=${cosine(local, stored).toFixed(6)}`);
}

main().catch((error) => {
  console.error('[local-embedding-probe]', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
