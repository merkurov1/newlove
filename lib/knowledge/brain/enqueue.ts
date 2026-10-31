import type {
  BrainEnqueueRow,
  BrainSourceDescriptor,
  BrainSourceKind,
  BrainSourceType,
} from './sourceTypes';
import { BRAIN_SOURCE_LIMITS } from './sourceTypes';
import {
  BrainSourceError,
  decodeUtf8Strict,
  sourceFormatForKind,
  sourceObjectPathFromPath,
  sourceTypeForKind,
  syntheticSourceUrl,
  validateMetadataOverride,
  validatePdfBuffer,
  validateTxtBuffer,
} from './sourceValidation';
import { createBrainStorage } from './storage';
import { createBrainStore, type BrainJobRow, type BrainRunRow } from './store';
import { normalizeSourceUrl } from './url';

export type EnqueueResult = {
  startRun: BrainRunRow | null;
  jobs: BrainJobRow[];
  rows: BrainEnqueueRow[];
  skipped: BrainEnqueueRow[];
};

type PreparedJob = {
  descriptor: BrainSourceDescriptor;
  inputUrl: string;
  normalizedUrl: string;
  sourceType: BrainSourceType;
  sourceFormat: ReturnType<typeof sourceFormatForKind>;
  storagePath: string | null;
  sourceSha256: string | null;
  originalFilename: string | null;
  mimeType: string | null;
  byteSize: number | null;
  pageCount: number | null;
  titleOverride: string | null;
  authorOverride: string | null;
  publishedAtOverride: string | null;
  languageOverride: string | null;
};

function inputLabel(source: BrainSourceDescriptor): string {
  if (source.kind === 'url') return source.url || '';
  if (source.kind === 'text') return 'Pasted text';
  return source.originalFilename || source.storagePath || source.kind.toUpperCase();
}

function row(
  source: BrainSourceDescriptor,
  status: BrainEnqueueRow['status'],
  extra: Partial<BrainEnqueueRow> = {}
): BrainEnqueueRow {
  return {
    input: inputLabel(source),
    kind: source.kind,
    status,
    ...extra,
  };
}

