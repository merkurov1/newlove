import { tryNormalizeSourceUrl } from '@/lib/knowledge/brain/url';

export type MediaBulkPlanRow =
  | {
      input: string;
      normalizedUrl: string;
      status: 'candidate';
    }
  | {
      input: string;
      normalizedUrl: null;
      status: 'invalid';
      reason: string;
    }
  | {
      input: string;
      normalizedUrl: string;
      status: 'duplicate_in_input';
    };

export function parseMediaBulkBody(body: unknown, maxUrls = 500): string[] {
  if (!body || typeof body !== 'object') return [];

  const record = body as Record<string, unknown>;
  const raw = Array.isArray(record.urls)
    ? record.urls
    : typeof record.urls === 'string'
      ? record.urls.split(/\r?\n/)
      : [];

  return raw
    .map((value) => (typeof value === 'string' ? value.trim() : ''))
    .filter(Boolean)
    .slice(0, maxUrls);
}

export function planMediaBulkInputs(inputs: string[]): MediaBulkPlanRow[] {
  const seen = new Set<string>();
  const rows: MediaBulkPlanRow[] = [];

  for (const input of inputs) {
    const normalized = tryNormalizeSourceUrl(input);

    if (!normalized.url) {
      rows.push({
        input,
        normalizedUrl: null,
        status: 'invalid',
        reason: normalized.error || 'url_invalid',
      });
      continue;
    }

    if (seen.has(normalized.url)) {
      rows.push({
        input,
        normalizedUrl: normalized.url,
        status: 'duplicate_in_input',
      });
      continue;
    }

    seen.add(normalized.url);
    rows.push({
      input,
      normalizedUrl: normalized.url,
      status: 'candidate',
    });
  }

  return rows;
}
