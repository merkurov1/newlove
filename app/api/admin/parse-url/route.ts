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

/**
 * Convert relative / protocol-relative URLs to absolute URLs.
 */
function absoluteUrl(value: string, baseUrl: string): string {
  try {
    return new URL(value, baseUrl).href;
  } catch {
    return '';
  }
}

/**
 * Clean URLs coming from HTML / JSON.
 */
function cleanImageUrl(value: string, baseUrl: string): string {
  if (!value) return '';

  let url = value.trim();

  // Decode common HTML / JSON escaping
  url = url
    .replace(/\\\//g, '/')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\\u002F/g, '/');

  // Remove surrounding quotes
  url = url.replace(/^["']|["']$/g, '');

  return absoluteUrl(url, baseUrl);
}

/**
 * Extract URLs from srcset.
 */
function extractSrcset(
  srcset: string | undefined,
  baseUrl: string
): string[] {
  if (!srcset) return [];

  return srcset
    .split(',')
    .map((part) => {
      const pieces = part.trim().split(/\s+/);
      return pieces[0];
    })
    .map((url) => cleanImageUrl(url, baseUrl))
    .filter(Boolean);
}

/**
 * Generic image extractor.
 *
 * Finds:
 * - OpenGraph
 * - Twitter image
 * - JSON-LD
 * - img src
 * - lazy-load attributes
 * - srcset
 * - background-image
 * - raw image URLs in HTML
 */
function extractGenericImages(
  html: string,
  $: cheerio.CheerioAPI,
  baseUrl: string
): string[] {
  const candidates: string[] = [];

  const add = (value?: string | null) => {
    if (!value) return;

    const url = cleanImageUrl(value, baseUrl);

    if (url) {
      candidates.push(url);
    }
  };

  // ---------------------------------------------------------
  // OpenGraph
  // ---------------------------------------------------------

  add($('meta[property="og:image"]').attr('content'));
  add($('meta[property="og:image:url"]').attr('content'));
  add($('meta[name="twitter:image"]').attr('content'));
  add($('meta[name="twitter:image:src"]').attr('content'));

  // ---------------------------------------------------------
  // JSON-LD
  // ---------------------------------------------------------

  $('script[type="application/ld+json"]').each((_, element) => {
    const text = $(element).html();

    if (!text) return;

    try {
      const data = JSON.parse(text);

      const scan = (value: any) => {
        if (!value) return;

        if (typeof value === 'string') {
          return;
        }

        if (Array.isArray(value)) {
          value.forEach(scan);
          return;
        }

        if (typeof value === 'object') {
          if (typeof value.image === 'string') {
            add(value.image);
          }

          if (Array.isArray(value.image)) {
            value.image.forEach((image) => {
              if (typeof image === 'string') {
                add(image);
              }

              if (image?.url) {
                add(image.url);
              }
            });
          }

          if (value.image?.url) {
            add(value.image.url);
          }

          Object.values(value).forEach(scan);
        }
      };

      scan(data);
    } catch {
      // Invalid JSON-LD — ignore
    }
  });

  // ---------------------------------------------------------
  // IMG elements
  // ---------------------------------------------------------

  $('img').each((_, element) => {
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

    extractSrcset(srcset, baseUrl).forEach((url) => {
      candidates.push(url);
    });
  });

  // ---------------------------------------------------------
  // Background images
  // ---------------------------------------------------------

  $('[style*="background-image"]').each((_, element) => {
    const style = $(element).attr('style') || '';

    const regex =
      /url\(\s*["']?([^"')]+)["']?\s*\)/gi;

    let match;

    while ((match = regex.exec(style)) !== null) {
      add(match[1]);
    }
  });

  // ---------------------------------------------------------
  // Raw HTML image URLs
  //
  // Useful for:
  // Next.js payloads
  // React hydration data
  // embedded JSON
  // auction-house-specific data
  // ---------------------------------------------------------

  const rawImageRegex =
    /https?:\/\/[^"'\\\s<>]+?\.(?:jpg|jpeg|png|webp|avif)(?:\?[^"'\\\s<>]*)?/gi;

  const rawMatches = html.match(rawImageRegex) || [];

  rawMatches.forEach((url) => {
    add(url);
  });

  // ---------------------------------------------------------
  // Deduplicate
  // ---------------------------------------------------------

  return [...new Set(candidates)];
}

/**
 * Christie's-specific image extraction.
 *
 * Christie's lot images normally live under:
 *
 * /img/LotImages/
 *
 * Example:
 *
 * https://www.christies.com/img/LotImages/2026/NYR/...
 */
function extractChristiesImages(
  html: string,
  $: cheerio.CheerioAPI,
  baseUrl: string
): string[] {
  const candidates: string[] = [];

  const add = (value?: string | null) => {
    if (!value) return;

    const url = cleanImageUrl(value, baseUrl);

    if (url) {
      candidates.push(url);
    }
  };

  // ---------------------------------------------------------
  // Generic extraction first
  // ---------------------------------------------------------

  extractGenericImages(html, $, baseUrl).forEach((url) => {
    candidates.push(url);
  });

  // ---------------------------------------------------------
  // Christie's LotImages URLs in raw HTML
  // ---------------------------------------------------------

  const christiesRegex =
    /https?:\/\/(?:www\.)?christies\.com\/img\/LotImages\/[^"'\\\s<>]+/gi;

  const christiesMatches = html.match(christiesRegex) || [];

  christiesMatches.forEach((url) => {
    add(url);
  });

  // ---------------------------------------------------------
  // Escaped JSON URLs
  // ---------------------------------------------------------

  const escapedRegex =
    /https?:\\\/\\\/(?:www\.)?christies\.com\\\/img\\\/LotImages\\\/[^"'\\\s<>]+/gi;

  const escapedMatches = html.match(escapedRegex) || [];

  escapedMatches.forEach((url) => {
    add(url.replace(/\\\//g, '/'));
  });

  // ---------------------------------------------------------
  // Relative /img/LotImages/... URLs
  // ---------------------------------------------------------

  const relativeRegex =
    /["'](\/img\/LotImages\/[^"']+)["']/gi;

  let match;

  while ((match = relativeRegex.exec(html)) !== null) {
    add(match[1]);
  }

  return [...new Set(candidates)];
}

/**
 * Score an image candidate.
 *
 * Higher score = more likely to be the actual artwork.
 */
function scoreImageUrl(
  url: string,
  auctionHouse: string
): number {
  const lower = url.toLowerCase();

  let score = 0;

  // ---------------------------------------------------------
  // Very strong auction-house signals
  // ---------------------------------------------------------

  if (
    auctionHouse === "Christie's" &&
    lower.includes('/img/lotimages/')
  ) {
    score += 100;
  }

  if (
    auctionHouse === "Sotheby's" &&
    (
      lower.includes('lot') ||
      lower.includes('artwork')
    )
  ) {
    score += 70;
  }

  if (
    auctionHouse === 'Phillips' &&
    (
      lower.includes('lot') ||
      lower.includes('artwork')
    )
  ) {
    score += 70;
  }

  if (
    auctionHouse === 'Bonhams' &&
    (
      lower.includes('lot') ||
      lower.includes('image')
    )
  ) {
    score += 60;
  }

  // ---------------------------------------------------------
  // Generic image signals
  // ---------------------------------------------------------

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

  // ---------------------------------------------------------
  // Format
  // ---------------------------------------------------------

  if (
    /\.(jpg|jpeg|png|webp|avif)(\?|$)/i.test(lower)
  ) {
    score += 10;
  }

  // ---------------------------------------------------------
  // Bad candidates
  // ---------------------------------------------------------

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

  if (
    lower.includes('small') ||
    lower.includes('tiny')
  ) {
    score -= 20;
  }

  // ---------------------------------------------------------
  // Social / tracking images
  // ---------------------------------------------------------

  if (
    lower.includes('pixel') ||
    lower.includes('tracking')
  ) {
    score -= 100;
  }

  return score;
}

/**
 * Extract the most likely artwork image.
 */
function extractBestImage(
  html: string,
  $: cheerio.CheerioAPI,
  baseUrl: string,
  auctionHouse: string,
  existingImage?: string
) {
  let candidates: string[] = [];

  // Existing parser result
  if (existingImage) {
    candidates.push(
      cleanImageUrl(existingImage, baseUrl)
    );
  }

  // Auction-house-specific extraction
  if (auctionHouse === "Christie's") {
    candidates.push(
      ...extractChristiesImages(
        html,
        $,
        baseUrl
      )
    );
  } else {
    candidates.push(
      ...extractGenericImages(
        html,
        $,
        baseUrl
      )
    );
  }

  // Deduplicate
  candidates = [
    ...new Set(
      candidates.filter(Boolean)
    ),
  ];

  // Score
  const scored = candidates
    .map((url) => ({
      url,
      score: scoreImageUrl(
        url,
        auctionHouse
      ),
    }))
    .sort((a, b) => b.score - a.score);

  return {
    best: scored[0]?.url || '',
    candidates: scored,
  };
}

export async function POST(req: Request) {
  try {
    // -------------------------------------------------------
    // Auth
    // -------------------------------------------------------

    await requireAdminFromRequest(req);

    // -------------------------------------------------------
    // Request
    // -------------------------------------------------------

    const { url } = await req.json();

    if (!url) {
      return NextResponse.json(
        {
          error: 'URL is required',
        },
        {
          status: 400,
        }
      );
    }

    // -------------------------------------------------------
    // Detect auction house
    // -------------------------------------------------------

    const auctionHouse =
      detectAuctionHouse(url);

    // -------------------------------------------------------
    // Get HTML
    // -------------------------------------------------------

    const apiKey =
      process.env.SCRAPINGANT_API_KEY;

    let html = '';

    // -------------------------------------------------------
    // ScrapingAnt
    // -------------------------------------------------------

    if (apiKey) {
      try {
        const scrapingAntUrl =
          `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(
            url
          )}&browser=true`;

        const saRes = await fetch(
          scrapingAntUrl,
          {
            headers: {
              'x-api-key': apiKey,
            },
          }
        );

        const responseText =
          await saRes.text();

        if (
          responseText
            .trim()
            .startsWith('<')
        ) {
          // Direct HTML response

          if (
            responseText.includes(
              'Access Denied'
            ) ||
            responseText.includes(
              'Cloudflare'
            )
          ) {
            console.error(
              '[ScrapingAnt] Blocked or returned error page'
            );
          } else {
            html = responseText;
          }
        } else {
          // JSON response

          try {
            const data =
              JSON.parse(responseText);

            html =
              data.content ||
              data.html ||
              '';
          } catch (parseError) {
            console.error(
              '[ScrapingAnt] Invalid JSON response:',
              parseError
            );
          }
        }
      } catch (err) {
        console.error(
          '[ScrapingAnt] Fetch error:',
          err
        );
      }
    }

    // -------------------------------------------------------
    // Direct fetch fallback
    // -------------------------------------------------------

    if (!html) {
      try {
        const res = await fetch(
          url,
          {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
              Accept:
                'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
              'Accept-Language':
                'en-US,en;q=0.9',
            },
          }
        );

        if (res.ok) {
          html = await res.text();
        } else {
          console.error(
            `[Direct fetch] HTTP ${res.status}`
          );
        }
      } catch (err) {
        console.error(
          '[Direct fetch] Error:',
          err
        );
      }
    }

    // -------------------------------------------------------
    // No HTML
    // -------------------------------------------------------

    if (!html) {
      throw new Error(
        'Failed to obtain HTML from target URL or scraper.'
      );
    }

    console.log(
      `[Parser] ${auctionHouse} HTML length: ${html.length}`
    );

    // -------------------------------------------------------
    // Cheerio
    // -------------------------------------------------------

    const $ =
      cheerio.load(html);

    // -------------------------------------------------------
    // Existing lot parser
    // -------------------------------------------------------

    const structured =
      parseLotHtml(
        html,
        url,
        auctionHouse,
        {
          debug: true,
        }
      );

    // -------------------------------------------------------
    // Image extraction
    // -------------------------------------------------------

    const imageResult =
      extractBestImage(
        html,
        $,
        url,
        auctionHouse,
        structured.imageUrl
      );

    const foundImage =
      imageResult.best;

    structured.imageUrl =
      foundImage;

    // -------------------------------------------------------
    // Debug logging
    // -------------------------------------------------------

    console.log(
      '[Parser] Image candidates:',
      imageResult.candidates
        .slice(0, 10)
    );

    console.log(
      '[Parser] Selected image:',
      foundImage
    );

    // -------------------------------------------------------
    // Response
    // -------------------------------------------------------

    return NextResponse.json({
      title:
        structured.title ||
        $('title').text() ||
        '',

      artist:
        structured.artist ||
        '',

      image_url:
        foundImage,

      auction_house:
        auctionHouse,

      extracted: {
        ...structured,
        auctionHouse,
      },

      // Very useful while debugging.
      // Remove later if you don't want this in production.
      image_candidates:
        imageResult.candidates
          .slice(0, 20),

      url,
    });
  } catch (error: any) {
    console.error(
      '[parse-url Error]:',
      error
    );

    return NextResponse.json(
      {
        error:
          error?.message ||
          String(error),
      },
      {
        status: 500,
      }
    );
  }
}