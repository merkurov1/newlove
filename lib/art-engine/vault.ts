import type { ImageMetadata, LotData } from '@/lib/lots/types';
import type {
  AuditEvent,
  IngestionBuildInput,
  IngestionState,
  IngestionStatus,
  VaultState,
} from './types';

const MAX_AUDIT_EVENTS = 80;

function isRecord(value: unknown): value is Record<string, any> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = (value || '').trim();
    if (!normalized) continue;

    const key = normalized.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

export function normalizeVault(value: unknown): VaultState {
  if (!isRecord(value)) {
    return { schema_version: 1 };
  }

  return {
    ...value,
    schema_version: 1,
    ingestion: isRecord(value.ingestion)
      ? {
          status: (value.ingestion.status || 'failed') as IngestionStatus,
          warnings: Array.isArray(value.ingestion.warnings)
            ? value.ingestion.warnings
            : [],
          errors: Array.isArray(value.ingestion.errors)
            ? value.ingestion.errors
            : [],
          missing_fields: Array.isArray(value.ingestion.missing_fields)
            ? value.ingestion.missing_fields
            : [],
          ...value.ingestion,
        }
      : undefined,
    research: isRecord(value.research)
      ? {
          status: value.research.status || 'idle',
          sources: Array.isArray(value.research.sources)
            ? value.research.sources
            : [],
          claims: Array.isArray(value.research.claims)
            ? value.research.claims
            : [],
          contradictions: Array.isArray(value.research.contradictions)
            ? value.research.contradictions
            : [],
          gaps: Array.isArray(value.research.gaps) ? value.research.gaps : [],
          errors: Array.isArray(value.research.errors) ? value.research.errors : [],
          warnings: Array.isArray(value.research.warnings)
            ? value.research.warnings
            : [],
          ...value.research,
        }
      : undefined,
    editorial: isRecord(value.editorial)
      ? (value.editorial as VaultState['editorial'])
      : undefined,
    publication: isRecord(value.publication)
      ? (value.publication as VaultState['publication'])
      : undefined,
    image: isRecord(value.image) ? value.image : undefined,
    audit: Array.isArray(value.audit)
      ? value.audit
          .filter(isRecord)
          .map((event) => ({
            at: String(event.at || new Date().toISOString()),
            action: String(event.action || 'unknown'),
            actor: event.actor ? String(event.actor) : null,
            details: isRecord(event.details) ? event.details : {},
          }))
          .slice(-MAX_AUDIT_EVENTS)
      : [],
  };
}

export function mergeVault(
  existing: unknown,
  patch: Partial<VaultState>,
): VaultState {
  const base = normalizeVault(existing);

  const ingestion = patch.ingestion
    ? {
        ...(base.ingestion || {}),
        ...patch.ingestion,
        warnings: uniqueStrings([
          ...(base.ingestion?.warnings || []),
          ...(patch.ingestion.warnings || []),
        ]),
        errors: uniqueStrings([
          ...(base.ingestion?.errors || []),
          ...(patch.ingestion.errors || []),
        ]),
        missing_fields: uniqueStrings([
          ...(base.ingestion?.missing_fields || []),
          ...(patch.ingestion.missing_fields || []),
        ]),
        attempt_ids: uniqueStrings([
          ...(base.ingestion?.attempt_ids || []),
          ...(patch.ingestion.attempt_ids || []),
        ]),
      }
    : base.ingestion;

  const audit = [
    ...(base.audit || []),
    ...(patch.audit || []),
  ].slice(-MAX_AUDIT_EVENTS);

  return {
    ...base,
    ...patch,
    schema_version: 1,
    ingestion,
    identity: patch.identity
      ? { ...(base.identity || {}), ...patch.identity }
      : base.identity,
    research: patch.research
      ? { ...(base.research || {}), ...patch.research }
      : base.research,
    editorial: patch.editorial
      ? { ...(base.editorial || {}), ...patch.editorial }
      : base.editorial,
    publication: patch.publication
      ? { ...(base.publication || {}), ...patch.publication }
      : base.publication,
    image: patch.image !== undefined ? patch.image : base.image,
    audit,
  };
}

export function appendAudit(
  vault: VaultState,
  event: Omit<AuditEvent, 'at'> & { at?: string },
): VaultState {
  return mergeVault(vault, {
    audit: [
      {
        at: event.at || new Date().toISOString(),
        action: event.action,
        actor: event.actor || null,
        details: event.details || {},
      },
    ],
  });
}

export function findMissingFields(lot: LotData): string[] {
  const missing: string[] = [];

  if (!lot.artist?.trim()) missing.push('artist');
  if (!lot.title?.trim()) missing.push('title');
  if (!lot.year) missing.push('year');
  if (!lot.medium?.trim()) missing.push('medium');
  if (!lot.dimensions?.trim()) missing.push('dimensions');
  if (!lot.lotNumber?.trim()) missing.push('lotNumber');
  if (!lot.estimate?.raw && !lot.estimate?.min) missing.push('estimate');
  if (!lot.imageUrl?.trim()) missing.push('image');

  return missing;
}

export function computeIngestionStatus(lot: LotData): IngestionStatus {
  const hasArtist = Boolean(lot.artist?.trim());
  const hasTitle = Boolean(lot.title?.trim());
  const hasImage = Boolean(lot.imageUrl?.trim());

  if (!hasArtist && !hasTitle && !hasImage) {
    return 'failed';
  }

  if (hasArtist && hasTitle && hasImage) {
    return 'ready';
  }

  return 'partial';
}

export function buildIngestionState(input: IngestionBuildInput): IngestionState {
  return {
    status: input.status,
    attempt_id: input.attemptId || null,
    attempt_ids: input.attemptId ? [input.attemptId] : [],
    parser: input.parser || null,
    parser_version: input.parserVersion || null,
    house: input.house || null,
    source_url: input.sourceUrl,
    canonical_url: input.canonicalUrl || null,
    http_status: input.httpStatus ?? null,
    fetch_method: input.fetchMethod || 'unknown',
    fetched_at: input.fetchedAt || null,
    extracted_at: input.extractedAt || new Date().toISOString(),
    execution_time_ms: input.executionTimeMs ?? null,
    warnings: uniqueStrings(input.warnings || []),
    errors: uniqueStrings(input.errors || []),
    missing_fields: uniqueStrings(input.missingFields || []),
    image: input.image || null,
    raw_excerpt_chars: input.rawExcerptChars ?? null,
    content_hash: input.contentHash || null,
  };
}

export function imageMetadataOrNull(
  image: ImageMetadata | null | undefined,
): ImageMetadata | null {
  return image || null;
}
