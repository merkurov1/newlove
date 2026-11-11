/**
 * Pure Bluesky post composition.
 *
 * Policy: one short, meaningful post plus the canonical Flow URL. Long
 * material is summarized; Bluesky never publishes a thread. All length
 * calculations use graphemes, and the Flow URL is appended after trimming so
 * it can never be cut at the limit.
 */

import {
  graphemeLength,
  graphemes,
  isTechnicalText,
  truncateGraphemes,
  type FlowContent,
} from './content';

export const BLUESKY_MAX_GRAPHEMES = 300;
export const BLUESKY_SUMMARY_MAX_GRAPHEMES = 180;
/** Above this length the public slug URL is swapped for the short Flow URL. */
export const BLUESKY_CANONICAL_URL_MAX_GRAPHEMES = 120;

export type BlueskyPostInput = {
  title: string | null;
  bodyText: string;
  language: 'ru' | 'en';
  flowUrl: string;
  summary?: string | null;
  maxGraphemes?: number;
};

export type BlueskyPost = {
  text: string;
  body: string;
  usedSummary: boolean;
  truncated: boolean;
};

const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Bluesky counts the whole post, including the link, against 300 graphemes.
 * Percent-encoded Cyrillic slugs can consume most of that budget. Keep short
 * canonical URLs, but use the stable `/flow/i/<id>` redirect for long ones.
 */
export function resolveBlueskyShareUrl(input: {
  canonicalUrl: string;
  id?: string | null;
  maxCanonicalGraphemes?: number;
}): string {
  const canonical = input.canonicalUrl.trim();
  const max = input.maxCanonicalGraphemes ?? BLUESKY_CANONICAL_URL_MAX_GRAPHEMES;

  if (!canonical || graphemeLength(canonical) <= max) return canonical;

  const id = input.id?.trim() || '';
  if (!UUID_PATTERN.test(id)) return canonical;

  try {
    const origin = new URL(canonical).origin;
    return `${origin}/flow/i/${id}`;
  } catch {
    return canonical;
  }
}

export function stripBlueskyUrls(value: string): string {
  return value.replace(URL_PATTERN, ' ').replace(/\s+/g, ' ').trim();
}

function stripUrls(value: string): string {
  return stripBlueskyUrls(value);
}

function neutralDescription(language: 'ru' | 'en'): string {
  return language === 'ru'
    ? 'Новая публикация в Flow Антона Меркурова.'
    : 'A new publication on Anton Merkurov’s Flow.';
}

export function truncateAtWord(value: string, max: number): string {
  if (graphemeLength(value) <= max) return value.trim();

  const parts = graphemes(value).slice(0, Math.max(1, max - 1));
  const candidate = parts.join('');
  const lastSpace = candidate.lastIndexOf(' ');
  const sentenceEnd = Math.max(
    candidate.lastIndexOf('. '),
    candidate.lastIndexOf('! '),
    candidate.lastIndexOf('? '),
    candidate.lastIndexOf('… ')
  );

  if (sentenceEnd >= Math.floor(max * 0.55)) {
    return `${candidate.slice(0, sentenceEnd + 1).trimEnd()}…`;
  }

  if (lastSpace >= Math.floor(max * 0.55)) {
    return `${candidate.slice(0, lastSpace).trimEnd()}…`;
  }

  return `${candidate.trimEnd()}…`;
}

/**
 * Safe local fallback: keep the opening thought rather than an arbitrary
 * character slice. It is only used when the summary provider is unavailable.
 */
export function fallbackBlueskySummary(
  value: string,
  max = BLUESKY_SUMMARY_MAX_GRAPHEMES
): string {
  const clean = stripUrls(value.replace(/\s+/g, ' ').trim());
  if (!clean) return '';

  const sentences =
    clean.match(/[^.!?…]+[.!?…]+(?:["'»”)]*)?/g)?.map((part) => part.trim()) ??
    [];

  let result = '';

  for (const sentence of sentences) {
    const candidate = result ? `${result} ${sentence}` : sentence;

    if (graphemeLength(candidate) > max) break;
    result = candidate;

    if (graphemeLength(result) >= Math.floor(max * 0.65)) break;
  }

  if (!result) result = clean;

  return truncateAtWord(result, max);
}

export function buildBlueskySummaryPrompt(
  content: Pick<FlowContent, 'title' | 'bodyText' | 'description' | 'language' | 'sourceUrl'>,
  max = BLUESKY_SUMMARY_MAX_GRAPHEMES
): string {
  const title = isTechnicalText(content.title) ? '' : content.title;
  const body = truncateGraphemes(content.bodyText, 3500);

  return `Write one concise Bluesky post in ${
    content.language === 'ru' ? 'Russian' : 'English'
  }.

TASK:
- Express the main point or argument of the material in 1–2 sentences.
- Maximum ${max} characters.
- Preserve the author's meaning and tone.
- Do not repeat the title verbatim and do not copy the opening sentence.
- Do not invent facts, quotes, dates, or descriptions of images/video.
- Do not add hashtags, emojis, calls to action, or a URL.
- No introductory phrases. Return only the post text.

MATERIAL:
TITLE: ${title || '(none)'}
DESCRIPTION: ${content.description || '(none)'}
TEXT: ${body || '(none)'}
SOURCE: ${content.sourceUrl || '(none)'}`;
}

/**
 * Compose the final Bluesky text. The Flow URL is mandatory and is appended
 * after all trimming.
 */
export function composeBlueskyPost(input: BlueskyPostInput): BlueskyPost {
  const max = input.maxGraphemes ?? BLUESKY_MAX_GRAPHEMES;
  const url = input.flowUrl.trim();
  const separator = '\n\n';
  // Never reserve a minimum body budget when the URL itself is long: that
  // could push the complete post over Bluesky's 300-grapheme limit.
  const available = Math.max(0, max - graphemeLength(url) - graphemeLength(separator));

  if (available === 0) {
    return {
      text: url,
      body: '',
      usedSummary: false,
      truncated: true,
    };
  }

  const cleanTitle =
    input.title && !isTechnicalText(input.title) ? input.title.trim() : '';
  const shortBody = input.bodyText.replace(/\s+/g, ' ').trim();
  const shortCombined = [cleanTitle, shortBody].filter(Boolean).join('\n\n');

  let body = '';
  let usedSummary = false;

  if (input.summary?.trim()) {
    body = stripUrls(input.summary);
    usedSummary = true;
  } else if (graphemeLength(shortCombined) <= available) {
    body = shortCombined;
  } else {
    body = fallbackBlueskySummary(shortBody || cleanTitle, available);
  }

  if (!body) body = neutralDescription(input.language);
  if (body.includes(url)) body = body.replace(url, '').trim();

  const originalLength = graphemeLength(body);
  body = truncateAtWord(body, available);
  const text = `${body}${separator}${url}`;

  return {
    text,
    body,
    usedSummary,
    truncated: originalLength > graphemeLength(body),
  };
}

/**
 * Build a short fallback post from already-normalized content, used by tests
 * and by callers that do not need the async summary provider.
 */
export function composeBlueskyPostFromContent(
  content: FlowContent,
  summary?: string | null
): BlueskyPost {
  return composeBlueskyPost({
    title: content.showTitle ? content.title : null,
    bodyText: content.bodyText,
    language: content.language,
    flowUrl: content.canonicalUrl,
    summary,
  });
}
