import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { computeBrainProgress, type BrainProgress } from '@/lib/knowledge/brain/process';
import { createBrainStore } from '@/lib/knowledge/brain/store';
import { tryNormalizeSourceUrl } from '@/lib/knowledge/brain/url';
import { assertEnqueueLimit, assertQueueCapacity } from '@/lib/operations/budgets';
import { maxEnqueuePerRequest } from '@/lib/operations/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_URLS = maxEnqueuePerRequest();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, max-age=0, must-revalidate',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

function parseUrls(body: unknown): string[] {
  if (!body || typeof body !== 'object') return [];

  const record = body as Record<string, unknown>;
  const raw = Array.isArray(record.urls)
    ? record.urls
    : typeof record.urls === 'string'
      ? record.urls.split(/\r?\n/)
      : [];

  return raw
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .slice(0, MAX_URLS);
}

type SkippedRow = {
  input: string;
  normalizedUrl: string | null;
  reason: string;
  documentId?: string;
  title?: string;
  runId?: string;
};

export async function GET(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = createBrainStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  try {
    const runs = await store.listRecentRuns(10);
    const jobs = await store.getJobsForRuns(runs.map((run) => run.id));
    const byRun = new Map<string, typeof jobs>();

    for (const job of jobs) {
      const list = byRun.get(job.run_id) || [];
      list.push(job);
      byRun.set(job.run_id, list);
    }

    return json({
      status: 'ok',
      runs: runs.map((run) => ({
        run,
        progress: computeBrainProgress(byRun.get(run.id) || []),
      })),
    });
  } catch {
    return json({ error: 'Could not read ingestion runs.' }, 503);
  }
}

export async function POST(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = createBrainStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const body = await request.json().catch(() => ({}));
  const inputs = parseUrls(body);
  const recheckExisting =
    Boolean(body) &&
    typeof body === 'object' &&
    (body as Record<string, unknown>).recheckExisting === true;

  if (inputs.length === 0) return json({ error: 'Provide at least one URL.' }, 400);

  try {
    assertEnqueueLimit(inputs.length);
    await assertQueueCapacity('brain');
  } catch (error) {
    const code = error instanceof Error ? error.message : 'queue_limit_reached';
    return json({ error: code }, code.startsWith('queue_limit') ? 429 : 503);
  }

  let documents: Awaited<ReturnType<typeof store.listArticleDocuments>>;
  let activeJobs: Awaited<ReturnType<typeof store.findActiveJobsByUrls>>;

  try {
    documents = await store.listArticleDocuments();
  } catch {
    return json({ error: 'Could not read existing Brain documents.' }, 503);
  }

  const byNormalized = new Map<string, (typeof documents)[number]>();
  const byCanonical = new Map<string, (typeof documents)[number]>();

  for (const document of documents) {
    if (document.normalized_url) byNormalized.set(document.normalized_url, document);
    if (document.canonical_url) byCanonical.set(document.canonical_url, document);
  }

  const candidates: Array<{ inputUrl: string; normalizedUrl: string }> = [];
  const skipped: SkippedRow[] = [];
  const seen = new Set<string>();

  for (const input of inputs) {
    const normalized = tryNormalizeSourceUrl(input);

    if (!normalized.url) {
      skipped.push({
        input,
        normalizedUrl: null,
        reason: normalized.error || 'url_invalid',
      });
      continue;
    }

    if (seen.has(normalized.url)) {
      skipped.push({
        input,
        normalizedUrl: normalized.url,
        reason: 'duplicate_in_input',
      });
      continue;
    }

    seen.add(normalized.url);

    const existing = byNormalized.get(normalized.url) || byCanonical.get(normalized.url);

    if (existing && !recheckExisting) {
      skipped.push({
        input,
        normalizedUrl: normalized.url,
        reason: 'existing',
        documentId: existing.id,
        title: existing.title,
      });
      continue;
    }

    candidates.push({ inputUrl: input, normalizedUrl: normalized.url });
  }

  try {
    activeJobs = await store.findActiveJobsByUrls(candidates.map((row) => row.normalizedUrl));
  } catch {
    return json({ error: 'Could not read the ingestion queue.' }, 503);
  }

  const activeByUrl = new Map(activeJobs.map((job) => [job.normalized_url, job.run_id]));
  const queued = candidates.filter((candidate) => {
    const runId = activeByUrl.get(candidate.normalizedUrl);

    if (!runId) return true;

    skipped.push({
      input: candidate.inputUrl,
      normalizedUrl: candidate.normalizedUrl,
      reason: 'already_queued',
      runId,
    });

    return false;
  });

  if (queued.length === 0) {
    return json({
      status: 'noop',
      run: null,
      jobs: [],
      skipped,
      progress: null,
      message: 'Nothing new to process.',
    });
  }

  let run;

  try {
    run = await store.createRun({
      requested: inputs.length,
      accepted: queued.length,
      source: 'admin_bulk_url',
    });

    await store.insertJobs(run.id, queued);
  } catch {
    return json({ error: 'Could not create the ingestion queue.' }, 503);
  }

  let jobs: Awaited<ReturnType<typeof store.getJobs>>;

  try {
    jobs = await store.getJobs(run.id);
  } catch {
    return json({ error: 'Queue was created but could not be read.' }, 503);
  }

  const progress: BrainProgress = computeBrainProgress(jobs);

  return json({
    status: 'ok',
    run,
    jobs,
    skipped,
    progress,
  });
}
