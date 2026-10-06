import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { parseLotHtml } from '@/lib/lots/parse';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Инициализируем сервисный клиент Supabase для сохранения картинок в storage
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/**
 * Скачивает найденную картинку с фоллбеком (сначала через wsrv.nl, при ошибке — напрямую)
 * и сохраняет в Supabase Storage, возвращая постоянную публичную ссылку.
 */
async function downloadAndStoreImage(externalUrl: string): Promise<string> {
  if (!externalUrl) return '';
  if (externalUrl.includes('/storage/v1/object/public/')) {
    return externalUrl; // Уже в Supabase
  }

  const browserHeaders = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Referer': 'https://www.bonhams.com/',
  };

  try {
    let res: Response | null = null;

    // 1. Пробуем через wsrv.nl
    try {
      const fetchUrl = `https://wsrv.nl/?url=${encodeURIComponent(externalUrl)}`;
      const proxyRes = await fetch(fetchUrl, {
        headers: browserHeaders,
        signal: AbortSignal.timeout(15_000),
      });
      if (proxyRes.ok) {
        res = proxyRes;
      }
    } catch {
      console.warn('[Parser] wsrv.nl proxy failed, falling back to direct fetch...');
    }

    // 2. Если wsrv.nl заблокирован (403) или упал — делаем прямой fetch
    if (!res) {
      console.log(`[Parser] Direct fetching image: ${externalUrl}`);
      const directRes = await fetch(externalUrl, {
        headers: browserHeaders,
        signal: AbortSignal.timeout(15_000),
      });
      if (!directRes.ok) {
        throw new Error(`Direct fetch failed with status ${directRes.status}: ${directRes.statusText}`);
      }
      res = directRes;
    }

    const contentType = res.headers.get('content-type') || '';
    const contentLength = Number(res.headers.get('content-length') || 0);
    if (!contentType.toLowerCase().startsWith('image/')) {
      throw new Error('The mirrored resource is not an image');
    }
    if (contentLength > MAX_IMAGE_BYTES) {
      throw new Error('The source image is larger than 15 MB');
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.byteLength > MAX_IMAGE_BYTES) {
      throw new Error('The source image is larger than 15 MB');
    }
    const fileName = `parsed/lot-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.jpg`;

    const { error: uploadError } = await supabase.storage
      .from('artifacts')
      .upload(fileName, buffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });

    if (uploadError) {
      throw new Error(`Supabase Storage upload error: ${JSON.stringify(uploadError)}`);
    }

    const { data: publicUrlData } = supabase.storage
      .from('artifacts')
      .getPublicUrl(fileName);

    if (!publicUrlData?.publicUrl) {
      throw new Error('Failed to get public URL from Supabase Storage');
    }

    console.log(`[Parser] Image successfully mirrored to Supabase: ${publicUrlData.publicUrl}`);
    return publicUrlData.publicUrl;

  } catch (err) {
    console.error('[Parser] CRITICAL Image mirror error:', err);
    throw err;
  }
}

function detectAuctionHouse(url: string): string {
  const lUrl = url.toLowerCase();

  if (lUrl.includes('sothebys.com')) return "Sotheby's";
  if (lUrl.includes('christies.com')) return "Christie's";
  if (lUrl.includes('phillips.com')) return 'Phillips';
  if (lUrl.includes('bonhams.com')) return 'Bonhams';

  return 'Auction House';
}

function isUsablePageHtml(value: string): boolean {
  const html = value.trim();
  if (html.length < 200 || !/<(?:!doctype\s+html|html|head|body)\b/i.test(html)) return false;
  return !/(access denied|request blocked|checking your browser|just a moment\.\.\.|captcha)/i.test(html.slice(0, 12_000));
}

