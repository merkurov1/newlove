/**
 * Focused, idempotent import of the 2006–2015 early-period research records.
 *
 * Usage:
 *   node --experimental-strip-types --no-warnings scripts/media-audit/import-early-period.ts
 *   node --experimental-strip-types --no-warnings scripts/media-audit/import-early-period.ts --apply
 *
 * Dry-run is the default. `--apply` needs NEXT_PUBLIC_SUPABASE_URL (or
 * SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY in `.env.local` /
 * `.env.production.local` / the process environment. No secret is printed.
 *
 * The script reads only the 34 URLs from the verified manifest, so it does not
 * bulk-import unrelated local fallback records. Existing canonical URLs are
 * skipped. Brain ingestion is intentionally left to
 * `scripts/knowledge/reconcile-media-rag.ts --apply`, whose queue helper
 * deduplicates active jobs.
 */
import fs from 'node:fs';
import path from 'node:path';

import dotenv from 'dotenv';

import { records, type MediaRecord } from '../../data/media.ts';

type ConfirmedCandidate = {
  date: string;
  outlet: string;
  title: string;
  url: string;
  lang: string;
  kind: string;
};

type Manifest = {
  confirmed: ConfirmedCandidate[];
};

type InsertPayload = {
  url: string;
  canonical_url: string;
  title: string;
  outlet: string;
  author: string | null;
  published_date: string;
  lang: string;
  kind: string;
  topic: string;
  summary: string;
  image_url: null;
  status: 'published';
  ai_metadata: Record<string, unknown>;
};

function normalizeUrl(value: string): string {
  const url = new URL(value);
  url.hash = '';
  return url.toString();
}

function normalizeDate(value: string): string {
  if (/^\d{4}$/.test(value)) return `${value}-01-01`;
  if (/^\d{4}-\d{2}$/.test(value)) return `${value}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  throw new Error(`Invalid date: ${value}`);
}

function payload(record: MediaRecord): InsertPayload {
  return {
    url: record.url,
    canonical_url: normalizeUrl(record.url),
    title: record.title,
    outlet: record.outlet,
    author: record.author || null,
    published_date: normalizeDate(record.date),
    lang: record.lang,
    kind: record.kind,
    topic: record.topic,
    summary: record.summary,
    image_url: null,
    status: 'published',
    ai_metadata: {
      source: 'data/media.ts',
      slug: record.slug,
      program: record.program ?? null,
      note: record.note ?? null,
      original_date: record.date,
      research: 'media-early-period-2026-11-22',
      imported: true,
    },
  };
}

async function main(): Promise<void> {
  const manifestPath = path.resolve('data/media-audit/early-period-2026-11-22.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Manifest;

  const byUrl = new Map(records.map((record) => [record.url, record]));
  const selected = manifest.confirmed.map((candidate) => {
    const record = byUrl.get(candidate.url);
    if (!record) {
      throw new Error(`Manifest URL is absent from data/media.ts: ${candidate.url}`);
    }
    return record;
  });

  const unique = new Map(selected.map((record) => [record.url, record]));
  if (unique.size !== selected.length) {
    throw new Error('Manifest contains duplicate URLs.');
  }

  const apply = process.argv.includes('--apply');
  const planned = [...unique.values()].sort((a, b) => a.date.localeCompare(b.date));

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          manifest: path.relative(process.cwd(), manifestPath),
          candidates: planned.length,
          years: planned.reduce<Record<string, number>>((acc, record) => {
            const year = record.date.slice(0, 4);
            acc[year] = (acc[year] || 0) + 1;
            return acc;
          }, {}),
          urls: planned.map((record) => normalizeUrl(record.url)),
          next: 'Run with --apply to insert missing canonical URLs.',
        },
        null,
        2
      )
    );
    return;
  }

  dotenv.config({ path: '.env.local', quiet: true });
  dotenv.config({ path: '.env.production.local', quiet: true });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY.'
    );
  }

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const canonicalUrls = planned.map((record) => normalizeUrl(record.url));
  const existing = new Set<string>();

  for (let index = 0; index < canonicalUrls.length; index += 100) {
    const chunk = canonicalUrls.slice(index, index + 100);
    const { data, error } = await supabase
      .from('media_archive_records')
      .select('canonical_url')
      .in('canonical_url', chunk);

    if (error) throw error;
    for (const row of data ?? []) {
      if (row.canonical_url) existing.add(normalizeUrl(row.canonical_url));
    }
  }

  const toInsert = planned.filter((record) => !existing.has(normalizeUrl(record.url))).map(payload);

  let inserted = 0;
  for (let index = 0; index < toInsert.length; index += 50) {
    const batch = toInsert.slice(index, index + 50);
    const { error } = await supabase.from('media_archive_records').insert(batch);

    if (error) throw error;
    inserted += batch.length;
    console.log(`inserted ${inserted}/${toInsert.length}`);
  }

  const { count, error: countError } = await supabase
    .from('media_archive_records')
    .select('id', { count: 'exact', head: true });

  if (countError) throw countError;

  console.log(
    JSON.stringify(
      {
        mode: 'apply',
        candidates: planned.length,
        alreadyPresent: existing.size,
        inserted,
        totalMediaRecords: count,
        next: 'Run scripts/knowledge/reconcile-media-rag.ts --apply to enqueue Brain coverage.',
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
