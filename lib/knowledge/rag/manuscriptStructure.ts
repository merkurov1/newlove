/**
 * Pure manuscript structure helpers.
 *
 * The UNFRAMED manuscript is stored in Brain as deterministic, ordered chunks.
 * Nothing here calls a model or a database: the same inputs always produce the
 * same coverage report, chapter map and reading windows. That makes it possible
 * to prove whether the system actually loaded the source instead of claiming it.
 */

export type ManuscriptChunkMeta = {
  chunkId: string;
  chunkIndex: number;
  sectionIndex: number;
  heading: string;
  sectionPath: string[];
  charStart: number;
  charEnd: number;
  lineStart: number;
  lineEnd: number;
};

export type ManuscriptChunk = ManuscriptChunkMeta & {
  content: string;
};

export type ManuscriptChapterKind =
  | 'introduction'
  | 'prologue'
  | 'chapter'
  | 'epilogue'
  | 'section'
  | 'part';

export type ParsedHeading = {
  kind: ManuscriptChapterKind;
  number: number | null;
  title: string;
  label: string;
};

export type ManuscriptCoverage = {
  documentChunkCount: number;
  loadedChunkCount: number;
  sourceCharCount: number;
  indexedCharCount: number;
  unionCharCount: number;
  coverageRatio: number;
  firstCharStart: number | null;
  lastCharEnd: number | null;
  firstChunkIndex: number | null;
  lastChunkIndex: number | null;
  missingChunkIndices: number[];
  duplicateChunkIndices: number[];
  boundaryGaps: Array<{ beforeChunk: number; afterChunk: number; gapChars: number }>;
  boundaryOverlaps: Array<{ beforeChunk: number; afterChunk: number; overlapChars: number }>;
  outOfOrder: Array<{ beforeChunk: number; afterChunk: number }>;
  headingSequenceBreaks: Array<{ beforeChunk: number; afterChunk: number }>;
  complete: boolean;
  warnings: string[];
};

export type ManuscriptChapter = {
  key: string;
  kind: ManuscriptChapterKind;
  number: number | null;
  title: string;
  label: string;
  part: string | null;
  startChunkIndex: number;
  endChunkIndex: number;
  chunkCount: number;
  charStart: number;
  charEnd: number;
  indexedChars: number;
  sectionPaths: string[];
};

export type ManuscriptStructure = {
  chapters: ManuscriptChapter[];
  parts: Array<{ label: string; chapterKeys: string[]; charCount: number }>;
  coverage: ManuscriptCoverage;
  chapterByKey: Map<string, ManuscriptChapter>;
};

const CHAPTER_PATTERN = /^CHAPTER\s+(\d{1,3})\s*[:.\-—]\s*(.+)$/i;
const INTRODUCTION_PATTERN = /^INTRODUCTION\s*[:.\-—]\s*(.+)$/i;
const PROLOGUE_PATTERN = /^PROLOGUE\s*[:.\-—]\s*(.+)$/i;
const EPILOGUE_PATTERN = /^EPILOGUE\s*[:.\-—]\s*(.+)$/i;
const PART_PATTERN = /^PART\s+([IVXLC]+|\d{1,2})\b\s*[:.\-—]?\s*(.*)$/i;

