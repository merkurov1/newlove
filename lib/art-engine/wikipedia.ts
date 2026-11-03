import { assertServerOnly } from '@/lib/serverOnly';
import type { WikipediaCandidate, WikipediaState } from './types';

assertServerOnly('lib/art-engine/wikipedia');

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const WIKI_API = 'https://en.wikipedia.org/w/api.php';
const WIKI_SUMMARY = 'https://en.wikipedia.org/api/rest_v1/page/summary';
const MAX_CANDIDATES = 5;
const MAX_EXTRACT_CHARS = 4_000;

const ART_TERMS =
  /\b(artist|painter|sculptor|printmaker|photographer|draughtsman|draftsman|illustrator|architect|art|works|born|died|studio|museum|gallery|exhibition)\b/i;

const STOPWORDS = new Set([
  'the',
  'and',
  'of',
  'de',
  'del',
  'la',
  'le',
  'van',
  'von',
  'der',
  'den',
  'da',
  'di',
  'du',
  'el',
  'mr',
  'mrs',
  'ms',
  'sir',
  'dame',
  'b',
  'born',
  'died',
]);

export function normalizeArtistName(value: string): string {
  return value
    .replace(/\([^)]*\)/g, ' ')
    .replace(
      /^(attributed to|studio of|circle of|follower of|manner of|workshop of|after)\s+/i,
      '',
    )
    .replace(/[.,;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value: string): string[] {
  return normalizeArtistName(value)
    .toLowerCase()
    .split(/[^a-z0-9à-ÿ]+/i)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length > 1 &&
        !STOPWORDS.has(token) &&
        !/^(18|19|20)\d{2}$/.test(token),
    );
}

function normalizeForMatch(value: string): string {
  return normalizeArtistName(value).toLowerCase().replace(/[^a-z0-9à-ÿ]+/g, ' ');
}

function scoreCandidate(
  artistName: string,
  candidate: {
    title: string;
    description?: string | null;
    extract?: string | null;
  },
): number {
  const artist = normalizeForMatch(artistName);
  const title = normalizeForMatch(candidate.title);
  const description = normalizeForMatch(candidate.description || '');
  const extract = normalizeForMatch(candidate.extract || '');
  const artistTokens = tokens(artistName);

  if (!artist || !title || artistTokens.length === 0) return 0;

  if (title === artist) return 1;
  if (title.includes(artist)) return 0.95;

  const titleHasAll = artistTokens.every((token) => title.includes(token));
  if (titleHasAll) return 0.85;

  const text = `${description} ${extract}`;
  const textHasAll = artistTokens.every((token) => text.includes(token));
  const surname = artistTokens[artistTokens.length - 1];
  const titleHasSurname = title.includes(surname);
  const artContext = ART_TERMS.test(`${candidate.description || ''} ${candidate.extract || ''}`);

  if (textHasAll && artContext) return 0.72;
  if (titleHasSurname && artContext) return 0.6;
  if (textHasAll) return 0.5;

  return 0;
}

function isDisambiguation(input: {
  title?: string | null;
  description?: string | null;
  type?: string | null;
  extract?: string | null;
}): boolean {
  const title = String(input.title || '');
  const description = String(input.description || '');
  const extract = String(input.extract || '');
  const type = String(input.type || '');

  return (
    /disambiguation/i.test(title) ||
    /disambiguation/i.test(description) ||
    /disambiguation page/i.test(extract) ||
    /may refer to/i.test(extract) ||
    type === 'disambiguation'
  );
}

async function fetchJson(
  url: string,
  fetchImpl: FetchLike,
  signal: AbortSignal,
): Promise<any> {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'MerkurovArtEngine/1.0 (art editorial research)',
    },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`Wikipedia returned HTTP ${response.status}.`);
  }

  return response.json();
}

