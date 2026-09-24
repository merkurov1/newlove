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

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch page, status: ${res.status}`);
    }

    const html = await res.text();
    const auctionHouse = detectAuctionHouse(url);

    const structured = parseLotHtml(html, url, auctionHouse, { debug: true });

    const $= cheerio.load(html);$('script, style, svg, noscript, iframe, footer, nav, header').remove();
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
