import { assertServerOnly } from '@/lib/serverOnly';
import { BskyAgent } from '@atproto/api';

assertServerOnly('lib/analytics/website/providers/bluesky');

export type BlueskyPostObservation = {
  uri: string;
  cid: string | null;
  text: string;
  createdAt: string | null;
  indexedAt: string | null;
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  links: number;
  siteLinks: number;
  outboundLinks: string[];
  url: string | null;
};

export type BlueskyProfileObservation = {
  did: string | null;
  handle: string | null;
  displayName: string | null;
  followers: number | null;
  follows: number | null;
  posts: number | null;
};

export type BlueskyAnalyticsResult = {
  profile: BlueskyProfileObservation;
  posts: BlueskyPostObservation[];
  pages: number;
  truncated: boolean;
  rawProfile: unknown;
};

const SITE_HOST = /(^|\.)merkurov\.love$/i;

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractLinks(record: Record<string, unknown>, embed: Record<string, unknown> | null): string[] {
  const links = new Set<string>();
  const facets = Array.isArray(record.facets) ? record.facets : [];

  for (const facet of facets) {
    if (!facet || typeof facet !== 'object') continue;
    const features = Array.isArray((facet as { features?: unknown }).features)
      ? ((facet as { features?: unknown[] }).features ?? [])
      : [];
    for (const feature of features) {
      if (!feature || typeof feature !== 'object') continue;
      const value = feature as { $type?: unknown; uri?: unknown };
      if (
        value.$type === 'app.bsky.richtext.facet#link' &&
        typeof value.uri === 'string' &&
        /^https?:\/\//i.test(value.uri)
      ) {
        links.add(value.uri);
      }
    }
  }

  if (embed && typeof embed === 'object') {
    const external = (embed as { external?: { uri?: unknown } }).external;
    if (external && typeof external.uri === 'string' && /^https?:\/\//i.test(external.uri)) {
      links.add(external.uri);
    }
  }

  return [...links];
}

/**
 * Author feeds can contain reposts of other people's posts. Those counters
 * belong to another account and must never be folded into the owner's totals.
 */
export function blueskyFeedItemAuthorDid(entry: unknown): string | null {
  if (!entry || typeof entry !== 'object') return null;
  const post = (entry as { post?: { author?: { did?: unknown } } }).post;
  return typeof post?.author?.did === 'string' ? post.author.did : null;
}

export function isOwnBlueskyFeedItem(entry: unknown, actorDid: string | null): boolean {
  if (!actorDid) return true;
  const authorDid = blueskyFeedItemAuthorDid(entry);
  return authorDid === null || authorDid === actorDid;
}

export function normalizeBlueskyPost(entry: unknown): BlueskyPostObservation | null {
  if (!entry || typeof entry !== 'object') return null;
  const item = entry as {
    post?: {
      uri?: unknown;
      cid?: unknown;
      record?: Record<string, unknown>;
      indexedAt?: unknown;
      likeCount?: unknown;
      repostCount?: unknown;
      replyCount?: unknown;
      quoteCount?: unknown;
      embed?: Record<string, unknown> | null;
    };
  };
  const post = item.post;
  if (!post || typeof post.uri !== 'string') return null;

  const record = post.record && typeof post.record === 'object' ? post.record : {};
  const text = typeof record.text === 'string' ? record.text : '';
  const createdAt = typeof record.createdAt === 'string' ? record.createdAt : null;
  const links = extractLinks(record, post.embed ?? null);
  const siteLinks = links.filter((link) => {
    try {
      return SITE_HOST.test(new URL(link).hostname);
    } catch {
      return false;
    }
  });

  return {
    uri: post.uri,
    cid: typeof post.cid === 'string' ? post.cid : null,
    text,
    createdAt,
    indexedAt: typeof post.indexedAt === 'string' ? post.indexedAt : null,
    likes: numberOrNull(post.likeCount) ?? 0,
    reposts: numberOrNull(post.repostCount) ?? 0,
    replies: numberOrNull(post.replyCount) ?? 0,
    quotes: numberOrNull(post.quoteCount) ?? 0,
    links: links.length,
    siteLinks: siteLinks.length,
    outboundLinks: links.slice(0, 20),
    url: siteLinks[0] ?? null,
  };
}

export function postPermalink(handle: string | null, uri: string): string | null {
  if (!handle) return null;
  const match = uri.match(/\/app\.bsky\.feed\.post\/([^/]+)$/);
  return match ? `https://bsky.app/profile/${handle}/post/${match[1]}` : null;
}

/**
 * Fetches the public profile and the author's recent posts. It is read-only:
 * no post, like or follow is created. Pagination is bounded so a sync cannot
 * loop indefinitely.
 */
export async function fetchBlueskyAnalytics(input: {
  identifier: string;
  password: string;
  maxPages?: number;
}): Promise<BlueskyAnalyticsResult> {
  const agent = new BskyAgent({ service: 'https://bsky.social' });
  await agent.login({ identifier: input.identifier, password: input.password });

  const profileResponse = await agent.getProfile({ actor: input.identifier });
  const profile = profileResponse.data as {
    did?: string;
    handle?: string;
    displayName?: string;
    followersCount?: number;
    followsCount?: number;
    postsCount?: number;
  };

  const posts: BlueskyPostObservation[] = [];
  const seen = new Set<string>();
  const maxPages = Math.min(Math.max(input.maxPages ?? 10, 1), 20);
  let cursor: string | undefined;
  let pages = 0;

  while (pages < maxPages) {
    const feed = await agent.getAuthorFeed({
      actor: input.identifier,
      limit: 100,
      ...(cursor ? { cursor } : {}),
    });

    pages += 1;
    const items = Array.isArray(feed.data.feed) ? feed.data.feed : [];

    for (const item of items) {
      // A repost of another account is not the owner's post. Keep only items
      // authored by the profile being measured.
      if (!isOwnBlueskyFeedItem(item, profile.did ?? null)) continue;

      const normalized = normalizeBlueskyPost(item);
      if (!normalized || seen.has(normalized.uri)) continue;
      seen.add(normalized.uri);
      posts.push(normalized);
    }

    cursor = feed.data.cursor;
    if (!cursor || items.length === 0) break;
  }

  return {
    profile: {
      did: profile.did ?? null,
      handle: profile.handle ?? null,
      displayName: profile.displayName ?? null,
      followers: numberOrNull(profile.followersCount),
      follows: numberOrNull(profile.followsCount),
      posts: numberOrNull(profile.postsCount),
    },
    posts,
    pages,
    truncated: Boolean(cursor) && pages >= maxPages,
    rawProfile: profileResponse.data,
  };
}
