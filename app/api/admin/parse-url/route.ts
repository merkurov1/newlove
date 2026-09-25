import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { parseLotHtml } from '@/lib/lots/parse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function detectAuctionHouse(url: string): string {
  const lUrl = url.toLowerCase();

  if (lUrl.includes('sothebys.com')) return "Sotheby's";
  if (lUrl.includes('christies.com')) return "Christie's";
  if (lUrl.includes('phillips.com')) return 'Phillips';
  if (lUrl.includes('bonhams.com')) return 'Bonhams';

  return 'Auction House';
}

function absoluteUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return '';
  }
}

function cleanImageUrl(
  value: string,
  baseUrl: string
): string {
  if (!value) return '';

  let url = value.trim();

  url = url
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\\u002F/g, '/');

  url = url.replace(/^["']|["']$/g, '');

  return absoluteUrl(url, baseUrl);
}

function extractSrcset(
  srcset: string | undefined,
  baseUrl: string
): string[] {
  if (!srcset) return [];

  return srcset
    .split(',')
    .map((part: string) => {
      const pieces = part.trim().split(/\s+/);
      return pieces[0];
    })
    .map((url: string) =>
      cleanImageUrl(url, baseUrl)
    )
    .filter((url: string) => Boolean(url));
}

function extractGenericImages(
  html: string,
  $: cheerio.CheerioAPI,
  baseUrl: string
): string[] {
  const candidates: string[] = [];

  const add = (value?: string | null): void => {
    if (!value) return;

    const url = cleanImageUrl(
      value,
      baseUrl
    );

    if (url) {
      candidates.push(url);
    }
  };

  add($('meta[property="og:image"]').attr('content'));
  add($('meta[property="og:image:url"]').attr('content'));
  add($('meta[name="twitter:image"]').attr('content'));
  add($('meta[name="twitter:image:src"]').attr('content'));

  $('script[type="application/ld+json"]').each(
    (_index: number, element: any) => {
      const text = $(element).html();

      if (!text) return;

      try {
        const data: unknown = JSON.parse(text);

        const scan = (value: unknown): void => {
          if (!value) return;

          if (Array.isArray(value)) {
            value.forEach((item: unknown) => {
              scan(item);
            });
            return;
          }

          if (typeof value !== 'object' || value === null) {
            return;
          }

          const obj = value as Record<string, unknown>;

          if (typeof obj.image === 'string') {
            add(obj.image);
          }

          if (Array.isArray(obj.image)) {
            obj.image.forEach((image: unknown) => {
              if (typeof image === 'string') {
                add(image);
              } else if (typeof image === 'object' && image !== null) {
                const imageObj = image as Record<string, unknown>;
                if (typeof imageObj.url === 'string') {
                  add(imageObj.url);
                }
              }
            });
          }

          if (
            typeof obj.image === 'object' &&
            obj.image !== null &&
            !Array.isArray(obj.image)
          ) {
            const imageObj = obj.image as Record<string, unknown>;
            if (typeof imageObj.url === 'string') {
              add(imageObj.url);
            }
          }

          Object.values(obj).forEach((child: unknown) => {
            scan(child);
          });
        };

        scan(data);
      } catch {
        // Invalid JSON-LD — ignore.
      }
    }
  );

  $('img').each((_index: number, element: any) => {
    const img = $(element);

    add(img.attr('src'));
    add(img.attr('data-src'));
    add(img.attr('data-original'));
    add(img.attr('data-lazy-src'));
    add(img.attr('data-image'));
    add(img.attr('data-image-url'));
    add(img.attr('data-img'));
    add(img.attr('data-fallback-src'));

    const srcset =
      img.attr('srcset') ||
      img.attr('data-srcset');

    extractSrcset(srcset, baseUrl).forEach((imageUrl: string) => {
      candidates.push(imageUrl);
    });
  });

  $('[style*="background-image"]').each((_index: number, element: any) => {
    const style = $(element).attr('style') || '';
    const regex = /url\(\s*["']?([^"')]+)["']?\s*\)/gi;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(style)) !== null) {
      add(match[1]);
    }
  });

  const rawImageRegex =
    /https?:\/\/[^"'\\\s<>]+?\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'\\\s<>]*)?/gi;

  const rawMatches = html.match(rawImageRegex) || [];

  rawMatches.forEach((imageUrl: string) => {
    add(imageUrl);
  });

  return [...new Set(candidates)];
}

