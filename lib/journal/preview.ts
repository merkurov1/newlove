/**
 * Clean text extractor for Journal previews.
 * Prevents raw CSS, HTML tags, or JSON syntax from leaking into dispatches & issue cards.
 */

function decodeEntities(str: string): string {
  return str
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&mdash;/gi, '—')
    .replace(/&ndash;/gi, '–')
    .replace(/&laquo;/gi, '«')
    .replace(/&raquo;/gi, '»')
    .replace(/&#\d+;/g, ' ');
}

export function stripHtml(raw: string): string {
  if (!raw) return '';
  return decodeEntities(
    String(raw)
      // Strip style and script blocks with their internal contents
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, ' ')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ' ')
      .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, ' ')
      .replace(/<header[^>]*>[\s\S]*?<\/header>/gi, ' ')
      .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, ' ')
      .replace(/<svg[^>]*>[\s\S]*?<\/svg>/gi, ' ')
      .replace(/<pre[^>]*>[\s\S]*?<\/pre>/gi, ' ')
      // Break block elements into spaces
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<\/(p|div|li|h[1-6]|section|article|aside|tr|td)>/gi, ' ')
      // Strip remaining tags
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractPreview(
  content: unknown,
  payload?: any,
  limit = 260,
): string {
  // 1. If issue payload has a lead article, use its body or title
  if (payload && typeof payload === 'object') {
    const leadBody =
      typeof payload.lead?.body === 'string'
        ? stripHtml(payload.lead.body)
        : '';
    if (leadBody) {
      return truncate(leadBody, limit);
    }
    const leadTitle =
      typeof payload.lead?.title === 'string'
        ? stripHtml(payload.lead.title)
        : '';
    if (leadTitle) {
      return truncate(leadTitle, limit);
    }
  }

  if (!content) return '';

  let text = '';
  let candidateJson: any = null;

  if (typeof content === 'object') {
    candidateJson = content;
  } else if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        candidateJson = JSON.parse(trimmed);
      } catch {
        // Not valid JSON, process as string
      }
    }
  }

  // 2. Extract from EditorJS / Block format
  if (candidateJson && typeof candidateJson === 'object') {
    const blocks = Array.isArray(candidateJson)
      ? candidateJson
      : Array.isArray(candidateJson.blocks)
        ? candidateJson.blocks
        : [];

    const parts: string[] = [];
    for (const b of blocks) {
      if (!b) continue;
      if (b.type === 'code' || b.type === 'raw') continue;

      const data = b.data;
      if (!data) continue;

      if (typeof data === 'string') {
        const clean = stripHtml(data);
        if (clean) parts.push(clean);
      } else if (typeof data === 'object') {
        const str = data.text || data.html || data.caption || '';
        if (typeof str === 'string') {
          const clean = stripHtml(str);
          if (clean) parts.push(clean);
        }
        if (Array.isArray(data.items)) {
          for (const it of data.items) {
            const itStr =
              typeof it === 'string'
                ? it
                : it?.content || it?.text || '';
            const clean = stripHtml(itStr);
            if (clean) parts.push(clean);
          }
        }
      }
    }

    text = parts.join(' ');
  }

  // 3. Fallback to HTML string
  if (!text && typeof content === 'string') {
    text = stripHtml(content);
  }

  const clean = text.replace(/\s+/g, ' ').trim();

  // Safety filter: if it still has raw CSS or JSON remnants, don't leak it
  if (
    clean.startsWith('{') ||
    clean.startsWith('[') ||
    clean.includes('"blocks":') ||
    clean.includes(':root{') ||
    clean.includes('--bg:')
  ) {
    return '';
  }

  return truncate(clean, limit);
}

function truncate(str: string, limit: number): string {
  if (str.length <= limit) return str;
  return `${str.substring(0, limit).trim()}...`;
}
