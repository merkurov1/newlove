import {
  PIERROT_RESPONSE_VERSION,
  type PierrotChecklistBlock,
  type PierrotContentBlock,
  type PierrotResponse,
  type PierrotStepsBlock,
  type PierrotTableBlock,
  type PierrotWarningLevel,
} from './types';

/**
 * Deterministic Markdown → presentation contract adapter.
 *
 * This is the presentation layer, not generation. It only recognises structures
 * that are already explicit in the Markdown (headings, lists, tables, quotes,
 * fences, warnings). It never invents numbers, metrics, charts or sources, and
 * it never calls a model.
 */

type MarkdownLine = string;

const MAX_BLOCKS = 24;
const MAX_STEPS = 40;
const MAX_CHECKLIST = 60;
const MAX_TABLE_ROWS = 200;

function isBlank(line: string): boolean {
  return line.trim().length === 0;
}

function fenceStart(line: string): { language: string; filename: string | null } | null {
  const match = line.match(/^\s*```+\s*([^\s`]*)\s*(.*)$/);
  if (!match) return null;
  const language = (match[1] || '').trim().toLowerCase();
  const info = (match[2] || '').trim();
  const filenameMatch = info.match(/(?:filename|file|title)=("?)([^" ]+)\1/i);
  return {
    language,
    filename: filenameMatch?.[2] || (info && !info.includes('=') ? info : null),
  };
}

