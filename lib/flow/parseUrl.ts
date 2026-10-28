import { isIP } from 'node:net';
import * as cheerio from 'cheerio';
import Parser from 'rss-parser';
import {
  extractYouTubeVideoId,
  isYouTubeUrl,
  resolveYouTube,
  type YouTubeMetadata,
} from './youtube';

const MAX_HTML_BYTES = 2_000_000;

/**
 * Link preview fetching is an admin-only server capability. Even so, block
 * obvious SSRF targets: loopback, private networks, link-local/metadata
 * addresses, credentials in URLs, and unusual ports.
 *
 * DNS rebinding is not fully solved here; the route is admin-only and uses a
 * short timeout. If previews ever become public, resolve DNS and pin the IP.
 */
export function assertSafePublicUrl(rawUrl: string): URL {
  const url = new URL(rawUrl);

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('Only http and https URLs are allowed.');
  }

  if (url.username || url.password) {
    throw new Error('URLs with credentials are not allowed.');
  }

  if (url.port && url.port !== '80' && url.port !== '443') {
    throw new Error('Only ports 80 and 443 are allowed.');
  }

  const hostname = url.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');

  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.home') ||
    hostname.endsWith('.lan') ||
    hostname === 'metadata.google.internal'
  ) {
    throw new Error('Local and private hosts are not allowed.');
  }

  const version = isIP(hostname);

  if (version === 4 && isPrivateIpv4(hostname)) {
    throw new Error('Private network addresses are not allowed.');
  }

  if (version === 6 && isPrivateIpv6(hostname)) {
    throw new Error('Private network addresses are not allowed.');
  }

  return url;
}

function isPrivateIpv4(hostname: string): boolean {
  const parts = hostname.split('.').map(Number);

  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part))) {
    return true;
  }

  const [first, second] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19)) ||
    first >= 224
  );
}

function isPrivateIpv6(hostname: string): boolean {
  const lower = hostname.toLowerCase();

  if (lower === '::' || lower === '::1') return true;
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true;
  if (/^fe[89ab]/.test(lower)) return true;

  // IPv4-mapped IPv6 (including hex forms such as ::ffff:7f00:1) could
  // otherwise reach loopback/private IPv4 space.
  if (lower.startsWith('::ffff:')) return true;

  return false;
}

export type ParsedUrlResult = {
  url: string;
  isYouTube: boolean;
  domain: string;
  title?: string | null;
  description?: string | null;
  image?: string | null;
  site_name?: string | null;
  favicon?: string | null;
  videoId?: string | null;
  embedUrl?: string | null;
  youtube?: YouTubeMetadata | null;
};

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const BOT_FALLBACK_UA =
  'Twitterbot/1.0';

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^<|>$/g, '');
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

function isMediumHost(host: string): boolean {
  const lower = host.toLowerCase();
  return lower === 'medium.com' || lower.endsWith('.medium.com');
}

async function fetchMediumRssFallback(urlStr: string, host: string): Promise<ParsedUrlResult | null> {
  try {
    let username: string | null = null;
    let postId: string | null = null;

    if (host === 'medium.com' || host === 'www.medium.com') {
      const matchUser = urlStr.match(/\/@([a-zA-Z0-9_.-]+)/);
      if (matchUser) username = matchUser[1];
      const matchP = urlStr.match(/\/p\/([a-f0-9]+)/i);
      if (matchP) postId = matchP[1];
    } else if (host.endsWith('.medium.com')) {
      username = host.replace(/\.medium\.com$/, '');
    }

    const matchPost = urlStr.match(/-([a-f0-9]{8,12})(?:\/|\?|$)/i);
    if (matchPost) postId = matchPost[1];

    const targetUser = username || 'merkurov';
    const feedUrl = `https://medium.com/feed/@${targetUser}`;
    const parser = new Parser();
    const feed = await parser.parseURL(feedUrl);

    if (postId && Array.isArray(feed.items)) {
      const item = feed.items.find((it) =>
        Boolean(
          (it.guid && it.guid.includes(postId!)) ||
          (it.link && it.link.includes(postId!))
        )
      );
      if (item) {
        const content = (item as any)['content:encoded'] || item.content || '';
        const imgMatch = content.match(/<img[^>]+src=["']([^"']+)["']/i);
        return {
          url: item.link || urlStr,
          isYouTube: false,
          domain: host,
          title: item.title || null,
          description: (item.contentSnippet || content.replace(/<[^>]*>/g, '')).slice(0, 300) || null,
          image: imgMatch ? imgMatch[1] : null,
          site_name: 'Medium',
          favicon: 'https://medium.com/favicon.ico',
        };
      }
    }

    if (feed.title) {
      return {
        url: urlStr,
        isYouTube: false,
        domain: host,
        title: feed.title,
        description: feed.description || null,
        site_name: 'Medium',
        favicon: 'https://medium.com/favicon.ico',
      };
    }
  } catch (err) {
    console.warn('[parseUrl] Medium RSS fallback failed:', err);
  }
  return null;
}

