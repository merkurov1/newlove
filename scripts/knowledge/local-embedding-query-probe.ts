#!/usr/bin/env tsx
/**
 * Diagnostic: use a local BGE-M3 vector to query the existing production index.
 * This verifies whether a local ONNX fallback is semantically compatible with
 * vectors stored through OpenRouter. Read-only.
 *
 *   npx tsx scripts/knowledge/local-embedding-query-probe.ts "data centers Putin"
 */
import dotenv from 'dotenv';
import { Client } from 'pg';
import { pipeline, env } from '@huggingface/transformers';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production.local' });
dotenv.config();
env.allowLocalModels = false;

function vectorLiteral(values: number[]) {
  return `[${values.map((value) => value.toFixed(8)).join(',')}]`;
}

async function main() {
  const query = process.argv.slice(2).join(' ').trim() || 'data centers Putin AI';
  const extractor = await pipeline('feature-extraction', 'Xenova/bge-m3', {
    dtype: 'fp32',
    device: 'cpu',
  });
  const output = await extractor([query], { pooling: 'cls', normalize: true });
  const vector = Array.from(output.data as Float32Array);

  const c = new Client({
    connectionString: process.env.DATABASE_URL || process.env.POSTGRES_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const { rows } = await c.query(
    `select document_id, document_title, similarity
       from brain_search_hybrid(
         $1::vector, 'baai/bge-m3', 1024, 'owner', $2::text,
         null, null, null, null, null, null, null, 8, -1
       )`,
    [vectorLiteral(vector), query]
  );
  await c.end();
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error) => {
  console.error('[local-embedding-query-probe]', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