export async function enqueueBrainSources(input: {
  sources: BrainSourceDescriptor[];
  requestedBy?: string | null;
  recheckExisting?: boolean;
}): Promise<EnqueueResult> {
  const store = createBrainStore();

  if (!store) {
    throw new BrainSourceError('brain_database_unavailable', undefined, { status: 503 });
  }

  const storage = createBrainStorage();

  if (!storage) {
    throw new BrainSourceError('storage_not_configured', undefined, { status: 503 });
  }

  const sources = input.sources.slice(0, BRAIN_SOURCE_LIMITS.maxUrls);
  const rows: BrainEnqueueRow[] = [];
  const skipped: BrainEnqueueRow[] = [];
  const prepared: PreparedJob[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    try {
      const overrides = validateMetadataOverride(source);
      let normalizedUrl: string;
      let sourceSha256: string | null = null;
      let storagePath: string | null = null;
      let byteSize: number | null = null;
      let mimeType = source.mimeType ? source.mimeType.slice(0, 120) : null;
      let sourceType: BrainSourceType;
      let sourceFormat: ReturnType<typeof sourceFormatForKind>;

      if (source.kind === 'url') {
        if (!source.url) throw new BrainSourceError('url_missing');

        try {
          normalizedUrl = normalizeSourceUrl(source.url);
        } catch {
          throw new BrainSourceError('url_invalid');
        }

        sourceType = 'article';
        sourceFormat = 'url';
      } else {
        if (!source.storagePath || !source.sourceSha256) {
          throw new BrainSourceError('storage_path_invalid');
        }

        if (!/^[a-f0-9]{64}$/.test(source.sourceSha256)) {
          throw new BrainSourceError('storage_hash_invalid');
        }

        const objectPath = sourceObjectPathFromPath(source.storagePath);
        if (!objectPath) throw new BrainSourceError('storage_path_invalid');

        const verified = await storage.verifySource({
          sourcePath: source.storagePath,
          sourceSha256: source.sourceSha256,
          kind: source.kind,
        });

        if (source.kind === 'pdf') validatePdfBuffer(verified.buffer, source.mimeType);
        if (source.kind === 'txt') {
          const validated = validateTxtBuffer(verified.buffer, source.mimeType);
          decodeUtf8Strict(validated.bytes);
        }
        if (source.kind === 'text') {
          const decoded = decodeUtf8Strict(verified.buffer);

          if (!decoded.trim()) throw new BrainSourceError('source_text_empty');
          if (decoded.includes('\u0000')) throw new BrainSourceError('source_text_invalid');
        }

        sourceSha256 = source.sourceSha256;
        storagePath = source.storagePath;
        byteSize = verified.byteSize;
        mimeType = mimeType || (source.kind === 'pdf' ? 'application/pdf' : 'text/plain');
        normalizedUrl = syntheticSourceUrl(sourceSha256);
        sourceType = sourceTypeForKind(source.kind);
        sourceFormat = sourceFormatForKind(source.kind);
      }

      if (seen.has(normalizedUrl)) {
        const duplicate = row(source, 'duplicate_in_input', {
          reason: 'This source appears more than once in the batch.',
        });
        rows.push(duplicate);
        skipped.push(duplicate);
        continue;
      }

      seen.add(normalizedUrl);

      const active = await store.findActiveJobsByUrls([normalizedUrl]);

      if (active.length > 0) {
        const duplicate = row(source, 'already_queued', {
          runId: active[0].run_id,
          reason: 'This source is already queued or processing.',
        });
        rows.push(duplicate);
        skipped.push(duplicate);
        continue;
      }

      const existing =
        source.kind === 'url'
          ? await store.findDuplicate({
              normalizedUrl,
              canonicalUrl: null,
            })
          : await store.findSourceDuplicate({
              sourceSha256: sourceSha256 as string,
              sourceTypes: ['pdf', 'txt', 'text'],
            });

      if (existing && !input.recheckExisting) {
        const duplicate = row(source, 'existing', {
          reason: 'This source is already indexed. Enable recheck to update it.',
          documentId: existing.documentId,
          title: existing.title,
        });
        rows.push(duplicate);
        skipped.push(duplicate);
        continue;
      }

      prepared.push({
        descriptor: source,
        inputUrl:
          source.kind === 'url'
            ? normalizedUrl
            : syntheticSourceUrl(sourceSha256 as string),
        normalizedUrl,
        sourceType,
        sourceFormat,
        storagePath,
        sourceSha256,
        originalFilename: source.originalFilename?.slice(0, 300) || null,
        mimeType,
        byteSize,
        pageCount: source.pageCount ?? null,
        titleOverride: overrides.title,
        authorOverride: overrides.author,
        publishedAtOverride: overrides.publishedAt,
        languageOverride: overrides.language,
      });
    } catch (error) {
      const code = error instanceof BrainSourceError ? error.code : 'source_invalid';
      const invalid = row(source, 'invalid', {
        reason: code,
      });
      rows.push(invalid);
      skipped.push(invalid);
    }
  }

  if (prepared.length === 0) {
    return { startRun: null, jobs: [], rows, skipped };
  }

  const run = await store.createRun({
    source: 'admin_unified_source',
    requested: sources.length,
    accepted: prepared.length,
    kinds: Array.from(new Set(prepared.map((job) => job.sourceType))),
  });

  const jobs = await store.insertJobs(
    run.id,
    prepared.map((job) => ({
      inputUrl: job.inputUrl,
      normalizedUrl: job.normalizedUrl,
      sourceType: job.sourceType,
      sourceFormat: job.sourceFormat,
      storagePath: job.storagePath,
      sourceSha256: job.sourceSha256,
      originalFilename: job.originalFilename,
      mimeType: job.mimeType,
      byteSize: job.byteSize,
      pageCount: job.pageCount,
      titleOverride: job.titleOverride,
      authorOverride: job.authorOverride,
      publishedAtOverride: job.publishedAtOverride,
      languageOverride: job.languageOverride,
      requestedBy: input.requestedBy || null,
    }))
  );

  for (const job of prepared) {
    const matched = jobs.find((entry) => entry.normalized_url === job.normalizedUrl);

    if (matched) {
      rows.push(
        row(job.descriptor, 'queued', {
          runId: run.id,
          jobId: matched.id,
          title: job.titleOverride || undefined,
        })
      );
    }
  }

  return { startRun: run, jobs, rows, skipped };
}
