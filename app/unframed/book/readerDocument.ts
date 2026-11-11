export interface TocItem {
  id: string;
  title: string;
  level: number;
  line: number;
}

const HEADING_PATTERN = /^(#{1,3})[ \t]+(.+?)[ \t]*$/;
const FENCE_PATTERN = /^\s*(`{3,}|~{3,})/;

/**
 * Turns heading text into a stable, URL-safe anchor. This is deliberately
 * conservative: letters and numbers from any script are preserved, punctuation
 * is dropped, and whitespace becomes a single hyphen.
 */
export function slugifyHeading(value: string): string {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Removes inline Markdown while keeping the words a reader actually sees. */
export function headingText(raw: string): string {
  return String(raw || '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/\\([\\`*_[\]{}()#+\-.!])/g, '$1')
    .replace(/[*_~`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parses the exact same heading lines ReactMarkdown renders, assigning each one
 * a unique id. The TOC and the rendered headings both consume this list, so
 * their ids cannot drift apart.
 */
export function extractHeadings(markdown: string): TocItem[] {
  const items: TocItem[] = [];
  const used = new Set<string>();
  const lines = String(markdown || '').split(/\r?\n/);

  let fence: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = FENCE_PATTERN.exec(line);

    if (fenceMatch) {
      const marker = fenceMatch[1][0];

      if (!fence) {
        fence = marker;
      } else if (fence === marker) {
        fence = null;
      }

      continue;
    }

    if (fence) continue;

    const match = HEADING_PATTERN.exec(line);
    if (!match) continue;

    const title = headingText(match[2].replace(/[ \t]+#+[ \t]*$/, ''));
    if (!title) continue;

    const base = slugifyHeading(title) || 'section';
    let id = base;
    let suffix = 2;

    while (used.has(id)) {
      id = `${base}-${suffix}`;
      suffix += 1;
    }

    used.add(id);
    items.push({
      id,
      title,
      level: match[1].length,
      line: index + 1,
    });
  }

  return items;
}

/** Maps a Markdown source line to its generated heading id. */
export function headingIdsByLine(items: TocItem[]): Map<number, string> {
  return new Map(items.map((item) => [item.line, item.id]));
}