export async function parseUrl(rawUrl: string): Promise<ParsedUrlResult> {
  const normalized = normalizeUrl(rawUrl);
  let parsedUrl: URL;

  try {
    parsedUrl = assertSafePublicUrl(normalized);
  } catch (error) {
    throw error instanceof Error ? error : new Error('Invalid URL provided');
  }

  const domain = parsedUrl.hostname.replace(/^www\./, '');
  const isMedium = isMediumHost(parsedUrl.hostname);
  const favicon = isMedium
    ? 'https://medium.com/favicon.ico'
    : `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

  // 1. Check if it's a YouTube link
  if (isYouTubeUrl(normalized)) {
    try {
      const ytInfo = await resolveYouTube(normalized);
      if (ytInfo) {
        return {
          url: ytInfo.canonicalUrl,
          isYouTube: true,
          domain: 'youtube.com',
          title: ytInfo.metadata.title,
          description: ytInfo.metadata.author_name ? `Channel: ${ytInfo.metadata.author_name}` : null,
          image: ytInfo.metadata.thumbnail_url,
          site_name: 'YouTube',
          favicon: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=64',
          videoId: ytInfo.videoId,
          embedUrl: `https://www.youtube-nocookie.com/embed/${ytInfo.videoId}`,
          youtube: ytInfo.metadata,
        };
      }
    } catch (err) {
      console.warn('[parseUrl] YouTube resolution failed, falling back to basic extraction:', err);
    }

    const videoId = extractYouTubeVideoId(normalized);
    if (videoId) {
      const thumbnail = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
      return {
        url: `https://www.youtube.com/watch?v=${videoId}`,
        isYouTube: true,
        domain: 'youtube.com',
        title: 'YouTube Video',
        image: thumbnail,
        site_name: 'YouTube',
        favicon: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=64',
        videoId,
        embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
        youtube: {
          video_id: videoId,
          title: 'YouTube Video',
          author_name: null,
          author_url: null,
          thumbnail_url: thumbnail,
          thumbnail_width: 480,
          thumbnail_height: 360,
          provider_name: 'YouTube',
        },
      };
    }
  }

  // 2. Generic Web Link: Fetch HTML & Parse OpenGraph tags
  try {
    let res: Response | null = null;

    try {
      res = await fetch(normalized, {
        headers: {
          'User-Agent': BROWSER_UA,
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,ru;q=0.8',
        },
        signal: AbortSignal.timeout(6000),
      });
    } catch (fetchErr) {
      console.warn('[parseUrl] First fetch attempt failed:', fetchErr);
    }

    // If blocked (403, 401, 5xx) or errored, retry with social bot UA (Twitterbot is widely whitelisted)
    if (!res || !res.ok) {
      try {
        res = await fetch(normalized, {
          headers: {
            'User-Agent': BOT_FALLBACK_UA,
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          },
          signal: AbortSignal.timeout(6000),
        });
      } catch (retryErr) {
        console.warn('[parseUrl] Bot fallback fetch attempt failed:', retryErr);
      }
    }

    if (!res || !res.ok) {
      if (isMedium) {
        const rssResult = await fetchMediumRssFallback(normalized, domain);
        if (rssResult) return rssResult;
      }

      return {
        url: normalized,
        isYouTube: false,
        domain,
        site_name: isMedium ? 'Medium' : domain,
        title: isMedium ? 'Medium' : domain,
        favicon,
      };
    }

    const finalUrl = res.url || normalized;
    const declaredLength = Number(
      res.headers?.get?.('content-length') || 0,
    );

    if (declaredLength > MAX_HTML_BYTES) {
      throw new Error('Source page is too large for a link preview.');
    }

    // Guard against servers that omit or lie about Content-Length.
    const html = (await res.text()).slice(0, MAX_HTML_BYTES);
    const $ = cheerio.load(html);

    const getMeta = (...selectors: string[]): string | null => {
      for (const sel of selectors) {
        const val = $(sel).attr('content')?.trim();
        if (val) return val;
      }
      return null;
    };

    let title =
      getMeta('meta[property="og:title"]', 'meta[name="twitter:title"]') ||
      $('title').first().text().trim() ||
      domain;

    // For Medium, generic title `<title>Medium</title>` should fallback to article headline
    if (isMedium && (!title || title.trim().toLowerCase() === 'medium')) {
      const articleHeadline = $('article h1').first().text().trim() || $('h1').first().text().trim();
      if (articleHeadline) {
        title = articleHeadline;
      }
    }

    const description =
      getMeta(
        'meta[property="og:description"]',
        'meta[name="twitter:description"]',
        'meta[name="description"]'
      ) || null;

    let image =
      getMeta(
        'meta[property="og:image"]',
        'meta[property="og:image:url"]',
        'meta[name="twitter:image:src"]',
        'meta[name="twitter:image"]'
      ) || null;

    if (!image && isMedium) {
      const firstImg = $('article img').first().attr('src') || $('img').first().attr('src');
      if (firstImg) image = firstImg;
    }

    if (image) {
      try {
        image = new URL(image, finalUrl).toString();
      } catch {
        // Keep raw image if URL resolution fails
      }
    }

    const site_name =
      (isMedium ? 'Medium' : null) ||
      getMeta('meta[property="og:site_name"]') ||
      domain;

    return {
      url: finalUrl,
      isYouTube: false,
      domain,
      title,
      description,
      image,
      site_name,
      favicon,
    };
  } catch (error) {
    console.warn('[parseUrl] Fetching URL failed, returning fallback domain info:', error);

    if (isMedium) {
      const rssResult = await fetchMediumRssFallback(normalized, domain);
      if (rssResult) return rssResult;
    }

    return {
      url: normalized,
      isYouTube: false,
      domain,
      site_name: isMedium ? 'Medium' : domain,
      title: isMedium ? 'Medium' : domain,
      favicon,
    };
  }
}