export async function findWikipediaArticle(
  artistName: string,
  options: {
    fetchImpl?: FetchLike;
    timeoutMs?: number;
  } = {},
): Promise<WikipediaState> {
  const artist = normalizeArtistName(artistName);
  const retrievedAt = new Date().toISOString();

  if (!artist) {
    return {
      status: 'skipped',
      artist: '',
      warnings: ['Artist name is missing; Wikipedia lookup was skipped.'],
      retrieved_at: retrievedAt,
      candidates: [],
    };
  }

  const fetchImpl = options.fetchImpl || fetch;
  const timeoutMs = Math.max(1_000, Math.min(options.timeoutMs ?? 8_000, 15_000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const searchUrl = new URL(WIKI_API);
    searchUrl.searchParams.set('action', 'query');
    searchUrl.searchParams.set('list', 'search');
    searchUrl.searchParams.set('srsearch', artist);
    searchUrl.searchParams.set('srlimit', String(MAX_CANDIDATES));
    searchUrl.searchParams.set('format', 'json');
    searchUrl.searchParams.set('formatversion', '2');
    searchUrl.searchParams.set('origin', '*');

    const search = await fetchJson(searchUrl.toString(), fetchImpl, controller.signal);
    const results: any[] = Array.isArray(search?.query?.search)
      ? search.query.search
      : [];

    if (results.length === 0) {
      return {
        status: 'not_found',
        artist,
        query: artist,
        retrieved_at: retrievedAt,
        candidates: [],
        warnings: ['No English Wikipedia article was found for this artist.'],
      };
    }

    const candidates: WikipediaCandidate[] = [];
    const found: Array<WikipediaCandidate & { extract: string; type: string }> = [];

    for (const result of results.slice(0, MAX_CANDIDATES)) {
      const title = String(result?.title || '').trim();
      if (!title) continue;

      try {
        const summaryUrl = `${WIKI_SUMMARY}/${encodeURIComponent(title)}`;
        const summary = await fetchJson(
          summaryUrl,
          fetchImpl,
          controller.signal,
        );

        const candidateTitle = String(summary?.title || title);
        const description =
          typeof summary?.description === 'string'
            ? summary.description
            : null;
        const extract =
          typeof summary?.extract === 'string'
            ? summary.extract.slice(0, MAX_EXTRACT_CHARS)
            : null;
        const type = String(summary?.type || '');

        if (isDisambiguation({ title: candidateTitle, description, type, extract })) {
          continue;
        }

        const score = scoreCandidate(artist, {
          title: candidateTitle,
          description,
          extract,
        });

        const candidate: WikipediaCandidate = {
          title: candidateTitle,
          url: summary?.content_urls?.desktop?.page || null,
          description,
          score,
        };

        candidates.push(candidate);

        if (score >= 0.7 && extract) {
          found.push({ ...candidate, extract, type });
        }
      } catch {
        // A single failed summary must not discard the other candidates.
      }
    }

    candidates.sort((left, right) => right.score - left.score);

    const best = found.sort((left, right) => right.score - left.score)[0];

    if (best) {
      return {
        status: 'found',
        artist,
        query: artist,
        title: best.title,
        url: best.url,
        language: 'en',
        extract: best.extract,
        description: best.description,
        retrieved_at: retrievedAt,
        match_score: best.score,
        candidates: candidates.slice(0, MAX_CANDIDATES),
        warnings: [],
      };
    }

    if (candidates.some((candidate) => candidate.score >= 0.45)) {
      return {
        status: 'ambiguous',
        artist,
        query: artist,
        retrieved_at: retrievedAt,
        candidates: candidates.slice(0, MAX_CANDIDATES),
        warnings: [
          'The Wikipedia result is ambiguous. No biography was attached automatically.',
        ],
      };
    }

    return {
      status: 'not_found',
      artist,
      query: artist,
      retrieved_at: retrievedAt,
      candidates: candidates.slice(0, MAX_CANDIDATES),
      warnings: ['No confident Wikipedia match was found for this artist.'],
    };
  } catch (error) {
    return {
      status: 'unavailable',
      artist,
      query: artist,
      retrieved_at: retrievedAt,
      candidates: [],
      warnings: [
        error instanceof Error
          ? `Wikipedia lookup failed: ${error.message}`
          : 'Wikipedia lookup failed.',
      ],
    };
  } finally {
    clearTimeout(timer);
  }
}
