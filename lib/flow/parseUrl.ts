import * as cheerio from 'cheerio';
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

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim().replace(/^<|>$/g, '');
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
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
  const favicon = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;

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
    const res = await fetch(normalized, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (compatible; FlowBot/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(6000),
    });

    if (!res.ok) {
      return {
        url: normalized,
        isYouTube: false,
        domain,
        site_name: domain,
        title: domain,
        favicon,
      };
    }

    const html = await res.text();
    const $ = cheerio.load(html);

    const getMeta = (...selectors: string[]): string | null => {
      for (const sel of selectors) {
        const val = $(sel).attr('content')?.trim();
        if (val) return val;
      }
      return null;
    };

    const title =
      getMeta('meta[property="og:title"]', 'meta[name="twitter:title"]') ||
      $('title').first().text().trim() ||
      domain;

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
        'meta[name="twitter:image"]'
      ) || null;

    if (image) {
      try {
        image = new URL(image, normalized).toString();
      } catch {
        // Keep raw image if URL resolution fails
      }
    }

    const site_name =
      getMeta('meta[property="og:site_name"]') || domain;

    return {
      url: normalized,
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
    return {
      url: normalized,
      isYouTube: false,
      domain,
      site_name: domain,
      title: domain,
      favicon,
    };
  }
}