export function parseChapterHeading(heading: string): ParsedHeading | null {
  const clean = String(heading || '')
    .replace(/^#{1,6}\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!clean) return null;

  const introduction = clean.match(INTRODUCTION_PATTERN);
  if (introduction) {
    return {
      kind: 'introduction',
      number: null,
      title: introduction[1].trim(),
      label: clean,
    };
  }

  const prologue = clean.match(PROLOGUE_PATTERN);
  if (prologue) {
    return { kind: 'prologue', number: null, title: prologue[1].trim(), label: clean };
  }

  const epilogue = clean.match(EPILOGUE_PATTERN);
  if (epilogue) {
    return { kind: 'epilogue', number: null, title: epilogue[1].trim(), label: clean };
  }

  const chapter = clean.match(CHAPTER_PATTERN);
  if (chapter) {
    return {
      kind: 'chapter',
      number: Number(chapter[1]),
      title: chapter[2].trim(),
      label: clean,
    };
  }

  const part = clean.match(PART_PATTERN);
  if (part) {
    return {
      kind: 'part',
      number: null,
      title: (part[2] || '').trim(),
      label: clean,
    };
  }

  // A part can appear as a section path only. Treat a bare "PART I" heading as
  // structural, not as a chapter of prose.
  if (/^PART\s+[IVXLC0-9]+\b/i.test(clean)) {
    return { kind: 'part', number: null, title: '', label: clean };
  }

  return null;
}

export function chapterKeyFor(heading: string): string | null {
  const parsed = parseChapterHeading(heading);
  if (!parsed) return null;
  if (parsed.kind === 'chapter') return `chapter:${parsed.number}`;
  return `${parsed.kind}:${parsed.label.toLowerCase()}`;
}

function partFromSectionPath(sectionPath: string[]): string | null {
  for (const part of sectionPath) {
    const parsed = parseChapterHeading(part);
    if (parsed?.kind === 'part') return part.trim();
    if (/^PART\s+[IVXLC0-9]+\b/i.test(part)) return part.trim();
  }
  return null;
}

function unionLength(intervals: Array<{ start: number; end: number }>): number {
  if (intervals.length === 0) return 0;

  const sorted = [...intervals].sort((left, right) => left.start - right.start);
  let total = 0;
  let start = sorted[0].start;
  let end = sorted[0].end;

  for (let index = 1; index < sorted.length; index += 1) {
    const interval = sorted[index];
    if (interval.start <= end) {
      end = Math.max(end, interval.end);
      continue;
    }
    total += Math.max(0, end - start);
    start = interval.start;
    end = interval.end;
  }

  return total + Math.max(0, end - start);
}

export function validateManuscriptInventory(input: {
  chunks: ManuscriptChunkMeta[];
  sourceCharCount: number;
  expectedChunkCount?: number | null;
  maxBoundaryGapChars?: number;
  maxOverlapChars?: number;
}): ManuscriptCoverage {
  const maxGap = input.maxBoundaryGapChars ?? 400;
  const maxOverlap = input.maxOverlapChars ?? 600;
  const sorted = [...input.chunks].sort((left, right) => left.chunkIndex - right.chunkIndex);
  const indices = sorted.map((chunk) => chunk.chunkIndex);
  const counts = new Map<number, number>();
  for (const index of indices) counts.set(index, (counts.get(index) || 0) + 1);

  const duplicateChunkIndices = Array.from(counts.entries())
    .filter(([, count]) => count > 1)
    .map(([index]) => index)
    .sort((left, right) => left - right);
  const unique = Array.from(counts.keys()).sort((left, right) => left - right);
  const maxIndex = unique.length > 0 ? unique[unique.length - 1] : -1;
  const missingChunkIndices: number[] = [];

  const upperIndex =
    input.expectedChunkCount && input.expectedChunkCount > 0
      ? Math.max(maxIndex, input.expectedChunkCount - 1)
      : maxIndex;
  if (unique.length > 0) {
    for (let index = 0; index <= upperIndex; index += 1) {
      if (!counts.has(index)) missingChunkIndices.push(index);
    }
  }

  const boundaryGaps: ManuscriptCoverage['boundaryGaps'] = [];
  const boundaryOverlaps: ManuscriptCoverage['boundaryOverlaps'] = [];
  const outOfOrder: ManuscriptCoverage['outOfOrder'] = [];
  const headingSequenceBreaks: ManuscriptCoverage['headingSequenceBreaks'] = [];

  for (let index = 1; index < sorted.length; index += 1) {
    const before = sorted[index - 1];
    const after = sorted[index];

    if (after.chunkIndex <= before.chunkIndex) {
      outOfOrder.push({ beforeChunk: before.chunkIndex, afterChunk: after.chunkIndex });
    }

    if (after.charStart > before.charEnd) {
      const gap = after.charStart - before.charEnd;
      if (gap > maxGap) {
        boundaryGaps.push({
          beforeChunk: before.chunkIndex,
          afterChunk: after.chunkIndex,
          gapChars: gap,
        });
      }
    } else if (after.charStart < before.charEnd) {
      const overlap = before.charEnd - after.charStart;
      if (overlap > maxOverlap) {
        boundaryOverlaps.push({
          beforeChunk: before.chunkIndex,
          afterChunk: after.chunkIndex,
          overlapChars: overlap,
        });
      }
    }

    // Section sequence must not move backwards inside one document. A heading
    // jump is allowed at a chapter boundary; a decrease is not.
    if (after.sectionIndex < before.sectionIndex) {
      headingSequenceBreaks.push({
        beforeChunk: before.chunkIndex,
        afterChunk: after.chunkIndex,
      });
    }
  }

  const indexedCharCount = sorted.reduce(
    (total, chunk) => total + Math.max(0, chunk.charEnd - chunk.charStart),
    0
  );
  const unionCharCount = unionLength(
    sorted.map((chunk) => ({ start: chunk.charStart, end: chunk.charEnd }))
  );
  const sourceCharCount = Math.max(0, input.sourceCharCount);
  const coverageRatio =
    sourceCharCount > 0 ? Math.min(1, unionCharCount / sourceCharCount) : 0;

  const warnings: string[] = [];
  if (sorted.length === 0) warnings.push('no_chunks');
  if (missingChunkIndices.length > 0) {
    warnings.push(`missing_chunk_indices:${missingChunkIndices.slice(0, 20).join(',')}`);
  }
  if (duplicateChunkIndices.length > 0) {
    warnings.push(`duplicate_chunk_indices:${duplicateChunkIndices.slice(0, 20).join(',')}`);
  }
  if (outOfOrder.length > 0) warnings.push('out_of_order_chunks');
  if (boundaryGaps.length > 0) warnings.push(`boundary_gaps:${boundaryGaps.length}`);
  if (boundaryOverlaps.length > 0) warnings.push(`unexpected_overlaps:${boundaryOverlaps.length}`);
  if (headingSequenceBreaks.length > 0) warnings.push('section_sequence_decrease');

  if (
    input.expectedChunkCount !== undefined &&
    input.expectedChunkCount !== null &&
    input.expectedChunkCount !== sorted.length
  ) {
    warnings.push(`chunk_count_mismatch:${sorted.length}/${input.expectedChunkCount}`);
  }

  if (sourceCharCount > 0 && coverageRatio < 0.97) {
    warnings.push(`coverage_below_97_percent:${(coverageRatio * 100).toFixed(1)}`);
  }

  const first = sorted[0] || null;
  if (first && first.charStart > 0 && first.charStart > sourceCharCount * 0.02) {
    warnings.push(`leading_source_not_indexed:${first.charStart}`);
  }
  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    if (sourceCharCount > 0 && last.charEnd < sourceCharCount - 2) {
      warnings.push(`trailing_source_not_indexed:${sourceCharCount - last.charEnd}`);
    }
  }

  const complete =
    sorted.length > 0 &&
    missingChunkIndices.length === 0 &&
    duplicateChunkIndices.length === 0 &&
    outOfOrder.length === 0 &&
    boundaryGaps.length === 0 &&
    headingSequenceBreaks.length === 0 &&
    coverageRatio >= 0.97;

  return {
    documentChunkCount: input.expectedChunkCount ?? sorted.length,
    loadedChunkCount: sorted.length,
    sourceCharCount,
    indexedCharCount,
    unionCharCount,
    coverageRatio: Number(coverageRatio.toFixed(4)),
    firstCharStart: first ? first.charStart : null,
    lastCharEnd: sorted.length > 0 ? sorted[sorted.length - 1].charEnd : null,
    firstChunkIndex: first ? first.chunkIndex : null,
    lastChunkIndex: sorted.length > 0 ? sorted[sorted.length - 1].chunkIndex : null,
    missingChunkIndices,
    duplicateChunkIndices,
    boundaryGaps,
    boundaryOverlaps,
    outOfOrder,
    headingSequenceBreaks,
    complete,
    warnings,
  };
}

