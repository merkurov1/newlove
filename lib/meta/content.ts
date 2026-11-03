/**
 * Pure content adaptation for the Meta channels.
 *
 * The original Flow item is never modified. Facebook gets the full text and
 * keeps the canonical Flow link; Threads gets a natural, short version with
 * the same mandatory link. No hashtags, emoji or marketing copy are added.
 */

import { graphemes, graphemeLength, isTechnicalText, type FlowContent } from '@/lib/flow/content';

export const THREADS_TEXT_LIMIT = 500;
export const FACEBOOK_MESSAGE_LIMIT = 60000;

export type FacebookPostContent = {
  message: string;
  link: string | null;
  imageUrl: string | null;
};

export type ThreadsPostContent = {
  text: string;
  imageUrl: string | null;
};

function clean(value: string | null | undefined): string {
  return (value ?? '').replace(/\r\n/g, '\n').trim();
}

function firstImageUrl(content: FlowContent): string | null {
  const image = content.images.find((entry) => Boolean(entry.url));
  return image?.url ?? null;
}

function titleForChannel(content: FlowContent): string | null {
  const title = clean(content.title);
  if (!title || !content.showTitle || isTechnicalText(title)) return null;
  return title;
}

function bodyForChannel(content: FlowContent): string {
  return clean(content.bodyText) || clean(content.description);
}

/**
 * Facebook Page post. Text posts use the `link` parameter so the canonical
 * Flow URL becomes a proper link card. Photo posts have no link parameter, so
 * the URL is appended to the caption instead — it is never dropped.
 */
export function composeFacebookPost(content: FlowContent): FacebookPostContent {
  const title = titleForChannel(content);
  const body = bodyForChannel(content);
  const link = content.canonicalUrl;
  const imageUrl = firstImageUrl(content);

  const parts = [title, body].filter(Boolean);
  let message = parts.join('\n\n');

  if (!message) {
    message = content.description;
  }

  if (imageUrl) {
    message = `${message}${message ? '\n\n' : ''}${link}`;
  }

  return {
    message: message.slice(0, FACEBOOK_MESSAGE_LIMIT),
    link: imageUrl ? null : link,
    imageUrl,
  };
}

function truncateAtNaturalBoundary(value: string, max: number): string {
  if (max <= 0) return '';
  if (graphemeLength(value) <= max) return value.trim();

  const parts = graphemes(value);
  const candidate = parts.slice(0, Math.max(1, max - 1)).join('');
  const minimum = Math.floor(max * 0.55);

  const sentence = Math.max(
    candidate.lastIndexOf('. '),
    candidate.lastIndexOf('! '),
    candidate.lastIndexOf('? '),
    candidate.lastIndexOf('… '),
    candidate.lastIndexOf('\n')
  );

  if (sentence >= minimum) {
    return `${candidate.slice(0, sentence + 1).trimEnd()}…`;
  }

  const space = candidate.lastIndexOf(' ');
  if (space >= minimum) {
    return `${candidate.slice(0, space).trimEnd()}…`;
  }

  return `${candidate.trimEnd()}…`;
}

/**
 * Threads post. The link is mandatory and is appended after truncation, so a
 * long body can never cut it off. This intentionally does not split a post
 * into a thread: a single short post matches the Flow voice and avoids
 * partial publications if the second request fails.
 */
export function composeThreadsPost(content: FlowContent): ThreadsPostContent {
  const url = content.canonicalUrl;
  const separator = '\n\n';
  const title = titleForChannel(content);
  const body = bodyForChannel(content);

  const combined = [title, body].filter(Boolean).join(separator);
  const available = Math.max(
    60,
    THREADS_TEXT_LIMIT - graphemeLength(url) - graphemeLength(separator)
  );

  let text = combined;

  if (graphemeLength(text) > available) {
    text = truncateAtNaturalBoundary(text, available);
  }

  if (!text.trim()) {
    text = content.language === 'ru' ? 'Новая публикация в Flow.' : 'A new publication on Flow.';
  }

  // A body that already contains the canonical URL must not duplicate it.
  if (text.includes(url)) {
    text = text.replace(url, '').trim();
  }

  return {
    text: `${text}${separator}${url}`.trim(),
    imageUrl: firstImageUrl(content),
  };
}
