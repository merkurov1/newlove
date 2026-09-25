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
): Array<{ url: string; source: string }> {
  const candidates: Array<{ url: string; source: string }> = [];

  const add = (value?: string | null, source: string = 'img'): void => {
    if (!value) return;
    const url = cleanImageUrl(value, baseUrl);
    if (url) {
      candidates.push({ url, source });
    }
  };

  // Мета-теги имеют наивысший приоритет, так как это официальное превью страницы лота
  add($('meta[property="og:image"]').attr('content'), 'og:image');
  add($('meta[property="og:image:url"]').attr('content'), 'og:image');
  add($('meta[name="twitter:image"]').attr('content'), 'twitter:image');
  add($('meta[name="twitter:image:src"]').attr('content'), 'twitter:image');

  // JSON-LD структурированные данные
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
          add(obj.image, 'json-ld');
        }

        if (Array.isArray(obj.image)) {
          obj.image.forEach((image: unknown) => {
            if (typeof image === 'string') {
              add(image, 'json-ld');
            } else if (typeof image === 'object' && image !== null) {
              const imageObj = image as Record<string, unknown>;
              if (typeof imageObj.url === 'string') {
                add(imageObj.url, 'json-ld');
              }
            }
          });
        }

        if (typeof obj.image === 'object' && obj.image !== null && !Array.isArray(obj.image)) {
          const imageObj = obj.image as Record<string, unknown>;
          if (typeof imageObj.url === 'string') {
            add(imageObj.url, 'json-ld');
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

  // Основные теги изображения товара (часто имеют специфичные классы или атрибуты)
  $('img').each((_index: number, element: any) => {
    const img = $(element);
    const className = (img.attr('class') || '').toLowerCase();
    const idName = (img.attr('id') || '').toLowerCase();
    const altText = (img.attr('alt') || '').toLowerCase();
    
    const isMainCandidate = 
      className.includes('hero') || 
      className.includes('main') || 
      className.includes('primary') || 
      className.includes('zoom') ||
      idName.includes('hero') ||
      idName.includes('main');

    const source = isMainCandidate ? 'dom-main-img' : 'dom-img';

    add(img.attr('src'), source);
    add(img.attr('data-src'), source);
    add(img.attr('data-original'), source);
    add(img.attr('data-lazy-src'), source);
    add(img.attr('data-image'), source);
    add(img.attr('data-image-url'), source);

    const srcset = img.attr('srcset') || img.attr('data-srcset');
    extractSrcset(srcset, baseUrl).forEach((imageUrl: string) => {
      candidates.push({ url: imageUrl, source: 'srcset' });
    });
  });

  return candidates;
}

function extractChristiesImages(
  html: string,
  $: cheerio.CheerioAPI,
  baseUrl: string
): Array<{ url: string; source: string }> {
  const candidates = extractGenericImages(html, $, baseUrl);
  const add = (value?: string | null, source: string = 'christies-regex') => {
    if (!value) return;
    const url = cleanImageUrl(value, baseUrl);
    if (url) candidates.push({ url, source });
  };

  const christiesRegex = /https?:\/\/(?:www\.)?christies\.com\/img\/LotImages\/[^"'\\\s<>]+/gi;
  (html.match(christiesRegex) || []).forEach((url) => add(url));

  const escapedRegex = /https?:\\\/\\\/(?:www\.)?christies\.com\\\/img\\\/LotImages\\\/[^"'\\\s<>]+/gi;
  (html.match(escapedRegex) || []).forEach((url) => add(url.replace(/\\\//g, '/')));

  return candidates;
}

function scoreImageUrl(url: string, source: string, auctionHouse: string): number {
  const lower = url.toLowerCase();
  let score = 0;

  // Наивысший приоритет официальным превью OpenGraph и JSON-LD
  if (source === 'og:image' || source === 'twitter:image') {
    score += 500;
  }
  if (source === 'json-ld') {
    score += 300;
  }
  if (source === 'dom-main-img') {
    score += 200;
  }

  if (auctionHouse === "Christie's" && lower.includes('/img/lotimages/')) {
    score += 150;
  }
  if (auctionHouse === "Sotheby's" && (lower.includes('lot') || lower.includes('artwork'))) {
    score += 120;
  }
  if (auctionHouse === 'Phillips' && (lower.includes('lot') || lower.includes('artwork'))) {
    score += 120;
  }

  // Штрафы за нежелательные картинки
  if (
    lower.includes('logo') ||
    lower.includes('favicon') ||
    lower.includes('icon') ||
    lower.includes('avatar') ||
    lower.includes('placeholder')
  ) {
    score -= 1000;
  }

  if (
    lower.includes('thumbnail') ||
    lower.includes('/thumb/') ||
    lower.includes('thumb_') ||
    lower.includes('carousel') ||
    lower.includes('slider')
  ) {
    score -= 200;
  }

  if (lower.includes('small') || lower.includes('tiny') || lower.includes('pixel')) {
    score -= 300;
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
  let candidates: Array<{ url: string; source: string }> = [];

  if (existingImage) {
    const cleaned = cleanImageUrl(existingImage, baseUrl);
    if (cleaned) {
      candidates.push({ url: cleaned, source: 'parser-existing' });
    }
  }

  if (auctionHouse === "Christie's") {
    candidates.push(...extractChristiesImages(html, $, baseUrl));
  } else {
    candidates.push(...extractGenericImages(html, $, baseUrl));
  }

  // Убираем дубликаты по URL
  const uniqueMap = new Map<string, string>();
  candidates.forEach(c => {
    if (c.url && !uniqueMap.has(c.url)) {
      uniqueMap.set(c.url, c.source);
    }
  });

  const scored = Array.from(uniqueMap.entries())
    .map(([url, source]) => ({
      url,
      source,
      score: scoreImageUrl(url, source, auctionHouse),
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
    const url = typeof body?.url === 'string' ? body.url.trim() : '';

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const auctionHouse = detectAuctionHouse(url);
    let html = '';

    // 1. ПЕРВАЯ ПОПЫТКА: Jina Reader прокси
    try {
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

    // 3. ТРЕТЬЯ ПОПЫТКА: Прямой Fetch
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
