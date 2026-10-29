import { createHash } from 'node:crypto';

import {
  ManuscriptStructureError,
  SourceHashMismatchError,
  type ManifestChecks,
  type UnframedBuild,
  type UnframedChunk,
  type UnframedManifest,
  type UnframedManifestChunk,
  type UnframedParagraph,
  type UnframedParsedDocument,
  type UnframedParsedSection,
  type UnframedPart,
  type UnframedSection,
  type UnframedSectionType,
} from './types';

export const UNFRAMED_SOURCE_PATH = 'app/unframed/Unframed.markdown';
export const UNFRAMED_EXPECTED_SHA256 =
  'cf1852c708185408b9ec1081584d62857c1f05cbd8ad1f5fd15ad7efa39d9923';
export const UNFRAMED_PARSER_VERSION = 'unframed-parser-v1';
export const UNFRAMED_CHUNKER_VERSION = 'unframed-chunker-v1';
export const UNFRAMED_DOCUMENT_ID = 'doc_unframed_manuscript';
export const UNFRAMED_MAX_CHUNK_CHARS = 2_400;
export const UNFRAMED_OVERLAP_CHARS = 300;

const BODY_INTRO_HEADING = 'INTRODUCTION: UNFRAMED';
const PART_PATTERN = /^#\s+PART\s+([IVX]+)\b(.*)$/i;
const CHAPTER_PATTERN = /^CHAPTER\s+\d{1,3}:\s*(.+)$/i;
const NAMED_SECTION_PATTERN = /^(INTRODUCTION|PROLOGUE|EPILOGUE):\s*(.+)$/i;

type HeadingMarker = {
  kind: 'part' | 'section';
  sectionType?: UnframedSectionType;
  heading: string;
  part: string | null;
  charStart: number;
  charEnd: number;
  bodyStart: number;
  lineStart: number;
  lineEnd: number;
};

type LocalChunk = {
  text: string;
  charStart: number;
  charEnd: number;
};

