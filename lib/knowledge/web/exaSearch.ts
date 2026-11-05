import { assertServerOnly } from '@/lib/serverOnly';
import {
  EXA_SEARCH_ENDPOINT,
  WEB_SEARCH_MAX_NUM_RESULTS,
  WEB_SEARCH_MAX_QUERY_CHARS,
  WEB_SEARCH_MAX_TEXT_CHARS,
  WEB_SEARCH_TOTAL_TEXT_CHARS,
  getExaApiKey,
  isPierrotWebSearchEnabled,
  resolveWebSearchNumResults,
  resolveWebSearchTimeoutMs,
  type WebSearchEnvironment,
} from './config';
import type { WebEvidenceSource, WebSearchResult, WebSearchUnavailableCode } from './types';

assertServerOnly('lib/knowledge/web/exaSearch');

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type SearchWebEvidenceInput = {
  query: string;
  env?: WebSearchEnvironment;
  apiKey?: string | null;
  fetchImpl?: FetchLike;
  endpoint?: string;
  timeoutMs?: number;
  numResults?: number;
  signal?: AbortSignal;
};

type NormalizedUrl = {
  url: string;
  dedupeKey: string;
  domain: string;
};

// Intentional removal of control characters from untrusted page text.
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = new RegExp('[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F\\u007F]', 'g');

function sanitizeText(value: string, maxChars: number): string {
  const normalized = value
    .replace(CONTROL_CHARS, ' ')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (normalized.length <= maxChars) return normalized;

  const slice = normalized.slice(0, Math.max(0, maxChars - 1));
  const lastSpace = slice.lastIndexOf(' ');
  const cut = lastSpace > maxChars * 0.6 ? slice.slice(0, lastSpace) : slice;

  return `${cut.trimEnd()}…`;
}

function normalizeUrl(raw: unknown): NormalizedUrl | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;

  try {
    const url = new URL(raw.trim());

    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

    url.hash = '';

    // Remove common campaign parameters so the same page is not cited twice.
    for (const key of Array.from(url.searchParams.keys())) {
      const normalizedKey = key.toLowerCase();

      if (
        normalizedKey.startsWith('utm_') ||
        ['fbclid', 'gclid', 'mc_cid', 'mc_eid', 'ref'].includes(normalizedKey)
      ) {
        url.searchParams.delete(key);
      }
    }

    const domain = url.hostname.toLowerCase().replace(/^www\./, '');
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const dedupeKey = `${domain}${path}${url.search}`;

    return { url: url.toString(), dedupeKey, domain };
  } catch {
    return null;
  }
}

