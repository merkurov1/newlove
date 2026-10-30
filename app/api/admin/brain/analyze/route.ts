import { NextResponse } from 'next/server';

import { authorizeKnowledgeAdmin } from '@/lib/knowledge/adminAuth';
import { createBrainStore } from '@/lib/knowledge/brain/store';
import { tryNormalizeSourceUrl } from '@/lib/knowledge/brain/url';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const MAX_URLS = 200;

type AnalyzeStatus = 'new' | 'existing' | 'invalid' | 'duplicate_in_input';

type AnalyzeRow = {
  input: string;
  normalizedUrl: string | null;
  status: AnalyzeStatus;
  reason?: string;
  documentId?: string;
  title?: string;
};

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
      : typeof record.text === 'string'
        ? record.text.split(/\r?\n/)
        : [];

  return raw
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .slice(0, MAX_URLS);
}

export async function POST(request: Request) {
  const auth = await authorizeKnowledgeAdmin(request);

  if (!auth.ok) return json({ error: 'Unauthorized' }, 401);

  const store = createBrainStore();

  if (!store) return json({ error: 'Knowledge database is not configured.' }, 503);

  const body = await request.json().catch(() => ({}));
  const inputs = parseUrls(body);

  if (inputs.length === 0) return json({ error: 'Provide at least one URL.' }, 400);

  let documents: Awaited<ReturnType<typeof store.listArticleDocuments>>;

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

  const seen = new Set<string>();
  const rows: AnalyzeRow[] = [];

  for (const input of inputs) {
    const normalized = tryNormalizeSourceUrl(input);

    if (!normalized.url) {
      rows.push({
        input,
        normalizedUrl: null,
        status: 'invalid',
        reason: normalized.error || 'url_invalid',
      });
      continue;
    }

    if (seen.has(normalized.url)) {
      rows.push({
        input,
        normalizedUrl: normalized.url,
        status: 'duplicate_in_input',
        reason: 'This URL appears more than once in the pasted list.',
      });
      continue;
    }

    seen.add(normalized.url);

    const existing = byNormalized.get(normalized.url) || byCanonical.get(normalized.url);

    if (existing) {
      rows.push({
        input,
        normalizedUrl: normalized.url,
        status: 'existing',
        documentId: existing.id,
        title: existing.title,
        reason: 'Already indexed in Brain.',
      });
      continue;
    }

    rows.push({
      input,
      normalizedUrl: normalized.url,
      status: 'new',
    });
  }

  const summary = rows.reduce(
    (accumulator, row) => {
      accumulator[row.status] += 1;
      return accumulator;
    },
    { new: 0, existing: 0, invalid: 0, duplicate_in_input: 0 } as Record<AnalyzeStatus, number>
  );

  return json({
    status: 'ok',
    rows,
    summary,
    limits: { maxUrls: MAX_URLS },
    note:
      'Canonical URLs, full-text extraction and content-hash duplicates are verified when the queue processes each article.',
  });
}
