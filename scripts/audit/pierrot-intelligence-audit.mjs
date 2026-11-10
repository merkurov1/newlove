#!/usr/bin/env node
/**
 * Read-only production audit for the Pierrot intelligence layer.
 *
 * Usage:
 *   node scripts/audit/pierrot-intelligence-audit.mjs
 *   node scripts/audit/pierrot-intelligence-audit.mjs --json
 *
 * It reads DATABASE_URL from .env.production.local/.env.local when present and
 * never prints credentials, document text or conversation content.
 */

import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

function loadEnv() {
  const env = {};

  for (const file of ['.env.production.local', '.env.local', '.env']) {
    const full = path.resolve(process.cwd(), file);
    if (!fs.existsSync(full)) continue;

    for (const line of fs.readFileSync(full, 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!match) continue;
      const value = match[2].trim().replace(/^['"]|['"]$/g, '');
      if (!(match[1] in env)) env[match[1]] = value;
    }
  }

  return env;
}

const env = { ...loadEnv(), ...process.env };

if (!env.DATABASE_URL) {
  console.error('DATABASE_URL is not configured.');
  process.exit(2);
}

const client = new pg.Pool({
  connectionString: env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 4,
});

async function rows(sql) {
  const result = await client.query(sql);
  return result.rows;
}

async function scalar(sql) {
  const result = await client.query(sql);
  const row = result.rows[0] || {};
  return Number(Object.values(row)[0] || 0);
}

try {
  const [
    documents,
    documentTypes,
    documentStatuses,
    noChunks,
    missingEmbeddings,
    chunkMismatch,
    duplicateHashes,
    ingestionJobs,
    graphJobs,
    graphRuns,
    graphCoverage,
    graphTotals,
    mediaStatuses,
    mediaLinks,
    mediaAnalysis,
    journal,
    flow,
    conversations,
    memories,
    projects,
    scheduler,
    vault,
    stale,
  ] = await Promise.all([
    scalar('select count(*) from knowledge_documents'),
    rows('select source_type, count(*)::int n from knowledge_documents group by 1 order by 2 desc'),
    rows(
      'select ingestion_status, count(*)::int n from knowledge_documents group by 1 order by 2 desc'
    ),
    scalar(
      "select count(*) from knowledge_documents d where d.ingestion_status='completed' and not exists (select 1 from knowledge_chunks c where c.document_id=d.id)"
    ),
    scalar('select count(*) from knowledge_chunks where embedding is null'),
    scalar(`
      select count(*) from (
        select d.id,d.chunk_count,count(c.id) actual
        from knowledge_documents d
        left join knowledge_chunks c on c.document_id=d.id
        where d.ingestion_status='completed'
        group by d.id
        having d.chunk_count <> count(c.id)
      ) x
    `),
    scalar(`
      select count(*) from (
        select content_hash
        from knowledge_documents
        where content_hash is not null and ingestion_status='completed'
        group by 1 having count(*)>1
      ) x
    `),
    rows(
      'select status, count(*)::int n from brain_ingestion_jobs group by 1 order by 2 desc'
    ),
    rows('select status, count(*)::int n from brain_graph_jobs group by 1 order by 2 desc'),
    rows('select status, count(*)::int n from brain_graph_runs group by 1 order by 2 desc'),
    scalar(`
      select count(*) from knowledge_documents d
      where d.ingestion_status='completed'
        and not exists (
          select 1 from brain_document_extractions e
          where e.document_id=d.id and e.status='completed'
        )
    `),
    rows(`
      select
        (select count(*)::int from brain_entities) entities,
        (select count(*)::int from brain_relationships) relationships,
        (select count(*)::int from brain_relationships where inference) inferred,
        (select count(*)::int from brain_relationships where not inference) explicit
    `),
    rows(
      'select indexing_status, count(*)::int n from media_archive_records group by 1 order by 2 desc'
    ),
    rows(`
      select
        count(*)::int total,
        count(d.id)::int linked,
        count(*) filter (where d.id is null)::int unlinked
      from media_archive_records m
      left join knowledge_documents d on d.media_record_id=m.id
    `),
    rows('select status, count(*)::int n from media_analysis_runs group by 1 order by 2 desc'),
    rows(`
      select
        count(*) filter (where status='published' and published=true and kind='issue')::int published_issues,
        count(*) filter (where status='draft' and kind='issue')::int draft_issues,
        max("publishedAt") last_published
      from letters
    `),
    rows(`
      select
        count(*) filter (where status='published' and visibility='public')::int published_items,
        count(*) filter (where status='draft')::int draft_items,
        max(published_at) last_published
      from items
    `),
    scalar('select count(*) from pierrot_conversations'),
    scalar('select count(*) from pierrot_context_summaries'),
    scalar('select count(*) from pierrot_projects'),
    rows(`
      select
        (select count(*)::int from cron.job) cron_jobs,
        (select max(start_time) from cron.job_run_details) last_cron_run
    `),
    rows(`
      select
        exists(select 1 from vault.secrets where name='brain_worker_base_url') base_url_configured,
        exists(select 1 from vault.secrets where name='brain_worker_cron_secret') cron_secret_configured
    `),
    rows(`
      select
        (select count(*)::int from brain_ingestion_jobs where status='queued' and retry_after < now() - interval '10 minutes') stale_brain_jobs,
        (select count(*)::int from brain_graph_jobs where status='processing' and (locked_at is null or locked_at < now() - interval '15 minutes')) stale_graph_jobs,
        (select count(*)::int from media_analysis_runs where status='processing' and (lease_expires_at is null or lease_expires_at < now())) stale_media_jobs,
        (select count(*)::int from brain_ingestion_runs where status='running' and updated_at < now() - interval '15 minutes') stale_brain_runs,
        (select count(*)::int from brain_graph_runs where status='running' and updated_at < now() - interval '15 minutes') stale_graph_runs
    `),
  ]);

  const report = {
    generatedAt: new Date().toISOString(),
    brain: {
      documents,
      documentTypes,
      documentStatuses,
      completedWithoutChunks: noChunks,
      missingEmbeddings,
      chunkCountMismatch: chunkMismatch,
      duplicateContentHashes: duplicateHashes,
      ingestionJobs,
      completedWithoutGraph: graphCoverage,
    },
    graph: {
      jobs: graphJobs,
      runs: graphRuns,
      totals: graphTotals[0],
    },
    media: {
      indexingStatuses: mediaStatuses,
      links: mediaLinks[0],
      analysisRuns: mediaAnalysis,
    },
    journal: journal[0],
    flow: flow[0],
    conversations,
    contextSummaries: memories,
    projects,
    scheduler: {
      ...scheduler[0],
      ...vault[0],
      ...stale[0],
    },
  };

  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log('# Pierrot intelligence audit');
    console.log(`Generated: ${report.generatedAt}`);
    console.log('\n## Brain');
    console.log(`Documents: ${documents}`);
    console.log(`Completed without chunks: ${noChunks}`);
    console.log(`Missing embeddings: ${missingEmbeddings}`);
    console.log(`Chunk-count mismatches: ${chunkMismatch}`);
    console.log(`Duplicate completed content hashes: ${duplicateHashes}`);
    console.log(`Completed without graph extraction: ${graphCoverage}`);
    console.log('Ingestion jobs:', Object.fromEntries(ingestionJobs.map((r) => [r.status, r.n])));
    console.log('\n## Graph');
    console.log('Jobs:', Object.fromEntries(graphJobs.map((r) => [r.status, r.n])));
    console.log('Runs:', Object.fromEntries(graphRuns.map((r) => [r.status, r.n])));
    console.log(
      `Entities: ${graphTotals[0].entities}; relationships: ${graphTotals[0].relationships}; inferred: ${graphTotals[0].inferred}`
    );
    console.log('\n## Media');
    console.log(
      'Indexing:',
      Object.fromEntries(mediaStatuses.map((r) => [r.indexing_status || 'null', r.n]))
    );
    console.log(
      `Records: ${mediaLinks[0].total}; linked: ${mediaLinks[0].linked}; unlinked: ${mediaLinks[0].unlinked}`
    );
    console.log(
      'Analysis runs:',
      Object.fromEntries(mediaAnalysis.map((r) => [r.status, r.n]))
    );
    console.log('\n## Journal / Flow');
    console.log(
      `Journal: ${journal[0].published_issues} published, ${journal[0].draft_issues} drafts, last ${journal[0].last_published || '—'}`
    );
    console.log(
      `Flow: ${flow[0].published_items} published, ${flow[0].draft_items} drafts, last ${flow[0].last_published || '—'}`
    );
    console.log('\n## Memory / projects');
    console.log(`Conversations: ${conversations}; context summaries: ${memories}; projects: ${projects}`);
    console.log('\n## Scheduler and stale work');
    console.log(report.scheduler);
  }
} finally {
  await client.end();
}