function normalizePublishedDate(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function normalizeAuthor(value: unknown): string | null {
  if (typeof value !== 'string') return null;

  const author = value.replace(/\s+/g, ' ').trim();
  return author || null;
}

function unavailable(
  query: string,
  startedAt: number,
  code: WebSearchUnavailableCode
): WebSearchResult {
  return {
    outcome: 'unavailable',
    query,
    sources: [],
    latencyMs: Math.max(0, Date.now() - startedAt),
    code,
  };
}

function parseSources(
  payload: unknown,
  startIndex: number,
  maxResults: number
): WebEvidenceSource[] {
  if (!payload || typeof payload !== 'object') return [];

  const results = (payload as Record<string, unknown>).results;

  if (!Array.isArray(results)) return [];

  const sources: WebEvidenceSource[] = [];
  const seen = new Set<string>();
  let totalText = 0;

  for (const item of results) {
    if (sources.length >= maxResults) break;
    if (!item || typeof item !== 'object') continue;

    const record = item as Record<string, unknown>;
    const normalizedUrl = normalizeUrl(record.url);

    if (!normalizedUrl || seen.has(normalizedUrl.dedupeKey)) continue;

    const highlights = Array.isArray(record.highlights)
      ? record.highlights
          .filter((highlight): highlight is string => typeof highlight === 'string')
          .map((highlight) => sanitizeText(highlight, 900))
          .filter(Boolean)
          .slice(0, 6)
      : [];
    const highlightText = highlights.join(' ');
    const pageText = typeof record.text === 'string' ? record.text.trim() : '';
    const rawText = highlightText || pageText;

    if (!rawText) continue;

    const remaining = WEB_SEARCH_TOTAL_TEXT_CHARS - totalText;

    if (remaining < 200) break;

    const text = sanitizeText(rawText, Math.min(WEB_SEARCH_MAX_TEXT_CHARS, remaining));
    const title =
      typeof record.title === 'string' && record.title.trim()
        ? sanitizeText(record.title, 240)
        : normalizedUrl.domain;

    seen.add(normalizedUrl.dedupeKey);
    totalText += text.length;

    sources.push({
      index: startIndex + sources.length,
      title,
      url: normalizedUrl.url,
      domain: normalizedUrl.domain,
      publishedAt: normalizePublishedDate(record.publishedDate),
      author: normalizeAuthor(record.author),
      text,
      ...(highlights.length > 0
        ? {
            highlights: highlights.map((highlight) =>
              sanitizeText(highlight, 600)
            ),
          }
        : {}),
    });
  }

  return sources;
}

/**
 * Query Exa for a small, bounded set of sources. This function never throws:
 * an absent key, a timeout, an HTTP failure or malformed JSON all degrade to a
 * structured "unavailable" result so the normal Pierrot answer can continue.
 */
export async function searchWebEvidence(input: SearchWebEvidenceInput): Promise<WebSearchResult> {
  const startedAt = Date.now();
  const env = input.env ?? process.env;
  const rawQuery = typeof input.query === 'string' ? input.query.trim() : '';
  const query = rawQuery.replace(/\s+/g, ' ').slice(0, WEB_SEARCH_MAX_QUERY_CHARS);

  if (!isPierrotWebSearchEnabled(env)) {
    return unavailable(query, startedAt, 'disabled');
  }

  const apiKey = (input.apiKey ?? getExaApiKey(env) ?? '').trim();

  if (!apiKey) {
    return unavailable(query, startedAt, 'missing_api_key');
  }

  if (query.length < 2) {
    return unavailable(query, startedAt, 'invalid_query');
  }

  const fetchImpl = input.fetchImpl ?? (fetch as FetchLike);
  const endpoint = input.endpoint ?? EXA_SEARCH_ENDPOINT;
  const timeoutMs = input.timeoutMs ?? resolveWebSearchTimeoutMs(env);
  const numResults = Math.min(
    Math.max(Math.trunc(input.numResults ?? resolveWebSearchNumResults(env)), 1),
    WEB_SEARCH_MAX_NUM_RESULTS
  );

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  const relayAbort = () => controller.abort();

  if (input.signal) {
    if (input.signal.aborted) controller.abort();
    else input.signal.addEventListener('abort', relayAbort, { once: true });
  }

  try {
    let response: Response;

    try {
      response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({
          query,
          type: 'auto',
          numResults,
          moderation: true,
          contents: {
            // Highlights are the primary, cheaper evidence format. `text` stays
            // as a bounded compatibility fallback for pages without highlights.
            highlights: true,
            text: {
              maxCharacters: WEB_SEARCH_MAX_TEXT_CHARS,
              verbosity: 'compact',
            },
          },
        }),
        signal: controller.signal,
        cache: 'no-store',
      });
    } catch {
      return unavailable(query, startedAt, controller.signal.aborted ? 'timeout' : 'network_error');
    }

    if (!response.ok) {
      return unavailable(query, startedAt, 'http_error');
    }

    const payload = await response.json().catch(() => null);

    if (!payload || typeof payload !== 'object') {
      return unavailable(
        query,
        startedAt,
        controller.signal.aborted ? 'timeout' : 'invalid_response'
      );
    }

    const sources = parseSources(payload, 1, numResults);

    if (sources.length === 0) {
      return {
        outcome: 'no_results',
        query,
        sources: [],
        latencyMs: Math.max(0, Date.now() - startedAt),
      };
    }

    return {
      outcome: 'relevant_results',
      query,
      sources,
      latencyMs: Math.max(0, Date.now() - startedAt),
    };
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener('abort', relayAbort);
  }
}
