import * as cheerio from 'cheerio';
import Parser from 'rss-parser';
import {
  extractYouTubeVideoId,
  isYouTubeUrl,
  resolveYouTube,
  type YouTubeMetadata,
} from './youtube';

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
    parsedUrl = new URL(normalized);
  } catch {
    throw new Error('Invalid URL provided');
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
    const html = await res.text();
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