async function fetchWithScrapingAnt(url: string, apiKey: string): Promise<string> {
  const endpoint = new URL('https://api.scrapingant.com/v2/general');
  endpoint.searchParams.set('url', url);
  endpoint.searchParams.set('browser', 'true');
  endpoint.searchParams.set('timeout', '25');

  const response = await fetch(endpoint, {
    signal: AbortSignal.timeout(30_000),
    headers: { 'x-api-key': apiKey, Accept: 'text/html' },
  });
  const responseText = await response.text();

  if (!response.ok) {
    let detail = responseText.slice(0, 500);
    try {
      const errorBody = JSON.parse(responseText);
      detail = errorBody?.detail || detail;
    } catch {
      // ScrapingAnt errors are normally JSON; preserve a short plain-text body otherwise.
    }
    throw new Error(`ScrapingAnt returned HTTP ${response.status}: ${detail}`);
  }

  // /v2/general returns HTML directly. Accept JSON wrappers for compatibility
  // with existing accounts/proxies that may return the extended response.
  let html = responseText;
  if (!isUsablePageHtml(html)) {
    try {
      const payload = JSON.parse(responseText);
      html = payload?.html || payload?.content || '';
    } catch {
      // The body was neither usable HTML nor a JSON wrapper.
    }
  }

  if (!isUsablePageHtml(html)) {
    throw new Error('ScrapingAnt returned an empty page or an anti-bot challenge.');
  }
  return html;
}

