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

function cleanImageUrl(value: string, baseUrl: string): string {
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

function extractSrcset(srcset: string | undefined, baseUrl: string): string[] {
  if (!srcset) return [];

  return srcset
    .split(',')
    .map((part: string) => {
      const pieces = part.trim().split(/\s+/);
      return pieces[0];
    })
    .map((url: string) => cleanImageUrl(url, baseUrl))
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
    const url = cleanImageUrl(value, baseUrl);
    if (url) {
      candidates.push(url);
    }
  };

  add($('meta[property="og:image"]').attr('content'));
  add($('meta[property="og:image:url"]').attr('content'));
  add($('meta[name="twitter:image"]').attr('content'));
  add($('meta[name="twitter:image:src"]').attr('content'));

  $('script[type="application/ld+json"]').each((_index: number, element: any) => {
    const text = $(element).html();
    if (!text) return;

    try {
      const data: unknown = JSON.parse(text);

      const scan = (value: unknown): void => {
        if (!value) return;

        if (Array.isArray(value)) {
          value.forEach((item: unknown) => scan(item));
          return;
        }

        if (typeof value !== 'object' || value === null) return;

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

        if (typeof obj.image === 'object' && obj.image !== null && !Array.isArray(obj.image)) {
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
      // Ignore invalid JSON-LD
    }
  });

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

    const srcset = img.attr('srcset') || img.attr('data-srcset');
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

  const rawImageRegex = /https?:\/\/[^"'\\\s<>]+?\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'\\\s<>]*)?/gi;
  const rawMatches = html.match(rawImageRegex) || [];
  rawMatches.forEach((imageUrl: string) => add(imageUrl));

  return [...new Set(candidates)];
}

function extractChristiesImages(
  html: string,
  $: cheerio.CheerioAPI,
  baseUrl: string
): string[] {
  const candidates: string[] = [];
  const add = (value?: string | null) => {
    if (!value) return;
    const url = cleanImageUrl(value, baseUrl);
    if (url) candidates.push(url);
  };

  extractGenericImages(html, $, baseUrl).forEach((url) => candidates.push(url));

  const christiesRegex = /https?:\/\/(?:www\.)?christies\.com\/img\/LotImages\/[^"'\\\s<>]+/gi;
  (html.match(christiesRegex) || []).forEach((url) => add(url));

  const escapedRegex = /https?:\\\/\\\/(?:www\.)?christies\.com\\\/img\\\/LotImages\\\/[^"'\\\s<>]+/gi;
  (html.match(escapedRegex) || []).forEach((url) => add(url.replace(/\\\//g, '/')));

  const relativeRegex = /["'](\/img\/LotImages\/[^"']+)["']/gi;
  let match: RegExpExecArray | null;
  while ((match = relativeRegex.exec(html)) !== null) {
    add(match[1]);
  }

  return [...new Set(candidates)];
}

function scoreImageUrl(url: string, auctionHouse: string): number {
  const lower = url.toLowerCase();
  let score = 0;

  if (auctionHouse === "Christie's" && lower.includes('/img/lotimages/')) {
    score += 100;
  }
  if (auctionHouse === "Sotheby's" && (lower.includes('lot') || lower.includes('artwork'))) {
    score += 70;
  }
  if (auctionHouse === 'Phillips' && (lower.includes('lot') || lower.includes('artwork'))) {
    score += 70;
  }
  if (auctionHouse === 'Bonhams' && (lower.includes('lot') || lower.includes('image'))) {
    score += 60;
  }
  if (lower.includes('/image/') || lower.includes('/images/') || lower.includes('/img/')) {
    score += 20;
  }
  if (lower.includes('artwork') || lower.includes('/lot/') || lower.includes('lotimage')) {
    score += 30;
  }
  if (/\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(lower)) {
    score += 10;
  }
  if (lower.includes('logo') || lower.includes('favicon') || lower.includes('icon') || lower.includes('avatar')) {
    score -= 100;
  }
  if (lower.includes('thumbnail') || lower.includes('/thumb/') || lower.includes('thumb_')) {
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
) {
  let candidates: string[] = [];

  if (existingImage) {
    const cleaned = cleanImageUrl(existingImage, baseUrl);
    if (cleaned) candidates.push(cleaned);
  }

  if (auctionHouse === "Christie's") {
    candidates.push(...extractChristiesImages(html, $, baseUrl));
  } else {
    candidates.push(...extractGenericImages(html, $, baseUrl));
  }

  candidates = [...new Set(candidates.filter(Boolean))];

  const scored = candidates
    .map((url) => ({ url, score: scoreImageUrl(url, auctionHouse) }))
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
    const url = typeof body?.url === 'string' ? body.url.trim() : '';

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const auctionHouse = detectAuctionHouse(url);
    let html = '';

    // 1. ПЕРВАЯ ПОПЫТКА: Использование Jina Reader (отлично собирает контент и картинки с защищенных сайтов)
    try {
      console.log(`[Parser] Fetching via Jina Reader proxy: ${url}`);
      const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
        headers: {
          'X-Return-Format': 'markdown',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });
      if (jinaRes.ok) {
        const jinaText = await jinaRes.text();
        if (jinaText && jinaText.length > 200) {
          html = jinaText;
        }
      }
    } catch (err) {
      console.error('[Jina Reader] Error:', err);
    }

    // 2. ВТОРАЯ ПОПЫТКА: ScrapingAnt API
    const apiKey = process.env.SCRAPINGANT_API_KEY;
    if (!html && apiKey) {
      try {
        const scrapingAntUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(url)}&browser=true`;
        const saRes = await fetch(scrapingAntUrl, {
          headers: { 'x-api-key': apiKey },
        });

        const responseText = await saRes.text();
        if (responseText.trim().startsWith('<')) {
          if (!responseText.includes('Access Denied') && !responseText.includes('Cloudflare')) {
            html = responseText;
          }
        } else {
          try {
            const data: { content?: string; html?: string } = JSON.parse(responseText);
            html = data.content || data.html || '';
          } catch (parseError) {
            console.error('[ScrapingAnt] Invalid JSON:', parseError);
          }
        }
      } catch (err) {
        console.error('[ScrapingAnt] Error:', err);
      }
    }

    // 3. ТРЕТЬЯ ПОПЫТКА: Прямой Fetch с расширенными заголовками браузера
    if (!html) {
      try {
        const res = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Cache-Control': 'no-cache',
          },
        });

        if (res.ok) {
          html = await res.text();
        }
      } catch (err) {
        console.error('[Direct fetch] Error:', err);
      }
    }

    if (!html) {
      throw new Error('Failed to obtain HTML from target URL via proxy, scraper or direct fetch.');
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

    const message = error instanceof Error ? error.message : String(error);

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