function isFenceEnd(line: string): boolean {
  return /^\s*```+\s*$/.test(line);
}

function splitTableRow(line: string): string[] {
  let value = line.trim();
  if (value.startsWith('|')) value = value.slice(1);
  if (value.endsWith('|')) value = value.slice(0, -1);
  return value.split('|').map((cell) => cell.trim());
}

function isTableSeparator(line: string): boolean {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
}

function tableBlock(lines: MarkdownLine[], start: number): { block: PierrotTableBlock; next: number } | null {
  if (start + 1 >= lines.length) return null;
  const header = splitTableRow(lines[start]);
  if (!lines[start].includes('|') || !isTableSeparator(lines[start + 1])) return null;
  const columns = header
    .slice(0, 12)
    .map((label, index) => ({
      key: `c${index + 1}`,
      label: label || '—',
      align: 'left' as const,
      format: 'text' as const,
    }));
  if (columns.length === 0) return null;

  const rows: Array<Record<string, string>> = [];
  let index = start + 2;
  while (index < lines.length && lines[index].includes('|') && !isBlank(lines[index])) {
    const cells = splitTableRow(lines[index]);
    const row: Record<string, string> = {};
    columns.forEach((column, columnIndex) => {
      row[column.key] = cells[columnIndex] || '';
    });
    rows.push(row);
    if (rows.length >= MAX_TABLE_ROWS) break;
    index += 1;
  }

  return {
    block: { type: 'table', columns, rows, compact: false },
    next: index,
  };
}

function headingBlock(line: string): PierrotContentBlock | null {
  const match = line.match(/^\s*(#{1,3})\s+(.+?)\s*#*\s*$/);
  if (!match) return null;
  const level = Math.min(3, match[1].length) as 1 | 2 | 3;
  const text = match[2].trim();
  if (!text) return null;
  return { type: 'heading', level, text };
}

function quoteBlock(lines: MarkdownLine[]): PierrotContentBlock {
  const body = lines
    .map((line) => line.replace(/^\s*>\s?/, '').trimEnd())
    .filter((line) => line.trim().length > 0);
  let attribution: string | undefined;
  if (body.length > 1) {
    const last = body[body.length - 1];
    if (/^(?:—|–|-|source:|источник:)/i.test(last)) {
      attribution = last.replace(/^(?:—|–|-)\s*/, '').trim();
      body.pop();
    }
  }
  return {
    type: 'quote',
    text: body.join('\n\n').trim(),
    ...(attribution ? { attribution } : {}),
  };
}

function warningLevel(line: string): PierrotWarningLevel | null {
  if (/^(?:⚠️?|critical|критично|ошибка)\s*[:—-]/i.test(line)) return 'critical';
  if (/^(?:warning|внимание|ограничение|limitation)\s*[:—-]/i.test(line)) return 'warning';
  if (/^(?:note|примечание|info)\s*[:—-]/i.test(line)) return 'info';
  return null;
}

function stepsBlock(lines: MarkdownLine[]): PierrotStepsBlock | null {
  const items: PierrotStepsBlock['items'] = [];
  let current: { text: string[]; title?: string } | null = null;

  for (const line of lines) {
    const match = line.match(/^\s*\d{1,3}[.)]\s+(.*)$/);
    if (match) {
      if (current) {
        items.push({ ...(current.title ? { title: current.title } : {}), text: current.text.join(' ').trim() });
      }
      current = { text: [match[1].trim()] };
    } else if (current && line.trim()) {
      current.text.push(line.trim());
    }
  }
  if (current) {
    items.push({ ...(current.title ? { title: current.title } : {}), text: current.text.join(' ').trim() });
  }

  const usable = items.filter((item) => item.text.length > 0).slice(0, MAX_STEPS);
  return usable.length >= 2 ? { type: 'steps', items: usable } : null;
}

function checklistBlock(lines: MarkdownLine[]): PierrotChecklistBlock | null {
  const items = lines
    .map((line) => line.match(/^\s*[-*]\s+\[([ xX])\]\s+(.*)$/))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map((match) => ({ checked: match[1].toLowerCase() === 'x', text: match[2].trim() }))
    .filter((item) => item.text.length > 0)
    .slice(0, MAX_CHECKLIST);
  return items.length > 0 ? { type: 'checklist', items } : null;
}

function isSpecialStart(line: string): boolean {
  return Boolean(
    fenceStart(line) ||
      headingBlock(line) ||
      /^\s*>/.test(line) ||
      /^\s*[-*]\s+\[[ xX]\]\s+/.test(line) ||
      /^\s*\d{1,3}[.)]\s+/.test(line) ||
      /^\s*[-*+]\s+/.test(line) ||
      /^\s*\|/.test(line) ||
      /^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)
  );
}

function markdownBlocks(markdown: string): PierrotContentBlock[] {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const blocks: PierrotContentBlock[] = [];
  let index = 0;
  let paragraph: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    const text = paragraph.join('\n').trim();
    paragraph = [];
    if (!text) return;
    const level = warningLevel(text.split('\n')[0]);
    if (level) {
      const first = text.split('\n')[0].replace(/^[^:—-]+[:—-]\s*/, '').trim();
      const rest = text.split('\n').slice(1).join('\n').trim();
      blocks.push({
        type: 'warning',
        level,
        title: text.split('\n')[0].replace(/[:—-].*$/, '').trim() || undefined,
        text: [first, rest].filter(Boolean).join('\n\n'),
      });
      return;
    }
    blocks.push({ type: 'text', markdown: text });
  };

  while (index < lines.length) {
    const line = lines[index];

    if (isBlank(line)) {
      flushParagraph();
      index += 1;
      continue;
    }

    const fence = fenceStart(line);
    if (fence) {
      flushParagraph();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !isFenceEnd(lines[index])) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({
        type: 'code',
        code: code.join('\n'),
        ...(fence.language ? { language: fence.language } : {}),
        ...(fence.filename ? { filename: fence.filename } : {}),
        showLineNumbers: code.length >= 12,
      });
      continue;
    }

    if (/^\s*\|/.test(line)) {
      const table = tableBlock(lines, index);
      if (table) {
        flushParagraph();
        blocks.push(table.block);
        index = table.next;
        continue;
      }
    }

    const heading = headingBlock(line);
    if (heading) {
      flushParagraph();
      blocks.push(heading);
      index += 1;
      continue;
    }

    if (/^\s*>/.test(line)) {
      flushParagraph();
      const quoteLines: string[] = [];
      while (index < lines.length && /^\s*>/.test(lines[index])) {
        quoteLines.push(lines[index]);
        index += 1;
      }
      const quote = quoteBlock(quoteLines);
      if (quote.type === 'quote' && quote.text.trim()) blocks.push(quote);
      continue;
    }

    if (/^\s*[-*]\s+\[[ xX]\]\s+/.test(line)) {
      flushParagraph();
      const listLines: string[] = [];
      while (index < lines.length && /^\s*[-*]\s+\[[ xX]\]\s+/.test(lines[index])) {
        listLines.push(lines[index]);
        index += 1;
      }
      const checklist = checklistBlock(listLines);
      if (checklist) blocks.push(checklist);
      else blocks.push({ type: 'text', markdown: listLines.join('\n') });
      continue;
    }

    if (/^\s*\d{1,3}[.)]\s+/.test(line)) {
      flushParagraph();
      const listLines: string[] = [];
      while (
        index < lines.length &&
        (/^\s*\d{1,3}[.)]\s+/.test(lines[index]) ||
          (listLines.length > 0 && lines[index].startsWith('   ') && lines[index].trim()))
      ) {
        listLines.push(lines[index]);
        index += 1;
      }
      const steps = stepsBlock(listLines);
      if (steps) blocks.push(steps);
      else blocks.push({ type: 'text', markdown: listLines.join('\n') });
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      flushParagraph();
      const listLines: string[] = [];
      while (
        index < lines.length &&
        (/^\s*[-*+]\s+/.test(lines[index]) ||
          (listLines.length > 0 && lines[index].startsWith('   ') && lines[index].trim()))
      ) {
        listLines.push(lines[index]);
        index += 1;
      }
      blocks.push({ type: 'text', markdown: listLines.join('\n') });
      continue;
    }

    if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      flushParagraph();
      index += 1;
      continue;
    }

    if (isSpecialStart(line)) {
      flushParagraph();
      blocks.push({ type: 'text', markdown: line });
      index += 1;
      continue;
    }

    paragraph.push(line);
    index += 1;
  }

  flushParagraph();
  return blocks;
}

function mergeAdjacentText(blocks: PierrotContentBlock[]): PierrotContentBlock[] {
  const merged: PierrotContentBlock[] = [];
  for (const block of blocks) {
    const previous = merged[merged.length - 1];
    if (block.type === 'text' && previous?.type === 'text') {
      previous.markdown = `${previous.markdown}\n\n${block.markdown}`;
    } else {
      merged.push(block);
    }
  }
  return merged;
}

function detectLanguage(markdown: string): 'ru' | 'en' {
  const cyrillic = (markdown.match(/[А-Яа-яЁё]/g) || []).length;
  const latin = (markdown.match(/[A-Za-z]/g) || []).length;
  return cyrillic > latin ? 'ru' : 'en';
}

export function buildPresentationResponseFromMarkdown(
  markdown: string,
  options: { language?: 'ru' | 'en' } = {}
): PierrotResponse | null {
  const source = typeof markdown === 'string' ? markdown.trim() : '';
  if (!source) return null;

  let blocks = mergeAdjacentText(markdownBlocks(source));

  if (blocks.length > MAX_BLOCKS) {
    // Preserve the whole answer rather than dropping blocks. The plain text
    // block still gets the same typography as the rest of the answer.
    blocks = mergeAdjacentText([{ type: 'text', markdown: source }]);
  }

  if (blocks.length === 0) return null;

  return {
    version: PIERROT_RESPONSE_VERSION,
    language: options.language || detectLanguage(source),
    blocks: blocks.slice(0, MAX_BLOCKS),
  };
}

export function isMarkdownOnlyResponse(value: unknown): boolean {
  return (
    !value ||
    typeof value !== 'object' ||
    !('blocks' in value) ||
    !Array.isArray((value as { blocks?: unknown }).blocks)
  );
}