export function buildManuscriptStructure(input: {
  chunks: ManuscriptChunkMeta[];
  sourceCharCount: number;
  expectedChunkCount?: number | null;
}): ManuscriptStructure {
  const coverage = validateManuscriptInventory(input);
  const sorted = [...input.chunks].sort((left, right) => left.chunkIndex - right.chunkIndex);
  const chapters: ManuscriptChapter[] = [];
  const byKey = new Map<string, ManuscriptChapter>();

  for (const chunk of sorted) {
    const key = chapterKeyFor(chunk.heading);
    if (!key) continue;

    const existing = byKey.get(key);
    const indexedChars = Math.max(0, chunk.charEnd - chunk.charStart);

    if (!existing) {
      const parsed = parseChapterHeading(chunk.heading);
      if (!parsed) continue;
      const chapter: ManuscriptChapter = {
        key,
        kind: parsed.kind,
        number: parsed.number,
        title: parsed.title,
        label: parsed.label,
        part: partFromSectionPath(chunk.sectionPath),
        startChunkIndex: chunk.chunkIndex,
        endChunkIndex: chunk.chunkIndex,
        chunkCount: 1,
        charStart: chunk.charStart,
        charEnd: chunk.charEnd,
        indexedChars,
        sectionPaths: chunk.sectionPath.length > 0 ? [[...chunk.sectionPath].join(' > ')] : [],
      };
      chapters.push(chapter);
      byKey.set(key, chapter);
      continue;
    }

    existing.endChunkIndex = Math.max(existing.endChunkIndex, chunk.chunkIndex);
    existing.chunkCount += 1;
    existing.charStart = Math.min(existing.charStart, chunk.charStart);
    existing.charEnd = Math.max(existing.charEnd, chunk.charEnd);
    existing.indexedChars += indexedChars;
    const path = chunk.sectionPath.join(' > ');
    if (path && !existing.sectionPaths.includes(path)) existing.sectionPaths.push(path);
  }

  const partsMap = new Map<string, { label: string; chapterKeys: string[]; charCount: number }>();
  for (const chapter of chapters) {
    const label = chapter.part || 'Front & back matter';
    const part = partsMap.get(label) || { label, chapterKeys: [], charCount: 0 };
    part.chapterKeys.push(chapter.key);
    part.charCount += Math.max(0, chapter.charEnd - chapter.charStart);
    partsMap.set(label, part);
  }

  return {
    chapters,
    parts: Array.from(partsMap.values()),
    coverage,
    chapterByKey: byKey,
  };
}

