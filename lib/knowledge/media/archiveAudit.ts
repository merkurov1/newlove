/**
 * Read-only Media Archive inventory and source reconciliation.
 *
 * This module never touches the database, the network or the public archive.
 * It compares an already captured inventory snapshot (CSV) with the verified
 * Novaya Gazeta manifest and reports discrepancies without deciding to delete,
 * merge or publish anything.
 *
 * Status vocabulary is deliberately narrow:
 *   * archive_status    — publication state in media_archive_records;
 *   * coverage_status   — internal Media text-extraction state;
 *   * ingestion_status  — internal Brain ingestion state.
 * None of these is a search-engine (Google) indexing status.
 */

export type ArchiveMediaRow = {
  id: string;
  outlet: string;
  title: string;
  publishedDate: string | null;
  kind: string | null;
  topic: string | null;
  archiveStatus: string | null;
  canonicalUrl: string | null;
  documentId: string | null;
  sourceType: string | null;
  corpusState: string | null;
  coverageStatus: string | null;
  textQuality: string | null;
  sourceCharCount: number;
  chunkCount: number;
  ingestionStatus: string | null;
  latestJobStatus: string | null;
  latestJobError: string | null;
};

export type ArchiveManifestRecord = {
  source: string;
  title: string;
  subtitle?: string | null;
  date: string;
  authors: string;
  genre: string;
  note?: string | null;
  topic?: string | null;
  date_source?: string | null;
};

export type CountMap = Record<string, number>;

export type DuplicateGroup = {
  kind: 'canonical_url' | 'title' | 'title_outlet_date';
  key: string;
  mediaIds: string[];
  titles: string[];
  outlets: string[];
  /** Never true in this module: duplicate decisions require an owner review. */
  automaticMerge: false;
  recommendation: 'keep_distinct' | 'review_canonical';
  reason: string;
};

export type DateConflict = {
  mediaId: string;
  title: string;
  canonicalUrl: string;
  publishedDate: string | null;
  urlDate: string | null;
  reason: 'url_date_differs_from_published_date';
};

export type SourceMatch = {
  source: string;
  title: string;
  manifestDate: string;
  status: 'matched' | 'missing' | 'ambiguous';
  matchedBy: 'canonical_url' | 'slug' | null;
  mediaId: string | null;
  candidates: Array<{ id: string; title: string; canonicalUrl: string | null }>;
  titleComparison: 'exact' | 'extended' | 'different' | null;
  dateMatches: boolean | null;
  note: string | null;
};

export type ArchiveReconciliation = {
  manifestTotal: number;
  matched: number;
  missing: number;
  ambiguous: number;
  matches: SourceMatch[];
  missingSources: SourceMatch[];
  ambiguousSources: SourceMatch[];
  metadataMismatches: {
    titleDifferent: number;
    dateMismatch: number;
    items: Array<{
      source: string;
      title: string;
      manifestDate: string;
      mediaId: string;
      publishedDate: string | null;
      titleComparison: 'exact' | 'extended' | 'different';
    }>;
  };
};

export type MediaInventorySnapshot = {
  total: number;
  byArchiveStatus: CountMap;
  byKind: CountMap;
  byTopic: CountMap;
  byCoverageStatus: CountMap;
  byTextQuality: CountMap;
  byCorpusState: CountMap;
  byIngestionStatus: CountMap;
  byLatestJobStatus: CountMap;
  byYear: CountMap;
  unknownDates: number;
  dateRange: { from: string | null; to: string | null };
  documentLinked: number;
  publishedWithoutDocument: number;
  nonPublishedWithDocument: number;
  emptyTitles: number;
  missingCanonicalUrls: number;
  invalidCanonicalUrls: number;
  documentsWithoutChunks: number;
  fullTextWithoutChunks: number;
  textQualityConflicts: number;
  duplicateCanonicalUrls: DuplicateGroup[];
  duplicateTitles: DuplicateGroup[];
  duplicateTitleOutletDate: DuplicateGroup[];
  dateConflicts: DateConflict[];
};

function increment(map: CountMap, key: string | null | undefined): void {
  const value = (key || '').trim() || 'unknown';
  map[value] = (map[value] || 0) + 1;
}