function absoluteUrl(value: string, baseUrl: string): string {
  try {
    if (value.startsWith('//')) {
      return `https:${value}`;
    }
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

  add($('meta[property="og:image"]').attr('content'), 'og:image');
  add($('meta[property="og:image:url"]').attr('content'), 'og:image');
  add($('meta[property="og:image:secure_url"]').attr('content'), 'og:image');
  add($('meta[name="twitter:image"]').attr('content'), 'twitter:image');
  add($('meta[name="twitter:image:src"]').attr('content'), 'twitter:image');
  add($('link[rel="image_src"]').attr('href'), 'link:image');

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

  $('img').each((_index: number, element: any) => {
    const img = $(element);
    const className = (img.attr('class') || '').toLowerCase();
    const idName = (img.attr('id') || '').toLowerCase();
    
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

  $('source[srcset], [data-background-image], [data-bg], [style*="background-image"]').each((_index: number, element: any) => {
    const node = $(element);
    const sourceSet = node.attr('srcset');
    extractSrcset(sourceSet, baseUrl).forEach((imageUrl: string) => {
      candidates.push({ url: imageUrl, source: 'picture-srcset' });
    });
    add(node.attr('data-background-image'), 'dom-background');
    add(node.attr('data-bg'), 'dom-background');
    const style = node.attr('style') || '';
    const backgroundUrl = style.match(/url\(["']?([^"')]+)["']?\)/i)?.[1];
    add(backgroundUrl, 'dom-background');
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

function extractBonhamsImages(
  html: string,
  $: cheerio.CheerioAPI,
  baseUrl: string
): Array<{ url: string; source: string }> {
  const candidates = extractGenericImages(html, $, baseUrl);
  const add = (value?: string | null, source: string = 'bonhams-regex') => {
    if (!value) return;
    const url = cleanImageUrl(value, baseUrl);
    if (url) candidates.push({ url, source });
  };

  // 1. Поиск прямого CDN и стандартных паттернов Bonhams
  const bonhamsRegex = /(?:https?:)?\/\/(?:images\d?\.bonhams\.com|www\.bonhams\.com)[^\s"'<>\\]+?(?:\.(?:jpg|jpeg|png|webp)(?:[?#][^\s"'<>\\]*)?|\/image\?[^\s"'<>\\]*)/gi;
  (html.match(bonhamsRegex) || []).forEach((url) => add(url, 'bonhams-regex'));

  // Current Bonhams CDN URLs often have no file extension:
  // images1.bonhams.com/image?src=...&width=...
  const bonhamsImageApiRegex = /(?:https?:)?\\?\/\\?\/(?:images\d?\.bonhams\.com)\\?\/image\?[^\s"'<>\\]+/gi;
  (html.match(bonhamsImageApiRegex) || []).forEach((url) => add(url, 'bonhams-image-api'));

  // 2. Разбор NextJS state (__NEXT_DATA__)
  const nextDataScript = $('#__NEXT_DATA__').html();
  if (nextDataScript) {
    try {
      const parsed = JSON.parse(nextDataScript);
      const searchObj = (obj: any) => {
        if (!obj || typeof obj !== 'object') return;

        for (const key in obj) {
          const val = obj[key];
          if (typeof val === 'string' && (key.toLowerCase().includes('image') || key.toLowerCase().includes('src') || key.toLowerCase().includes('url'))) {
            if (val.match(/\.(jpg|jpeg|png|webp)(?:[?#]|$)/i) || val.includes('/Image/') || /images\d?\.bonhams\.com\/image\?/i.test(val)) {
              add(val, 'bonhams-next-data');
            }
          } else if (typeof val === 'object') {
            searchObj(val);
          }
        }
      };
      searchObj(parsed);
    } catch {
      // Игнорируем ошибку JSON
    }
  }

  // 3. Дополнительные RegEx по всему документу для сырых данных
  const rawPathRegex = /\/Image\/Live\/[^\s"'<>\\]+/gi;
  (html.match(rawPathRegex) || []).forEach((path) => add(path, 'bonhams-raw-path'));

  return candidates;
}

function scoreImageUrl(url: string, source: string, auctionHouse: string): number {
  const lower = url.toLowerCase();
  let score = 0;

  if (source === 'og:image' || source === 'twitter:image') score += 500;
  if (source === 'json-ld' || source === 'bonhams-next-data') score += 300;
  if (source === 'dom-main-img') score += 200;

  if (auctionHouse === "Christie's" && lower.includes('/img/lotimages/')) score += 150;
  if (auctionHouse === "Sotheby's" && (lower.includes('lot') || lower.includes('artwork'))) score += 120;
  if (auctionHouse === 'Phillips' && (lower.includes('lot') || lower.includes('artwork'))) score += 120;

  if (auctionHouse === 'Bonhams') {
    if (lower.includes('images.bonhams.com') || lower.includes('/image/live/')) score += 300;
    if (lower.includes('images1.bonhams.com/image?') || lower.includes('images2.bonhams.com/image?')) score += 350;
    if (source === 'bonhams-regex' || source === 'bonhams-image-api' || source === 'bonhams-raw-path') score += 200;
  }

  if (
    lower.includes('logo') || lower.includes('favicon') || 
    lower.includes('icon') || lower.includes('avatar') || lower.includes('placeholder') ||
    lower.includes('banner') || lower.includes('header') || lower.includes('footer')
  ) {
    score -= 1000;
  }

  if (
    lower.includes('thumbnail') || lower.includes('/thumb/') || 
    lower.includes('thumb_') || lower.includes('carousel') || lower.includes('slider')
  ) {
    score -= 200;
  }

  if (lower.includes('small') || lower.includes('tiny') || lower.includes('pixel')) score -= 300;

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
    if (cleaned) candidates.push({ url: cleaned, source: 'parser-existing' });
  }

  if (auctionHouse === "Christie's") {
    candidates.push(...extractChristiesImages(html, $, baseUrl));
  } else if (auctionHouse === 'Bonhams') {
    candidates.push(...extractBonhamsImages(html, $, baseUrl));
  } else {
    candidates.push(...extractGenericImages(html, $, baseUrl));
  }

  const uniqueMap = new Map<string, string>();
  candidates.forEach(c => {
    if (c.url && !uniqueMap.has(c.url)) uniqueMap.set(c.url, c.source);
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

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return NextResponse.json({ error: 'A valid auction URL is required' }, { status: 400 });
    }
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: 'Only HTTP and HTTPS URLs are supported' }, { status: 400 });
    }

    const auctionHouse = detectAuctionHouse(url);
    let html = '';
    let htmlSource = '';

    const apiKey = process.env.SCRAPINGANT_API_KEY;
    const isKnownAuctionHouse = auctionHouse !== 'Auction House';
    if (isKnownAuctionHouse && !apiKey) {
      console.warn('[ScrapingAnt] SCRAPINGANT_API_KEY is not configured; auction parser will use fallbacks.');
    }

    // For auction sites, prefer ScrapingAnt's rendered page so parsing sees
    // the page content loaded by client-side JavaScript.
    if (apiKey && isKnownAuctionHouse) {
      try {
        html = await fetchWithScrapingAnt(url, apiKey);
        htmlSource = 'scrapingant';
      } catch (err) {
        console.warn('[ScrapingAnt] Auction page fetch failed; trying fallbacks:', err);
      }
    }

    // Jina Reader is a useful fallback and a cheap first option for unknown domains.
    if (!html) {
      try {
        const jinaRes = await fetch(`https://r.jina.ai/${url}`, {
          signal: AbortSignal.timeout(20_000),
          headers: {
            'X-Return-Format': 'html',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
          }
        });
        if (jinaRes.ok) {
          const jinaText = await jinaRes.text();
          if (isUsablePageHtml(jinaText)) {
            html = jinaText;
            htmlSource = 'jina';
          }
        }
      } catch (err) {
        console.error('[Jina Reader] Error:', err);
      }
    }

    // ScrapingAnt fallback for non-auction domains if Jina did not return usable HTML.
    if (!html && apiKey) {
      try {
        html = await fetchWithScrapingAnt(url, apiKey);
        htmlSource = 'scrapingant';
      } catch (err) {
        console.warn('[ScrapingAnt] Fallback fetch failed:', err);
      }
    }

    // Direct Fetch fallback
    if (!html) {
      try {
        const res = await fetch(url, {
          signal: AbortSignal.timeout(20_000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        if (res.ok) {
          const directHtml = await res.text();
          if (isUsablePageHtml(directHtml)) {
            html = directHtml;
            htmlSource = 'direct';
          }
        }
      } catch (err) {
        console.error('[Direct fetch] Error:', err);
      }
    }

    if (!html) {
      throw new Error('Failed to obtain HTML from target URL via proxy, scraper or direct fetch.');
    }

    const $ = cheerio.load(html);

    // Jina is excellent for text but may omit Bonhams' image payload. Fetch the
    // original document once more for image discovery when no Bonhams CDN URL
    // survived the reader transformation.
    let imageHtml = html;
    let imageDocument = $;
    const initialBonhamsImages = auctionHouse === 'Bonhams' ? extractBonhamsImages(html, $, url) : [];
    const hasBonhamsCdnImage = initialBonhamsImages.some((candidate) => /bonhams\.com\/image(?:s\d?)?\//i.test(candidate.url) || candidate.source.startsWith('bonhams-'));
    if (auctionHouse === 'Bonhams' && !hasBonhamsCdnImage) {
      try {
        const sourceRes = await fetch(url, {
          signal: AbortSignal.timeout(15_000),
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/122 Safari/537.36',
            Accept: 'text/html,application/xhtml+xml',
            'Accept-Language': 'en-US,en;q=0.9',
          },
        });
        if (sourceRes.ok) {
          imageHtml = await sourceRes.text();
          imageDocument = cheerio.load(imageHtml);
        }
      } catch (error) {
        console.warn('[Bonhams] Original HTML image fallback failed:', error);
      }
    }

    const structured = parseLotHtml(html, url, auctionHouse, { debug: true });

    const imageResult = extractBestImage(
      html,
      $,
      url,
      auctionHouse,
      structured.imageUrl ?? undefined
    );

    if (imageHtml !== html) {
      imageResult.candidates.push(...extractBonhamsImages(imageHtml, imageDocument, url).map((candidate) => ({
        ...candidate,
        score: scoreImageUrl(candidate.url, candidate.source, auctionHouse),
      })));
      const unique = new Map<string, string>();
      imageResult.candidates.forEach((candidate) => {
        if (candidate.url && !unique.has(candidate.url)) unique.set(candidate.url, candidate.source);
      });
      imageResult.candidates = Array.from(unique.entries())
        .map(([candidateUrl, source]) => ({
          url: candidateUrl,
          source,
          score: scoreImageUrl(candidateUrl, source, auctionHouse),
        }))
        .sort((a, b) => b.score - a.score);
    }

    const foundImage = imageResult.best;

    // Пробуем несколько лучших кандидатов. Один CDN URL может быть заблокирован,
    // поэтому ошибка конкретной картинки не должна ломать весь лот.
    let permanentImageUrl = foundImage;
    for (const candidate of imageResult.candidates.slice(0, 8)) {
      try {
        permanentImageUrl = await downloadAndStoreImage(candidate.url);
        if (permanentImageUrl) break;
      } catch (imageError) {
        console.warn(`[Parser] Image candidate failed (${candidate.source}):`, imageError);
      }
    }
    structured.imageUrl = permanentImageUrl;

    return NextResponse.json({
      title: structured.title || $('title').text() || '',
      artist: structured.artist || '',
      image_url: permanentImageUrl,
      auction_house: auctionHouse,
      extracted: {
        ...structured,
        auctionHouse,
        imageUrl: permanentImageUrl,
      },
      image_candidates: imageResult.candidates.slice(0, 20),
      html_source: htmlSource,
      url,
    });
  } catch (error: unknown) {
    console.error('[parse-url Error]:', error);
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message.includes('Unauthorized') ? message : 'Failed to parse URL', details: message }, { status: message.includes('Unauthorized') ? 401 : 500 });
  }
}
