import { createHash } from 'node:crypto';

import type { ArticleBlock, ExtractedArticle } from './extract';

export const ARTICLE_PARSER_VERSION = 'brain-article-parser-v1';
export const ARTICLE_CHUNKER_VERSION = 'brain-article-chunker-v1';
export const BRAIN_INGESTION_VERSION = 'brain-ingestion-v1';
export const ARTICLE_MAX_CHUNK_CHARS = 2400;
export const ARTICLE_OVERLAP_CHARS = 300;

export type ArticleChunk = {
  id: string;
  chunkIndex: number;
  content: string;
  contentHash: string;
  heading: string;
  sectionPath: string[];
  sectionIndex: number;
  charStart: number;
  charEnd: number;
  lineStart: number;
  lineEnd: number;
};

export type ArticleChunkingResult = {
  documentText: string;
  chunks: ArticleChunk[];
  sectionCount: number;
};

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function lineStarts(text: string): number[] {
  const starts = [0];

  for (let index = 0; index < text.length; index += 1) {
    if (text.charCodeAt(index) === 10) starts.push(index + 1);
  }

  return starts;
}

function lineAt(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;

  while (low <= high) {
    const middle = Math.floor((low + high) / 2);

    if (starts[middle] <= offset) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return Math.max(1, low);
}

type PlacedBlock = {
  block: ArticleBlock;
  start: number;
  end: number;
};

function placeBlocks(blocks: ArticleBlock[]): { text: string; placed: PlacedBlock[] } {
  const placed: PlacedBlock[] = [];
  let offset = 0;

  for (const block of blocks) {
    const start = offset;
    const end = start + block.text.length;

    placed.push({ block, start, end });
    offset = end + 2;
  }

  return {
    text: blocks.map((block) => block.text).join('\n\n'),
    placed,
  };
}

type Section = {
  heading: string;
  level: number;
  path: string[];
  blocks: PlacedBlock[];
};

function sectionPathFor(
  title: string,
  headingStack: Array<{ text: string; level: number }>,
  heading: string
): string[] {
  const parts: string[] = [];
  const titleKey = title.trim().toLowerCase();

  const push = (value: string) => {
    const text = value.replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!text) return;
    if (parts.length > 0 && parts[parts.length - 1].toLowerCase() === text.toLowerCase()) return;
    parts.push(text);
  };

  push(title);

  for (const entry of headingStack) {
    if (entry.text.trim().toLowerCase() === titleKey && parts.length === 1) continue;
    push(entry.text);
  }

  if (parts.length === 1 && heading.trim().toLowerCase() !== titleKey) {
    push(heading);
  }

  return parts.slice(0, 8);
}

function groupSections(
  title: string,
  placed: PlacedBlock[]
): Section[] {
  const sections: Section[] = [];
  const stack: Array<{ text: string; level: number }> = [];

  let current: Section = {
    heading: title,
    level: 0,
    path: [title.slice(0, 500) || 'Untitled article'],
    blocks: [],
  };

  for (const entry of placed) {
    const block = entry.block;

    if (block.type === 'heading') {
      if (current.blocks.length > 0 || sections.length === 0) {
        sections.push(current);
      }

      const level = Math.max(1, Math.min(6, block.level ?? 2));

      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      stack.push({ text: block.text, level });

      current = {
        heading: block.text,
        level,
        path: sectionPathFor(title, stack, block.text),
        blocks: [],
      };

      continue;
    }

    current.blocks.push(entry);
  }

  if (current.blocks.length > 0 || sections.length === 0) {
    sections.push(current);
  }

  return sections.filter((section) => section.blocks.length > 0);
}

type LocalRange = { start: number; end: number };

function splitOversizedText(
  text: string,
  maxChars: number,
  overlapChars: number
): LocalRange[] {
  const ranges: LocalRange[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(text.length, start + maxChars);

    if (end < text.length) {
      const window = text.slice(start, end);
      const sentenceBreak = Math.max(
        window.lastIndexOf('. '),
        window.lastIndexOf('! '),
        window.lastIndexOf('? '),
        window.lastIndexOf('… '),
        window.lastIndexOf('\n')
      );

      if (sentenceBreak >= Math.floor(maxChars * 0.6)) {
        end = start + sentenceBreak + 1;
      } else {
        const spaceBreak = window.lastIndexOf(' ');

        if (spaceBreak >= Math.floor(maxChars * 0.6)) {
          end = start + spaceBreak;
        }
      }
    }

    if (end <= start) end = Math.min(text.length, start + maxChars);

    ranges.push({ start, end });
    start = Math.max(start + 1, end - overlapChars);
  }

  return ranges;
}

export function chunkArticle(
  article: ExtractedArticle,
  documentId: string
): ArticleChunkingResult {
  const { text: documentText, placed } = placeBlocks(article.blocks);
  const starts = lineStarts(documentText);
  const title = article.title || 'Untitled article';

  const sections = groupSections(title, placed);
  const chunks: ArticleChunk[] = [];

  const pushChunk = (content: string, start: number, end: number, section: Section, index: number) => {
    const trimmed = content.trim();

    if (!trimmed) return;

    const leading = content.length - content.trimStart().length;
    const charStart = start + leading;
    const charEnd = Math.min(end, charStart + trimmed.length);
    const contentHash = sha256(trimmed);
    const chunkIndex = chunks.length;

    chunks.push({
      id: `chk_${sha256(`${documentId}|${ARTICLE_CHUNKER_VERSION}|${chunkIndex}|${contentHash}`).slice(
        0,
        32
      )}`,
      chunkIndex,
      content: trimmed.slice(0, 4000),
      contentHash,
      heading: (section.heading || title).replace(/\s+/g, ' ').trim().slice(0, 500) || 'Untitled article',
      sectionPath:
        section.path.length > 0
          ? section.path
          : [title.replace(/\s+/g, ' ').trim().slice(0, 500) || 'Untitled article'],
      sectionIndex: index,
      charStart,
      charEnd,
      lineStart: lineAt(starts, charStart),
      lineEnd: lineAt(starts, Math.max(charStart, charEnd - 1)),
    });
  };

  sections.forEach((section, sectionIndex) => {
    let group: PlacedBlock[] = [];

    const flush = () => {
      if (group.length === 0) return;

      const start = group[0].start;
      const end = group[group.length - 1].end;

      pushChunk(documentText.slice(start, end), start, end, section, sectionIndex);
      group = [];
    };

    for (const entry of section.blocks) {
      const length = entry.end - entry.start;

      if (length > ARTICLE_MAX_CHUNK_CHARS) {
        flush();

        const content = documentText.slice(entry.start, entry.end);

        for (const range of splitOversizedText(
          content,
          ARTICLE_MAX_CHUNK_CHARS,
          ARTICLE_OVERLAP_CHARS
        )) {
          pushChunk(
            content.slice(range.start, range.end),
            entry.start + range.start,
            entry.start + range.end,
            section,
            sectionIndex
          );
        }

        continue;
      }

      if (group.length > 0 && entry.end - group[0].start > ARTICLE_MAX_CHUNK_CHARS) {
        flush();
      }

      group.push(entry);
    }

    flush();
  });

  return {
    documentText,
    chunks,
    sectionCount: sections.length,
  };
}