function sortedCounts(map: CountMap): CountMap {
  return Object.fromEntries(Object.entries(map).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

export function normalizeArchiveUrl(value: string | null | undefined): string {
  const raw = (value || '').trim();
  if (!raw) return '';

  try {
    const url = new URL(raw);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    if (
      (url.protocol === 'https:' && url.port === '443') ||
      (url.protocol === 'http:' && url.port === '80')
    ) {
      url.port = '';
    }

    return url.toString().replace(/\/+$/, '');
  } catch {
    return raw.replace(/\/+$/, '');
  }
}

export function archiveSlug(value: string | null | undefined): string {
  const raw = (value || '').trim();
  if (!raw) return '';

  try {
    return new URL(raw).pathname.split('/').filter(Boolean).pop() || '';
  } catch {
    return raw.split('/').filter(Boolean).pop() || '';
  }
}

function dateOnly(value: string | null | undefined): string | null {
  const match = (value || '').match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function urlDate(value: string | null | undefined): string | null {
  const match = (value || '').match(/\/(\d{4})\/(\d{2})\/(\d{2})(?:\/|$)/);
  if (!match) return null;

  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    return null;
  }

  return date;
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'“”„]/g, ' ')
    .replace(/[—–-]/g, ' ')
    .replace(/…/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compareArchiveTitles(
  manifestTitle: string,
  mediaTitle: string
): 'exact' | 'extended' | 'different' {
  const left = normalizeTitle(manifestTitle);
  const right = normalizeTitle(mediaTitle);

  if (!left || !right) return 'different';
  if (left === right) return 'exact';
  if (right.startsWith(left)) return 'extended';
  if (left.startsWith(right)) return 'extended';

  // A database title may wrap the manifest title with a short prefix while
  // keeping the same stem. Treat that as extended, not as a different story.
  if (right.includes(left) || left.includes(right)) return 'extended';

  return 'different';
}

/** Parse the captured inventory CSV without any dependency on a database. */
export function parseMediaInventoryCsv(csv: string): ArchiveMediaRow[] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let quoted = false;

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index];

    if (quoted) {
      if (char === '"' && csv[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char !== '\r') {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  if (rows.length === 0) return [];

  const headers = rows[0].map((header) => header.trim());
  const index = new Map(headers.map((header, position) => [header, position]));
  const value = (cells: string[], name: string): string | null => {
    const position = index.get(name);
    if (position === undefined) return null;
    const candidate = (cells[position] || '').trim();
    return candidate || null;
  };

  return rows
    .slice(1)
    .filter((cells) => cells.some((cell) => cell.trim().length > 0))
    .map((cells) => ({
      id: value(cells, 'media_record_id') || '',
      outlet: value(cells, 'outlet') || '',
      title: value(cells, 'title') || '',
      publishedDate: dateOnly(value(cells, 'published_date')),
      kind: value(cells, 'kind'),
      topic: value(cells, 'topic'),
      archiveStatus: value(cells, 'archive_status'),
      canonicalUrl: value(cells, 'canonical_url'),
      documentId: value(cells, 'document_id'),
      sourceType: value(cells, 'source_type'),
      corpusState: value(cells, 'corpus_state'),
      coverageStatus: value(cells, 'coverage_status'),
      textQuality: value(cells, 'text_quality'),
      sourceCharCount: Number.parseInt(value(cells, 'source_char_count') || '0', 10) || 0,
      chunkCount: Number.parseInt(value(cells, 'chunk_count') || '0', 10) || 0,
      ingestionStatus: value(cells, 'ingestion_status'),
      latestJobStatus: value(cells, 'latest_job_status'),
      latestJobError: value(cells, 'latest_job_error'),
    }));
}

function duplicateGroups(
  rows: ArchiveMediaRow[],
  kind: DuplicateGroup['kind'],
  keyOf: (row: ArchiveMediaRow) => string
): DuplicateGroup[] {
  const groups = new Map<string, ArchiveMediaRow[]>();

  for (const row of rows) {
    const key = keyOf(row);
    if (!key || !row.id) continue;
    groups.set(key, [...(groups.get(key) || []), row]);
  }

  return [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([key, members]) => {
      const outlets = [...new Set(members.map((member) => member.outlet))];
      const dates = [...new Set(members.map((member) => member.publishedDate || ''))];
      const keepDistinct = kind !== 'canonical_url' && (outlets.length > 1 || dates.length > 1);

      return {
        kind,
        key,
        mediaIds: members.map((member) => member.id),
        titles: members.map((member) => member.title),
        outlets,
        automaticMerge: false as const,
        recommendation: keepDistinct ? ('keep_distinct' as const) : ('review_canonical' as const),
        reason: keepDistinct
          ? 'Different outlets or publication dates. These are separate publications that mention the same story; keep both and link them as reprint/related only after an owner decision.'
          : 'Same identity fields. An owner must establish the canonical source before any merge; the module never merges or deletes automatically.',
      };
    });
}

function isHttpUrl(value: string | null): boolean {
  if (!value) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function inventoryMediaSnapshot(rows: ArchiveMediaRow[]): MediaInventorySnapshot {
  const byArchiveStatus: CountMap = {};
  const byKind: CountMap = {};
  const byTopic: CountMap = {};
  const byCoverageStatus: CountMap = {};
  const byTextQuality: CountMap = {};
  const byCorpusState: CountMap = {};
  const byIngestionStatus: CountMap = {};
  const byLatestJobStatus: CountMap = {};
  const byYear: CountMap = {};

  const dates: string[] = [];
  const dateConflicts: DateConflict[] = [];

  for (const row of rows) {
    increment(byArchiveStatus, row.archiveStatus);
    increment(byKind, row.kind);
    increment(byTopic, row.topic);
    increment(byCoverageStatus, row.coverageStatus);
    increment(byTextQuality, row.textQuality);
    increment(byCorpusState, row.corpusState);
    increment(byIngestionStatus, row.ingestionStatus);
    increment(byLatestJobStatus, row.latestJobStatus);

    if (row.publishedDate) {
      dates.push(row.publishedDate);
      increment(byYear, row.publishedDate.slice(0, 4));
    }

    const fromUrl = urlDate(row.canonicalUrl);
    if (fromUrl && row.publishedDate && fromUrl !== row.publishedDate) {
      dateConflicts.push({
        mediaId: row.id,
        title: row.title,
        canonicalUrl: row.canonicalUrl || '',
        publishedDate: row.publishedDate,
        urlDate: fromUrl,
        reason: 'url_date_differs_from_published_date',
      });
    }
  }

  const published = rows.filter((row) => row.archiveStatus === 'published');
  const linked = rows.filter((row) => row.documentId);

  return {
    total: rows.length,
    byArchiveStatus: sortedCounts(byArchiveStatus),
    byKind: sortedCounts(byKind),
    byTopic: sortedCounts(byTopic),
    byCoverageStatus: sortedCounts(byCoverageStatus),
    byTextQuality: sortedCounts(byTextQuality),
    byCorpusState: sortedCounts(byCorpusState),
    byIngestionStatus: sortedCounts(byIngestionStatus),
    byLatestJobStatus: sortedCounts(byLatestJobStatus),
    byYear: sortedCounts(byYear),
    unknownDates: rows.filter((row) => !row.publishedDate).length,
    dateRange: {
      from: dates.length ? [...dates].sort()[0] : null,
      to: dates.length ? [...dates].sort().at(-1) || null : null,
    },
    documentLinked: linked.length,
    publishedWithoutDocument: published.filter((row) => !row.documentId).length,
    nonPublishedWithDocument: rows.filter(
      (row) => row.archiveStatus !== 'published' && Boolean(row.documentId)
    ).length,
    emptyTitles: rows.filter((row) => !row.title.trim()).length,
    missingCanonicalUrls: rows.filter((row) => !row.canonicalUrl).length,
    invalidCanonicalUrls: rows.filter(
      (row) => Boolean(row.canonicalUrl) && !isHttpUrl(row.canonicalUrl)
    ).length,
    documentsWithoutChunks: rows.filter(
      (row) => Boolean(row.documentId) && row.chunkCount === 0
    ).length,
    fullTextWithoutChunks: rows.filter(
      (row) => row.textQuality === 'full_text' && row.chunkCount === 0
    ).length,
    textQualityConflicts: rows.filter(
      (row) =>
        (row.textQuality === 'full_text' && row.chunkCount === 0) ||
        (row.textQuality === 'blocked' && row.chunkCount > 0) ||
        (row.textQuality === 'metadata_only' && row.chunkCount > 0)
    ).length,
    duplicateCanonicalUrls: duplicateGroups(rows, 'canonical_url', (row) =>
      normalizeArchiveUrl(row.canonicalUrl)
    ),
    duplicateTitles: duplicateGroups(rows, 'title', (row) =>
      normalizeTitle(row.title)
    ),
    duplicateTitleOutletDate: duplicateGroups(rows, 'title_outlet_date', (row) =>
      [normalizeTitle(row.title), normalizeTitle(row.outlet), row.publishedDate || 'unknown'].join('|')
    ),
    dateConflicts,
  };
}

/**
 * Match every manifest source to at most one archive record. Exact canonical
 * URL wins; a unique slug is accepted only when the URL is absent. Anything
 * else is reported as missing or ambiguous and is never guessed.
 */
export function reconcileNovayaArchive(
  manifest: ArchiveManifestRecord[],
  mediaRows: ArchiveMediaRow[]
): ArchiveReconciliation {
  const byUrl = new Map<string, ArchiveMediaRow[]>();
  const bySlug = new Map<string, ArchiveMediaRow[]>();

  for (const row of mediaRows) {
    const key = normalizeArchiveUrl(row.canonicalUrl);
    if (key) byUrl.set(key, [...(byUrl.get(key) || []), row]);

    const slug = archiveSlug(row.canonicalUrl);
    if (slug) bySlug.set(slug, [...(bySlug.get(slug) || []), row]);
  }

  const matches: SourceMatch[] = [];
  const metadataItems: ArchiveReconciliation['metadataMismatches']['items'] = [];

  for (const record of manifest) {
    const urlMatches = byUrl.get(normalizeArchiveUrl(record.source)) || [];
    const slugMatches = bySlug.get(archiveSlug(record.source)) || [];
    const candidates = urlMatches.length > 0 ? urlMatches : slugMatches;
    const matchedBy: SourceMatch['matchedBy'] =
      urlMatches.length === 1 ? 'canonical_url' : slugMatches.length === 1 ? 'slug' : null;
    const status: SourceMatch['status'] =
      candidates.length === 0 ? 'missing' : candidates.length === 1 ? 'matched' : 'ambiguous';
    const media = candidates.length === 1 ? candidates[0] : null;
    const manifestDate = dateOnly(record.date) || '';
    const titleComparison = media ? compareArchiveTitles(record.title, media.title) : null;
    const dateMatches = media
      ? Boolean(media.publishedDate && manifestDate && media.publishedDate === manifestDate)
      : null;

    matches.push({
      source: record.source,
      title: record.title,
      manifestDate,
      status,
      matchedBy: status === 'matched' ? matchedBy : null,
      mediaId: media?.id || null,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        title: candidate.title,
        canonicalUrl: candidate.canonicalUrl,
      })),
      titleComparison,
      dateMatches,
      note: record.note || record.date_source || null,
    });

    if (media && ((titleComparison && titleComparison !== 'exact') || dateMatches === false)) {
      metadataItems.push({
        source: record.source,
        title: record.title,
        manifestDate,
        mediaId: media.id,
        publishedDate: media.publishedDate,
        titleComparison: titleComparison || 'different',
      });
    }
  }

  const missingSources = matches.filter((match) => match.status === 'missing');
  const ambiguousSources = matches.filter((match) => match.status === 'ambiguous');

  return {
    manifestTotal: manifest.length,
    matched: matches.filter((match) => match.status === 'matched').length,
    missing: missingSources.length,
    ambiguous: ambiguousSources.length,
    matches,
    missingSources,
    ambiguousSources,
    metadataMismatches: {
      titleDifferent: metadataItems.filter((item) => item.titleComparison === 'different').length,
      dateMismatch: matches.filter((match) => match.dateMatches === false).length,
      items: metadataItems.filter(
        (item) => item.titleComparison === 'different' || item.publishedDate !== item.manifestDate
      ),
    },
  };
}
