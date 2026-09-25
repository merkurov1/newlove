import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { parseLotHtml } from '@/lib/lots/parse';

export const runtime = 'nodejs';

function detectAuctionHouse(url: string): string {
  const lUrl = url.toLowerCase();
  if (lUrl.includes('sothebys.com')) return "Sotheby's";
  if (lUrl.includes('christies.com')) return "Christie's";
  if (lUrl.includes('phillips.com')) return "Phillips";
  if (lUrl.includes('bonhams.com')) return "Bonhams";
  return "Auction House";
}

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const apiKey = process.env.SCRAPINGANT_API_KEY;
    let html = '';

    if (apiKey) {
      try {
        const scrapingAntUrl = `https://api.scrapingant.com/v2/general?url=${encodeURIComponent(url)}&browser=true`;
        const saRes = await fetch(scrapingAntUrl, {
          headers: { 'x-api-key': apiKey },
        });
        if (saRes.ok) {
          const data = await saRes.json();
          html = data.content || '';
        }
      } catch (err) {
        console.error('ScrapingAnt request failed:', err);
      }
    }

    if (!html) {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });
      if (!res.ok) throw new Error(`Failed to fetch page, status: ${res.status}`);
      html = await res.text();
    }

    const auctionHouse = detectAuctionHouse(url);
    const $ = cheerio.load(html);
    const structured = parseLotHtml(html, url, auctionHouse, { debug: true });

    let foundImage = structured.imageUrl || '';

    if (!foundImage) {
      const ogImage = $('meta[property="og:image"]').attr('content');
      const twImage = $('meta[name="twitter:image"]').attr('content');
      if (ogImage) foundImage = ogImage;
      else if (twImage) foundImage = twImage;
    }

    if (!foundImage) {
      const zoomSrc = $('[data-zoom-src]').attr('data-zoom-src');
      const lazySrc = $('[data-lazy-src]').attr('data-lazy-src');
      const srcset = $('.primary-image img, .lot-image img, img[srcset], picture source').first().attr('srcset');
      const heroSrc = $('.hero-image img, [data-testid="lot-image"] img').first().attr('src');

      const candidate = zoomSrc || lazySrc || srcset || heroSrc || '';
      if (candidate) {
        foundImage = candidate.split(',')[0].trim().split(' ')[0];
      }
    }

    if (!foundImage) {
      try {
        const nextDataScript = $('#__NEXT_DATA__').html();
        if (nextDataScript) {
          const nextJson = JSON.parse(nextDataScript);
          const jsonString = JSON.stringify(nextJson);
          const imgMatches = jsonString.match(/https?:\/\/[^"'\s]+\.(?:jpg|jpeg|webp|png)(?:\?[^"'\s]*)?/gi);
          if (imgMatches && imgMatches.length > 0) {
            const validImg = imgMatches.find((img: string) => 
              img.includes('lot') || img.includes('item') || img.includes('targus') || img.includes('christies')
            );
            if (validImg) {
              foundImage = validImg;
            }
          }
        }
      } catch (e) {
        console.error('Failed to parse __NEXT_DATA__ for image:', e);
      }
    }

    structured.imageUrl = foundImage;

    $('script, style, svg, noscript, iframe, footer, nav, header').remove();
    const cleanText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 30000);

    let bestImage = structured.imageUrl || '';
    if (bestImage && bestImage.includes('christies.com')) {
      bestImage = bestImage.replace(/width=\d+/, 'width=2000').replace(/maxwidth=\d+/, 'maxwidth=2000');
    }

    return NextResponse.json({
      title: structured.title || '',
      artist: structured.artist || '',
      image_url: bestImage,
      auction_house: auctionHouse,
      extracted: {
        ...structured,
        auctionHouse,
      },
      rawData: cleanText,
      rawLength: cleanText.length,
      url,
    });
  } catch (error: any) {
    console.error('[parse-url Error]:', error);
    return NextResponse.json(
      { error: 'Failed to parse URL', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}

export const dynamic = 'force-dynamic';
