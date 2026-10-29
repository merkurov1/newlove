import type { UnframedBuild } from '../types';

import type {
  ChunkDiagnostics,
  DeterminismChecks,
  DuplicateHashGroup,
} from './types';

const NEAR_EMPTY_CHARS = 80;

function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return 0;

  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((sorted.length - 1) * fraction)),
  );

  return sorted[index];
}

export function buildChunkDiagnostics(
  build: UnframedBuild,
  determinism: DeterminismChecks,
): ChunkDiagnostics {
  const { document, chunks } = build;
  const lengths = chunks.map((chunk) => chunk.charCount).sort((a, b) => a - b);

  const chunkCountsBySectionType: Record<string, number> = {};
  const chunkCountsByPartIndex: Record<string, number> = {};

  for (const chunk of chunks) {
    const section = document.sections[chunk.sectionIndex];
    const type = section?.type ?? 'unknown';
    const partIndex = section?.part
      ? document.parts.findIndex((part) => part.heading === section.part)
      : -1;
    const partKey = partIndex >= 0 ? `part:${partIndex}` : 'unassigned';

    chunkCountsBySectionType[type] = (chunkCountsBySectionType[type] ?? 0) + 1;
    chunkCountsByPartIndex[partKey] = (chunkCountsByPartIndex[partKey] ?? 0) + 1;
  }

  const hashGroups = new Map<string, string[]>();

  for (const chunk of chunks) {
    const ids = hashGroups.get(chunk.contentHash) ?? [];
    ids.push(chunk.id);
    hashGroups.set(chunk.contentHash, ids);
  }

  const duplicateContentHashGroups: DuplicateHashGroup[] = [...hashGroups.entries()]
    .filter(([, ids]) => ids.length > 1)
    .map(([contentHash, chunkIds]) => ({
      contentHash,
      count: chunkIds.length,
      chunkIds,
    }))
    .sort((left, right) => right.count - left.count || left.contentHash.localeCompare(right.contentHash));

  const nearEmptyChunks = chunks.filter(
    (chunk) => chunk.charCount < NEAR_EMPTY_CHARS,
  );

  const invalidOffsets = chunks.filter(
    (chunk) =>
      chunk.charStart < 0 ||
      chunk.charEnd > document.normalized.length ||
      chunk.charEnd <= chunk.charStart ||
      document.normalized.slice(chunk.charStart, chunk.charEnd) !== chunk.text ||
      chunk.charCount !== chunk.text.length,
  );

  const ordered = [...chunks].sort(
    (left, right) => left.charStart - right.charStart || left.index - right.index,
  );
  let overlappingOffsetPairCount = 0;

  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index].charStart < ordered[index - 1].charEnd) {
      overlappingOffsetPairCount += 1;
    }
  }

  const chunksCrossingSectionBoundaryCount = chunks.filter((chunk) => {
    const section = document.sections[chunk.sectionIndex];

    return (
      !section ||
      chunk.charStart < section.bodyStart ||
      chunk.charEnd > section.charEnd
    );
  }).length;

  const sectionsWithNoChunks = document.sections
    .filter(
      (section) =>
        !chunks.some((chunk) => chunk.sectionIndex === section.index),
    )
    .map((section) => section.index);

  return {
    totalChunks: chunks.length,
    minChunkChars: lengths.length > 0 ? lengths[0] : 0,
    medianChunkChars: percentile(lengths, 0.5),
    p95ChunkChars: percentile(lengths, 0.95),
    maxChunkChars: lengths.length > 0 ? lengths[lengths.length - 1] : 0,
    chunkCountsBySectionType,
    chunkCountsByPartIndex,
    nearEmptyChunkCount: nearEmptyChunks.length,
    nearEmptyChunkIds: nearEmptyChunks.map((chunk) => chunk.id),
    duplicateContentHashCount: duplicateContentHashGroups.length,
    duplicateContentHashGroups,
    invalidOffsetCount: invalidOffsets.length,
    invalidOffsetChunkIds: invalidOffsets.map((chunk) => chunk.id),
    overlappingOffsetPairCount,
    chunksCrossingSectionBoundaryCount,
    sectionsWithNoChunks,
    partCount: document.parts.length,
    chapterCount: document.sections.filter((section) => section.type === 'chapter').length,
    sectionCount: document.sections.length,
    sectionCountingRule:
      'Content sections = 1 introduction + 1 prologue + 46 chapters + 1 epilogue = 49. The four PART headings are structural markers and do not create content sections or chunks.',
    stableManifest: determinism.stableManifest,
    stableChunkIds: determinism.stableChunkIds,
    uniqueChunkIds: determinism.uniqueChunkIds,
  };
}