export function resolveManuscriptChapter(
  structure: ManuscriptStructure,
  input: {
    number?: number | null;
    title?: string | null;
    relative?: 'previous' | 'next' | null;
    activeChapterNumber?: number | null;
  }
): { chapter: ManuscriptChapter | null; reason?: string; candidates?: ManuscriptChapter[] } {
  const chapters = structure.chapters;

  if (input.number !== null && input.number !== undefined) {
    const match = chapters.find(
      (chapter) => chapter.kind === 'chapter' && chapter.number === input.number
    );
    return match ? { chapter: match } : { chapter: null, reason: 'chapter_not_found' };
  }

  if (input.relative) {
    const anchor =
      input.activeChapterNumber !== null && input.activeChapterNumber !== undefined
        ? chapters.find(
            (chapter) =>
              chapter.kind === 'chapter' && chapter.number === input.activeChapterNumber
          )
        : null;
    const anchorIndex = anchor ? chapters.indexOf(anchor) : -1;
    if (anchorIndex >= 0) {
      const target = chapters[anchorIndex + (input.relative === 'previous' ? -1 : 1)];
      if (target) return { chapter: target };
    }
    return { chapter: null, reason: 'relative_chapter_without_anchor' };
  }

  const title = (input.title || '').trim().toLowerCase();
  if (title) {
    const exact = chapters.find(
      (chapter) =>
        chapter.title.toLowerCase() === title || chapter.label.toLowerCase() === title
    );
    if (exact) return { chapter: exact };

    const partial = chapters.filter(
      (chapter) =>
        chapter.title.toLowerCase().includes(title) ||
        chapter.label.toLowerCase().includes(title)
    );
    if (partial.length === 1) return { chapter: partial[0] };
    if (partial.length > 1) {
      return {
        chapter: null,
        reason: 'ambiguous_chapter_title',
        candidates: partial.slice(0, 6),
      };
    }
  }

  return { chapter: null, reason: 'chapter_not_specified', candidates: chapters.slice(0, 6) };
}

