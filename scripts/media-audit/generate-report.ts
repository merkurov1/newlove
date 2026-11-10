import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
dotenv.config({ path: '.env.production.local', quiet: true });

import {
  getMediaArchiveStats,
  getMediaDiagnostics,
} from '@/lib/knowledge/media/catalog';
import { mediaQuery } from '@/lib/knowledge/media/database';
import { planMediaIngestionRetries } from '@/lib/knowledge/media/retry';

function table(headers: string[], rows: string[][]): string {
  const escape = (value: string) => value.replace(/\|/g, '\\|').replace(/\n/g, ' ');
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`),
  ].join('\n');
}

async function main(): Promise<void> {
  const [stats, diagnostics, topicMismatches, failedRuns, retryPlan] = await Promise.all([
    getMediaArchiveStats({ status: 'all' }),
    getMediaDiagnostics({ limit: 1000 }),
    mediaQuery<Record<string, unknown>>(
      `SELECT t.media_record_id, m.title, m.outlet, t.primary_topic, m.topic AS editorial_topic
       FROM public.media_analysis_topics t
       JOIN public.media_archive_records m ON m.id = t.media_record_id
       WHERE t.is_current AND t.primary_topic IS DISTINCT FROM m.topic
       ORDER BY m.published_date DESC`
    ),
    mediaQuery<Record<string, unknown>>(
      `SELECT r.id, r.media_record_id, m.title, m.outlet, r.status, r.attempt, r.max_attempts,
              r.error_code, r.error_detail
       FROM public.media_analysis_runs r
       LEFT JOIN public.media_archive_records m ON m.id = r.media_record_id
       WHERE r.status <> 'completed'
       ORDER BY r.created_at DESC`
    ),
    planMediaIngestionRetries({ limit: 500 }),
  ]);

  const problemRows = diagnostics.rows;
  const noDocument = problemRows.filter((row) => !row.documentId);
  const retryable = retryPlan.filter((row) => row.action === 'retry');

  const lines: string[] = [
    '# Media Archive remediation — 2026-11-10',
    '',
    'Read-only audit performed against production before changes; the only data mutation',
    'was the `knowledge_documents.media_outlet` consistency repair described below.',
    '',
    '## Snapshot',
    '',
    table(
      ['Metric', 'Value'],
      [
        ['Media records', String(stats.total)],
        ['Published / draft', `${stats.published} / ${stats.draft}`],
        ['Own publications', String(stats.own)],
        ['External mentions', String(stats.mentions)],
        ['Outlets / languages', `${stats.outlets} / ${stats.byLanguage.length}`],
        ['Date range', `${stats.range.from || '—'} — ${stats.range.to || '—'}`],
        ['Full text / partial / metadata-only / blocked', `${stats.coverage.fullText} / ${stats.coverage.partialText} / ${stats.coverage.metadataOnly} / ${stats.coverage.blocked}`],
        ['No linked Brain document', String(stats.coverage.missingDocument)],
        ['Indexing completed / failed / partial / blocked / not_indexed', `${stats.indexing.completed} / ${stats.indexing.failed} / ${stats.indexing.partial} / ${stats.indexing.blocked} / ${stats.indexing.notIndexed}`],
        ['Documents without chunks', String(stats.documents.withoutChunks)],
        ['Missing embeddings', String(stats.documents.embeddingMissing)],
        ['Current quotes / topics / entities / relations', `${stats.analysis.currentQuotes} / ${stats.analysis.topics} / ${stats.analysis.entities} / ${stats.analysis.relations}`],
        ['Brain documents without Media', String(diagnostics.summary.brainDocumentsWithoutMedia)],
        ['Duplicate canonical / title / content_hash / quotes', `${diagnostics.summary.duplicateCanonical} / ${diagnostics.summary.duplicateTitle} / ${diagnostics.summary.duplicateContentHash} / ${diagnostics.summary.duplicateQuotes}`],
      ]
    ),
    '',
    '## Problem records',
    '',
    'Every row below is a Media record whose extraction/indexing state is not a clean',
    'full-text completion, or which has no linked Brain document.',
    '',
    table(
      ['ID', 'Title', 'Outlet', 'Date', 'Coverage', 'Text quality', 'Error', 'Class', 'Retry', 'Recommended action'],
      problemRows.map((row) => [
        row.id,
        row.title,
        row.outlet,
        row.publishedDate || '—',
        row.coverageStatus || 'no-document',
        row.textQuality || 'no-text',
        row.errorCode || '—',
        row.failure.class,
        row.failure.retryable ? 'yes' : 'no',
        row.failure.recommendedAction,
      ])
    ),
    '',
    `## Media records without a linked Brain document (${noDocument.length})`,
    '',
    noDocument.length === 0
      ? '_None._'
      : table(
          ['ID', 'Title', 'Outlet', 'Date', 'Kind', 'Recommended action'],
          noDocument.map((row) => [
            row.id,
            row.title,
            row.outlet,
            row.publishedDate || '—',
            row.kind || '—',
            row.failure.recommendedAction,
          ])
        ),
    '',
    'These are profile/author pages, a radio page and a video page. Their metadata is',
    'available; no full text was ever captured. They are intentionally left without a',
    'fake Brain document and are reported as `metadata_only`/`no-document`.',
    '',
    `## Brain documents without a Media link (${diagnostics.brainWithoutMedia.length})`,
    '',
    table(
      ['ID', 'Title', 'Source type', 'Ingestion status', 'Why'],
      diagnostics.brainWithoutMedia.map((row) => [
        row.id,
        row.title,
        row.sourceType || '—',
        row.ingestionStatus || '—',
        row.reason,
      ])
    ),
    '',
    '## Informational consistency findings',
    '',
    `- Derived analysis topic differs from the editorial archive topic: ${topicMismatches.length}. Both values are retained; the derived value is not allowed to overwrite the editorial classification.`,
    `- Outlet mismatch: ${diagnostics.summary.outletMismatch} (one "Pasted text" value was repaired to the archive outlet).`,
    `- Date mismatch: ${diagnostics.summary.dateMismatch}.`,
    `- Multiple current topics / roles: ${diagnostics.summary.multiCurrentTopic} / ${diagnostics.summary.multiCurrentRole}.`,
    `- Duplicate canonical / title+outlet+date / content hash / quote hash: ${diagnostics.summary.duplicateCanonical} / ${diagnostics.summary.duplicateTitle} / ${diagnostics.summary.duplicateContentHash} / ${diagnostics.summary.duplicateQuotes}.`,
    '',
    '### Topic differences',
    '',
    topicMismatches.length === 0
      ? '_None._'
      : table(
          ['Media record', 'Title', 'Outlet', 'Derived topic', 'Editorial topic'],
          topicMismatches.map((row) => [
            String(row.media_record_id),
            String(row.title || ''),
            String(row.outlet || ''),
            String(row.primary_topic || ''),
            String(row.editorial_topic || ''),
          ])
        ),
    '',
    '## Failed analysis runs',
    '',
    failedRuns.length === 0
      ? '_None._'
      : table(
          ['Run ID', 'Media record', 'Title', 'Status', 'Attempt', 'Error'],
          failedRuns.map((row) => [
            String(row.id),
            String(row.media_record_id || '—'),
            String(row.title || '—'),
            String(row.status),
            `${row.attempt}/${row.max_attempts}`,
            String(row.error_code || row.error_detail || '—'),
          ])
        ),
    '',
    '## Safe retry plan',
    '',
    `Retryable jobs with remaining budget: ${retryable.length}.`,
    '',
    retryable.length === 0
      ? 'No automatic retry was executed. The remaining failures are permanent access/paywall/metadata-only cases, or the retry budget is exhausted. This is intentional: the system does not bypass paywalls or access restrictions.'
      : table(
          ['Media record', 'Title', 'Outlet', 'Error', 'Attempts', 'Class'],
          retryable.map((row) => [
            row.mediaRecordId,
            row.title,
            row.outlet,
            row.errorCode || '—',
            `${row.attempts}/${row.maxAttempts}`,
            row.failure.class,
          ])
        ),
    '',
    'The retryable jobs above were **not executed** in this workspace because the',
    'embedding provider key is redacted here. After restoring `OPENROUTER_API_KEY`,',
    'run `POST /api/admin/media/retry` with `{ "execute": true, "limit": 2 }`. The',
    'operation is idempotent per `media_record_id` and preserves existing content.',
    '',
    '## Remaining blockers',
    '',
    '- `OPENROUTER_API_KEY` and `DEEPSEEK_API_KEY` in `.env.production.local` are redacted placeholders in this workspace. New query embeddings and model retries cannot be executed here. The migration and read-only RPC probes use existing production vectors and do not need those secrets.',
    '- 3 blocked HTTP 401/403 sources, 1 paywall source, 1 HTTP 402 source and 1 HTTP 404 source cannot be recovered without changing access controls or the source URL. They are preserved as metadata-only/blocked and reported honestly.',
    '- 11 records remain metadata-only because the source exposed no article body. They are not marked as full-text indexed.',
    '',
  ];

  const out = path.join(process.cwd(), 'docs', 'audits', 'media-remediation-2026-11-10.md');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, lines.join('\n'), 'utf8');
  console.log(out);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