type ParagraphOptions = {
  maxChunkChars: number;
  overlapChars: number;
};

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function normalizeUnframedSource(raw: string): string {
  return raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

export function countUnframedWords(text: string): number {
  const trimmed = text.trim();

  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function buildLineStarts(source: string): number[] {
  const starts = [0];

  for (let i = 0; i < source.length; i += 1) {
    if (source.charCodeAt(i) === 10) starts.push(i + 1);
  }

  return starts;
}

function lineNumberAt(lineStarts: number[], offset: number): number {
  let low = 0;
  let high = lineStarts.length - 1;
  let result = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);

    if (lineStarts[mid] <= offset) {
      result = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return result + 1;
}

function lineBounds(
  source: string,
  lineStarts: number[],
  lineIndex: number,
): { start: number; end: number; nextStart: number } {
  const start = lineStarts[lineIndex];
  const nextStart =
    lineIndex + 1 < lineStarts.length ? lineStarts[lineIndex + 1] : source.length;
  const end = lineIndex + 1 < lineStarts.length ? Math.max(start, nextStart - 1) : source.length;

  return { start, end, nextStart };
}

function findBodyStart(source: string, lineStarts: number[]): number {
  const matches: number[] = [];

  for (let i = 0; i < lineStarts.length; i += 1) {
    const { start, end } = lineBounds(source, lineStarts, i);
    const line = source
      .slice(start, end)
      .trim()
      .replace(/^#{1,6}\s*/, '');

    if (line === BODY_INTRO_HEADING) matches.push(start);
  }

  if (matches.length === 0) {
    throw new ManuscriptStructureError('body_intro_heading_not_found');
  }

  // The book has a TOC entry for the introduction and a second, plain-text
  // heading where the actual body begins. Use the second match when present.
  return matches.length > 1 ? matches[1] : matches[0];
}

function cleanHeading(value: string): string {
  return value
    .replace(/\s+/g, ' ')
    .replace(/\s*\\?<--\s*NEW\s*$/i, '')
    .trim();
}

function collectHeadingMarkers(
  source: string,
  lineStarts: number[],
  bodyStart: number,
): HeadingMarker[] {
  const markers: HeadingMarker[] = [];
  let currentPart: string | null = null;

  for (let i = 0; i < lineStarts.length; i += 1) {
    const { start, end, nextStart } = lineBounds(source, lineStarts, i);

    if (start < bodyStart) continue;

    const trimmed = source.slice(start, end).trim();
    if (!trimmed) continue;

    const partMatch = PART_PATTERN.exec(trimmed);

    if (partMatch) {
      const heading = cleanHeading(trimmed.replace(/^#\s+/, ''));
      currentPart = heading;

      markers.push({
        kind: 'part',
        heading,
        part: currentPart,
        charStart: start,
        charEnd: end,
        bodyStart: nextStart,
        lineStart: i + 1,
        lineEnd: i + 1,
      });

      continue;
    }

    const chapterMatch = CHAPTER_PATTERN.exec(trimmed);

    if (chapterMatch) {
      const heading = cleanHeading(trimmed);

      markers.push({
        kind: 'section',
        sectionType: 'chapter',
        heading,
        part: currentPart,
        charStart: start,
        charEnd: end,
        bodyStart: nextStart,
        lineStart: i + 1,
        lineEnd: i + 1,
      });

      continue;
    }

    const namedMatch = NAMED_SECTION_PATTERN.exec(trimmed);

    if (namedMatch) {
      const type = namedMatch[1].toLowerCase() as UnframedSectionType;
      const heading = cleanHeading(trimmed);

      markers.push({
        kind: 'section',
        sectionType: type,
        heading,
        part: currentPart,
        charStart: start,
        charEnd: end,
        bodyStart: nextStart,
        lineStart: i + 1,
        lineEnd: i + 1,
      });
    }
  }

  return markers;
}

function extractParagraphs(
  source: string,
  start: number,
  end: number,
): UnframedParagraph[] {
  if (end <= start) return [];

  const slice = source.slice(start, end);
  const separator = /\n[ \t]*\n/g;
  const paragraphs: UnframedParagraph[] = [];

  const pushSegment = (segmentStart: number, segmentEnd: number): void => {
    const raw = slice.slice(segmentStart, segmentEnd);
    const leading = raw.length - raw.trimStart().length;
    const text = raw.trim();

    if (!text || text === '\\#' || text === '#') return;

    const charStart = start + segmentStart + leading;
    paragraphs.push({
      text,
      charStart,
      charEnd: charStart + text.length,
    });
  };

  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = separator.exec(slice)) !== null) {
    pushSegment(cursor, match.index);
    cursor = match.index + match[0].length;
  }

  pushSegment(cursor, slice.length);

  return paragraphs;
}

function makeLocalChunk(
  paragraph: UnframedParagraph,
  localStart: number,
  localEnd: number,
): LocalChunk | null {
  const raw = paragraph.text.slice(localStart, localEnd);
  const leading = raw.length - raw.trimStart().length;
  const text = raw.trim();

  if (!text) return null;

  const charStart = paragraph.charStart + localStart + leading;

  return {
    text,
    charStart,
    charEnd: charStart + text.length,
  };
}

function splitSentences(text: string): LocalChunk[] {
  const sentences: LocalChunk[] = [];
  const boundary = /[.!?]+(?:["'”’)\]]+)?(?=\s|$)/g;

  let sentenceStart = 0;
  let match: RegExpExecArray | null;

  const push = (end: number): void => {
    const raw = text.slice(sentenceStart, end);
    const leading = raw.length - raw.trimStart().length;
    const trimmed = raw.trim();

    if (trimmed) {
      sentences.push({
        text: trimmed,
        charStart: sentenceStart + leading,
        charEnd: sentenceStart + leading + trimmed.length,
      });
    }

    sentenceStart = end;

    while (sentenceStart < text.length && /\s/.test(text[sentenceStart])) {
      sentenceStart += 1;
    }
  };

  while ((match = boundary.exec(text)) !== null) {
    push(match.index + match[0].length);
  }

  if (sentenceStart < text.length) push(text.length);

  if (sentences.length === 0 && text.trim()) {
    const leading = text.length - text.trimStart().length;

    sentences.push({
      text: text.trim(),
      charStart: leading,
      charEnd: leading + text.trim().length,
    });
  }

  return sentences;
}

function hardSplit(
  paragraph: UnframedParagraph,
  localStart: number,
  localEnd: number,
  maxChunkChars: number,
): LocalChunk[] {
  const pieces: LocalChunk[] = [];
  let cursor = localStart;

  while (cursor < localEnd) {
    let limit = Math.min(cursor + maxChunkChars, localEnd);

    if (limit < localEnd) {
      const lastSpace = paragraph.text.lastIndexOf(' ', limit);

      if (lastSpace > cursor) limit = lastSpace;
    }

    if (limit <= cursor) limit = Math.min(cursor + 1, localEnd);

    const piece = makeLocalChunk(paragraph, cursor, limit);

    if (piece) pieces.push(piece);

    cursor = limit;

    while (cursor < localEnd && /\s/.test(paragraph.text[cursor])) {
      cursor += 1;
    }
  }

  return pieces;
}

function splitOversizedParagraph(
  paragraph: UnframedParagraph,
  maxChunkChars: number,
  overlapChars: number,
): LocalChunk[] {
  const sentences = splitSentences(paragraph.text);
  const pieces: LocalChunk[] = [];

  let index = 0;

  while (index < sentences.length) {
    const first = sentences[index];

    if (first.text.length > maxChunkChars) {
      pieces.push(...hardSplit(paragraph, first.charStart, first.charEnd, maxChunkChars));
      index += 1;
      continue;
    }

    let endIndex = index;

    while (
      endIndex < sentences.length &&
      sentences[endIndex].charEnd - first.charStart <= maxChunkChars
    ) {
      endIndex += 1;
    }

    if (endIndex === index) endIndex = index + 1;

    const piece = makeLocalChunk(
      paragraph,
      first.charStart,
      sentences[endIndex - 1].charEnd,
    );

    if (piece) pieces.push(piece);

    if (endIndex >= sentences.length) break;

    let nextIndex = endIndex;
    let overlapLength = 0;

    while (nextIndex > index && overlapChars > 0) {
      const previous = sentences[nextIndex - 1];

      if (previous.text.length > overlapChars) break;
      if (overlapLength + previous.text.length > overlapChars) break;

      overlapLength += previous.text.length;
      nextIndex -= 1;
    }

    index = nextIndex > index ? nextIndex : endIndex;
  }

  return pieces;
}

function chunkParagraphGroup(
  source: string,
  paragraphs: UnframedParagraph[],
): LocalChunk | null {
  if (paragraphs.length === 0) return null;

  const start = paragraphs[0].charStart;
  const end = paragraphs[paragraphs.length - 1].charEnd;
  const text = source.slice(start, end).trim();

  if (!text) return null;

  return {
    text,
    charStart: start,
    charEnd: start + text.length,
  };
}

function chunkSection(
  source: string,
  section: UnframedParsedSection,
  options: ParagraphOptions,
): LocalChunk[] {
  const chunks: LocalChunk[] = [];
  let group: UnframedParagraph[] = [];

  const flushGroup = (): void => {
    const chunk = chunkParagraphGroup(source, group);

    if (chunk) chunks.push(chunk);

    group = [];
  };

  for (const paragraph of section.paragraphs) {
    if (paragraph.text.length > options.maxChunkChars) {
      flushGroup();
      chunks.push(
        ...splitOversizedParagraph(
          paragraph,
          options.maxChunkChars,
          options.overlapChars,
        ),
      );
      continue;
    }

    if (
      group.length > 0 &&
      paragraph.charEnd - group[0].charStart > options.maxChunkChars
    ) {
      flushGroup();
    }

    group.push(paragraph);
  }

  flushGroup();

  return chunks;
}

function toManifestSection(section: UnframedParsedSection): UnframedSection {
  return {
    index: section.index,
    type: section.type,
    heading: section.heading,
    part: section.part,
    sectionPath: [...section.sectionPath],
    charStart: section.charStart,
    charEnd: section.charEnd,
    lineStart: section.lineStart,
    lineEnd: section.lineEnd,
    paragraphCount: section.paragraphCount,
  };
}

function toManifestChunk(chunk: UnframedChunk): UnframedManifestChunk {
  const { text: _text, ...metadata } = chunk;

  return metadata;
}

function manifestPayload(manifest: Omit<UnframedManifest, 'manifestHash'>): string {
  return JSON.stringify({
    schemaVersion: manifest.schemaVersion,
    sourcePath: manifest.sourcePath,
    sourceSha256: manifest.sourceSha256,
    parserVersion: manifest.parserVersion,
    chunkerVersion: manifest.chunkerVersion,
    documentId: manifest.documentId,
    sourceCharCount: manifest.sourceCharCount,
    sourceWordCount: manifest.sourceWordCount,
    bodyCharCount: manifest.bodyCharCount,
    bodyWordCount: manifest.bodyWordCount,
    partCount: manifest.partCount,
    chapterCount: manifest.chapterCount,
    sectionCount: manifest.sectionCount,
    chunkCount: manifest.chunkCount,
    sections: manifest.sections,
    chunks: manifest.chunks,
  });
}

export function validateUnframedBuild(
  build: Omit<UnframedBuild, 'checks'>,
  maxChunkChars: number,
): ManifestChecks {
  const { document, chunks, manifest } = build;

  const tocExcluded =
    document.bodyStart > 0 &&
    document.sections.length > 0 &&
    document.sections[0].charStart >= document.bodyStart &&
    manifest.sections.every((section) => !section.heading.startsWith('##'));

  const sectionBoundaries = chunks.every((chunk) => {
    const section = document.sections[chunk.sectionIndex];

    if (!section) return false;

    return (
      chunk.charStart >= section.bodyStart &&
      chunk.charEnd <= section.charEnd &&
      chunk.sectionPath.length === section.sectionPath.length &&
      chunk.sectionPath.every((part, index) => part === section.sectionPath[index])
    );
  });

  const offsetsValid = chunks.every(
    (chunk) =>
      document.normalized.slice(chunk.charStart, chunk.charEnd) === chunk.text &&
      chunk.charCount === chunk.text.length &&
      chunk.lineStart >= 1 &&
      chunk.lineEnd >= chunk.lineStart,
  );

  const uniqueChunkIds = new Set(chunks.map((chunk) => chunk.id)).size === chunks.length;

  const sectionPathsValid = manifest.sections.every((section) => {
    const last = section.sectionPath[section.sectionPath.length - 1];

    if (last !== section.heading) return false;

    if (section.type === 'introduction' || section.type === 'prologue') {
      return section.sectionPath.length === 1;
    }

    if (section.part === null) return section.sectionPath.length === 1;

    return (
      section.sectionPath.length === 2 &&
      section.sectionPath[0] === section.part &&
      section.sectionPath[0].startsWith('PART ')
    );
  });

  const maxChunkCharsRespected = chunks.every(
    (chunk) => chunk.text.length <= maxChunkChars,
  );

  return {
    tocExcluded,
    sectionBoundaries,
    offsetsValid,
    uniqueChunkIds,
    sectionPathsValid,
    maxChunkCharsRespected,
  };
}

export function buildUnframedManifest(input: {
  raw: string;
  sourcePath?: string;
  expectedSha256?: string;
  maxChunkChars?: number;
  overlapChars?: number;
}): UnframedBuild {
  const sourcePath = input.sourcePath ?? UNFRAMED_SOURCE_PATH;
  const maxChunkChars = input.maxChunkChars ?? UNFRAMED_MAX_CHUNK_CHARS;
  const overlapChars = Math.max(
    0,
    Math.min(input.overlapChars ?? UNFRAMED_OVERLAP_CHARS, Math.max(0, maxChunkChars - 1)),
  );

  if (!Number.isInteger(maxChunkChars) || maxChunkChars < 1) {
    throw new ManuscriptStructureError('invalid_max_chunk_chars');
  }

  const normalized = normalizeUnframedSource(input.raw);
  const sourceSha256 = sha256Hex(normalized);

  if (input.expectedSha256 && sourceSha256 !== input.expectedSha256) {
    throw new SourceHashMismatchError(input.expectedSha256, sourceSha256);
  }

  const lineStarts = buildLineStarts(normalized);
  const bodyStart = findBodyStart(normalized, lineStarts);
  const markers = collectHeadingMarkers(normalized, lineStarts, bodyStart);

  const parts: UnframedPart[] = [];
  const sections: UnframedParsedSection[] = [];

  for (let markerIndex = 0; markerIndex < markers.length; markerIndex += 1) {
    const marker = markers[markerIndex];

    if (marker.kind === 'part') {
      parts.push({
        index: parts.length,
        heading: marker.heading,
        charStart: marker.charStart,
        charEnd: marker.charEnd,
        lineStart: marker.lineStart,
        lineEnd: marker.lineEnd,
      });

      continue;
    }

    const nextMarker = markers[markerIndex + 1];
    const bodyEnd = nextMarker ? nextMarker.charStart : normalized.length;
    const paragraphs = extractParagraphs(normalized, marker.bodyStart, bodyEnd);
    const sectionPath = marker.part
      ? [marker.part, marker.heading]
      : [marker.heading];
    const sectionEndOffset = Math.max(marker.charStart, bodyEnd - 1);

    sections.push({
      index: sections.length,
      type: marker.sectionType ?? 'chapter',
      heading: marker.heading,
      part: marker.part,
      sectionPath,
      charStart: marker.charStart,
      charEnd: bodyEnd,
      lineStart: marker.lineStart,
      lineEnd: lineNumberAt(lineStarts, sectionEndOffset),
      bodyStart: marker.bodyStart,
      bodyEnd,
      paragraphs,
      paragraphCount: paragraphs.length,
    });
  }

  if (sections.length === 0) {
    throw new ManuscriptStructureError('no_body_sections_found');
  }

  const document: UnframedParsedDocument = {
    sourcePath,
    normalized,
    sourceSha256,
    bodyStart,
    bodyEnd: normalized.length,
    parts,
    sections,
  };

  const chunks: UnframedChunk[] = [];

  for (const section of sections) {
    const localChunks = chunkSection(normalized, section, {
      maxChunkChars,
      overlapChars,
    });

    for (const local of localChunks) {
      const index = chunks.length;
      const contentHash = sha256Hex(local.text);
      const id = `chk_${sha256Hex(
        `${UNFRAMED_DOCUMENT_ID}|${UNFRAMED_CHUNKER_VERSION}|${index}|${contentHash}`,
      ).slice(0, 32)}`;

      chunks.push({
        id,
        index,
        sectionIndex: section.index,
        sectionPath: [...section.sectionPath],
        heading: section.heading,
        text: local.text,
        charStart: local.charStart,
        charEnd: local.charEnd,
        lineStart: lineNumberAt(lineStarts, local.charStart),
        lineEnd: lineNumberAt(lineStarts, Math.max(local.charStart, local.charEnd - 1)),
        charCount: local.text.length,
        contentHash,
      });
    }
  }

  const manifestBase: Omit<UnframedManifest, 'manifestHash'> = {
    schemaVersion: 1,
    sourcePath,
    sourceSha256,
    parserVersion: UNFRAMED_PARSER_VERSION,
    chunkerVersion: UNFRAMED_CHUNKER_VERSION,
    documentId: UNFRAMED_DOCUMENT_ID,
    sourceCharCount: normalized.length,
    sourceWordCount: countUnframedWords(normalized),
    bodyCharCount: normalized.length - bodyStart,
    bodyWordCount: countUnframedWords(normalized.slice(bodyStart)),
    partCount: parts.length,
    chapterCount: sections.filter((section) => section.type === 'chapter').length,
    sectionCount: sections.length,
    chunkCount: chunks.length,
    sections: sections.map(toManifestSection),
    chunks: chunks.map(toManifestChunk),
  };

  const manifest: UnframedManifest = {
    ...manifestBase,
    manifestHash: sha256Hex(manifestPayload(manifestBase)),
  };

  const buildWithoutChecks = {
    manifest,
    document,
    chunks,
  };

  const checks = validateUnframedBuild(buildWithoutChecks, maxChunkChars);

  return {
    ...buildWithoutChecks,
    checks,
  };
}