function extractChristiesImages(
  html: string,
  $: cheerio.CheerioAPI,
  baseUrl: string
): string[] {
  const candidates: string[] = [];

  const add = (value?: string | null): void => {
    if (!value) return;

    const url = cleanImageUrl(value, baseUrl);

    if (url) {
      candidates.push(url);
    }
  };

  extractGenericImages(html, $, baseUrl).forEach((url: string) => {
    candidates.push(url);
  });

  const christiesRegex =
    /https?:\/\/(?:www\.)?christies\.com\/img\/LotImages\/[^"'\\\s<>]+/gi;

  const christiesMatches = html.match(christiesRegex) || [];

  christiesMatches.forEach((url: string) => {
    add(url);
  });

  const escapedRegex =
    /https?:\\\/\\\/(?:www\.)?christies\.com\\\/img\\\/LotImages\\\/[^"'\\\s<>]+/gi;

  const escapedMatches = html.match(escapedRegex) || [];

  escapedMatches.forEach((url: string) => {
    add(url.replace(/\\\//g, '/'));
  });

  const relativeRegex = /["'](\/img\/LotImages\/[^"']+)["']/gi;
  let match: RegExpExecArray | null;

  while ((match = relativeRegex.exec(html)) !== null) {
    add(match[1]);
  }

  return [...new Set(candidates)];
}

function scoreImageUrl(
  url: string,
  auctionHouse: string
): number {
  const lower = url.toLowerCase();
  let score = 0;

  if (
    auctionHouse === "Christie's" &&
    lower.includes('/img/lotimages/')
  ) {
    score += 100;
  }

  if (
    auctionHouse === "Sotheby's" &&
    (lower.includes('lot') || lower.includes('artwork'))
  ) {
    score += 70;
  }

  if (
    auctionHouse === 'Phillips' &&
    (lower.includes('lot') || lower.includes('artwork'))
  ) {
    score += 70;
  }

  if (
    auctionHouse === 'Bonhams' &&
    (lower.includes('lot') || lower.includes('image'))
  ) {
    score += 60;
  }

  if (
    lower.includes('/image/') ||
    lower.includes('/images/') ||
    lower.includes('/img/')
  ) {
    score += 20;
  }

  if (
    lower.includes('artwork') ||
    lower.includes('/lot/') ||
    lower.includes('lotimage')
  ) {
    score += 30;
  }

  if (/\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(lower)) {
    score += 10;
  }

  if (
    lower.includes('logo') ||
    lower.includes('favicon') ||
    lower.includes('icon') ||
    lower.includes('avatar')
  ) {
    score -= 100;
  }

  if (
    lower.includes('thumbnail') ||
    lower.includes('/thumb/') ||
    lower.includes('thumb_')
  ) {
    score -= 40;
  }

  if (lower.includes('small') || lower.includes('tiny')) {
    score -= 20;
  }

  if (lower.includes('pixel') || lower.includes('tracking')) {
    score -= 100;
  }

  return score;
}

function extractBestImage(
  html: string,
  $: cheerio.CheerioAPI,
  baseUrl: string,
  auctionHouse: string,
  existingImage?: string
): {
  best: string;
  candidates: Array<{
    url: string;
    score: number;
  }>;
} {
  let candidates: string[] = [];

  if (existingImage) {
    const cleaned = cleanImageUrl(existingImage, baseUrl);
    if (cleaned) {
      candidates.push(cleaned);
    }
  }

  if (auctionHouse === "Christie's") {
    candidates.push(...extractChristiesImages(html, $, baseUrl));
  } else {
    candidates.push(...extractGenericImages(html, $, baseUrl));
  }

  candidates = [
    ...new Set(candidates.filter((url: string) => Boolean(url))),
  ];

  const scored = candidates
    .map((url: string) => ({
      url,
      score: scoreImageUrl(url, auctionHouse),
    }))
    .sort((a, b) => b.score - a.score);

  return {
    best: scored[0]?.url || '',
    candidates: scored,
  };
}

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);

    const body = await req.json();
    const url =
      typeof body?.url === 'string' ? body.url.trim() : '';

    if (!url) {
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    const auctionHouse = detectAuctionHouse(url);
    const apiKey = process.env.SCRAPINGANT_API_KEY;
    let html = '';

    if (apiKey) {
      try {
        const scrapingAntUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(
          url
        )}&browser=true`;

        const saRes = await fetch(scrapingAntUrl, {
          headers: { 'x-api-key': apiKey },
        });

        const responseText = await saRes.text();

        if (responseText.trim().startsWith('<')) {
          if (
            responseText.includes('Access Denied') ||
            responseText.includes('Cloudflare')
          ) {
            console.error('[ScrapingAnt] Blocked or returned error page');
          } else {
            html = responseText;
          }
        } else {
          try {
            const data: { content?: string; html?: string } =
              JSON.parse(responseText);
            html = data.content || data.html || '';
          } catch (parseError) {
            console.error('[ScrapingAnt] Invalid JSON response:', parseError);
          }
        }
      } catch (err) {
        console.error('[ScrapingAnt] Fetch error:', err);
      }
    }

    if (!html) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
            Accept:
              'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });

        if (res.ok) {
          html = await res.text();
        } else {
          console.error(`[Direct fetch] HTTP ${res.status}`);
        }
      } catch (err) {
        console.error('[Direct fetch] Error:', err);
      }
    }

    if (!html) {
      throw new Error('Failed to obtain HTML from target URL or scraper.');
    }

    const $ = cheerio.load(html);

    const structured = parseLotHtml(html, url, auctionHouse, {
      debug: true,
    });

    const imageResult = extractBestImage(
      html,
      $,
      url,
      auctionHouse,
      structured.imageUrl ?? undefined
    );

    const foundImage = imageResult.best;
    structured.imageUrl = foundImage;

    return NextResponse.json({
      title: structured.title || $('title').text() || '',
      artist: structured.artist || '',
      image_url: foundImage,
      auction_house: auctionHouse,
      extracted: {
        ...structured,
        auctionHouse,
      },
      image_candidates: imageResult.candidates.slice(0, 20),
      url,
    });
  } catch (error: unknown) {
    console.error('[parse-url Error]:', error);

    const message =
      error instanceof Error ? error.message : String(error);

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
