#!/usr/bin/env tsx
/**
 * Re-index media documents whose chunk table contains duplicate content
 * (the pre-2026-11-05 sliding-window chunker bug). Uses the same media queue
 * and the normal URL extractor; no chunks are deleted before the replacement.
 *
 *   npx tsx scripts/knowledge/reindex-duplicate-chunks.ts --report
 *   npx tsx scripts/knowledge/reindex-duplicate-chunks.ts --enqueue
 */
import dotenv from 'dotenv';
import { Client } from 'pg';

import { createBrainStore } from '@/lib/knowledge/brain/store';
import { enqueueMediaCoverageJob } from '@/lib/knowledge/media/queue';

dotenv.config({ path: '.env.local' });
dotenv.config({ path: '.env.production.local' });
dotenv.config();

function has(name: string) {
  return process.argv.includes(name);
}

async function main() {
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('DATABASE_URL_missing');
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    const idsArg = process.argv[process.argv.indexOf('--ids') + 1];
    const explicitIds =
      process.argv.includes('--ids') && idsArg
        ? idsArg.split(',').map((value) => value.trim()).filter(Boolean)
        : [];

    const rows = await client.query<{
      document_id: string;
      media_record_id: string;
      title: string;
      canonical_url: string;
      total: string;
      duplicates: string;
    }>(
      explicitIds.length > 0
        ? `select d.id document_id, m.id media_record_id, m.title, m.canonical_url,
                  '0'::text total, '0'::text duplicates
             from media_archive_records m
             join knowledge_documents d on d.media_record_id=m.id
            where m.id = any($1::uuid[])`
        : `select c.document_id, d.media_record_id, m.title, m.canonical_url,
                  count(*)::text total,
                  (count(*) - count(distinct c.content))::text duplicates
             from knowledge_chunks c
             join knowledge_documents d on d.id=c.document_id
             join media_archive_records m on m.id=d.media_record_id
            where m.canonical_url is not null
            group by c.document_id, d.media_record_id, m.title, m.canonical_url
           having count(*) - count(distinct c.content) > 0
           order by (count(*) - count(distinct c.content)) desc`,
      explicitIds.length > 0 ? [explicitIds] : []
    );

    console.log(`[duplicate-chunks] affected=${rows.rows.length}`);
    for (const row of rows.rows) {
      console.log(
        `  ${row.media_record_id} ${row.title} total=${row.total} duplicates=${row.duplicates}`
      );
    }

    if (!has('--enqueue')) return;

    const store = createBrainStore();
    if (!store) throw new Error('brain_store_unavailable');

    for (const row of rows.rows) {
      await enqueueMediaCoverageJob({
        store,
        mediaRecordId: row.media_record_id,
        inputUrl: row.canonical_url,
        source: 'duplicate_chunk_reindex',
        sourceFormat: 'url',
        requestedBy: 'opencode-audit',
      });
      console.log(`[duplicate-chunks] queued ${row.media_record_id}`);
    }
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('[duplicate-chunks] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