/**
 * Sequential, bounded reading windows. Every source character in the requested
 * chunk range belongs to exactly one window; a window boundary may split a
 * chunk, so each window carries exact character and chunk references.
 */
export function buildChapterWindows(input: {
  chunks: ManuscriptChunk[];
  maxCharsPerWindow?: number;
}): Array<{
  index: number;
  charStart: number;
  charEnd: number;
  charCount: number;
  chunkIds: string[];
  text: string;
}> {
  const maxChars = Math.max(1_000, Math.min(40_000, input.maxCharsPerWindow ?? 12_000));
  const sorted = [...input.chunks].sort((left, right) => left.chunkIndex - right.chunkIndex);
  const windows: Array<{
    index: number;
    charStart: number;
    charEnd: number;
    charCount: number;
    chunkIds: string[];
    text: string;
  }> = [];

  let buffer = '';
  let bufferStart: number | null = null;
  let bufferEnd: number | null = null;
  let chunkIds: string[] = [];

  const flush = () => {
    if (!buffer.trim() || bufferStart === null || bufferEnd === null) {
      buffer = '';
      bufferStart = null;
      bufferEnd = null;
      chunkIds = [];
      return;
    }
    windows.push({
      index: windows.length,
      charStart: bufferStart,
      charEnd: bufferEnd,
      charCount: buffer.length,
      chunkIds: Array.from(new Set(chunkIds)),
      text: buffer,
    });
    buffer = '';
    bufferStart = null;
    bufferEnd = null;
    chunkIds = [];
  };

  for (const chunk of sorted) {
    const separator = buffer ? '\n\n' : '';
    if (buffer && buffer.length + separator.length + chunk.content.length > maxChars) {
      flush();
    }
    if (!buffer) bufferStart = chunk.charStart;
    buffer += `${buffer ? '\n\n' : ''}${chunk.content}`;
    bufferEnd = chunk.charEnd;
    chunkIds.push(chunk.chunkId);
  }

  flush();
  return windows;
}

export function chapterChunksFor(
  chunks: ManuscriptChunkMeta[],
  chapter: ManuscriptChapter
): ManuscriptChunkMeta[] {
  return chunks
    .filter(
      (chunk) =>
        chunk.chunkIndex >= chapter.startChunkIndex &&
        chunk.chunkIndex <= chapter.endChunkIndex
    )
    .sort((left, right) => left.chunkIndex - right.chunkIndex);
}

/** Number of actual PART sections, excluding front/back matter. */
export function manuscriptPartCount(structure: ManuscriptStructure): number {
  return structure.parts.filter((part) => /^PART\b/i.test(part.label)).length;
}

export function formatCoverage(coverage: ManuscriptCoverage): string {
  return [
    `${coverage.loadedChunkCount}/${coverage.documentChunkCount} chunks`,
    `${coverage.unionCharCount.toLocaleString('en-US')}/${coverage.sourceCharCount.toLocaleString('en-US')} chars`,
    `${(coverage.coverageRatio * 100).toFixed(1)}%`,
    coverage.complete ? 'complete' : 'incomplete',
  ].join(' · ');
}
