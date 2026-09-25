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

        const responseText = await saRes.text();

        // Проверяем, пришел ли JSON или сразу HTML
        if (responseText.trim().startsWith('<')) {
          // Если это HTML, проверяем, не страница ли это ошибки
          if (responseText.includes('Access Denied') || responseText.includes('Cloudflare')) {
            console.error('[ScrapingAnt] Blocked or returned error page');
          } else {
            html = responseText; // Если это внезапно и есть чистый HTML страницы
          }
        } else {
          // Пробуем распарсить как JSON от ScrapingAnt
          const data = JSON.parse(responseText);
          html = data.content || '';
        }
      } catch (err) {
        console.error('ScrapingAnt fetch error:', err);
      }
    }

    // Если через ScrapingAnt не вышло, пробуем прямой fetch как фоллбек
    if (!html) {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        },
      });
      if (res.ok) html = await res.text();
    }

    if (!html) {
      throw new Error('Failed to obtain HTML from target URL or scraper.');
    }

    const auctionHouse = detectAuctionHouse(url);
    const $ = cheerio.load(html);
    const structured = parseLotHtml(html, url, auctionHouse, { debug: true });

    // Универсальный поиск картинки
    let foundImage = structured.imageUrl || 
      $('meta[property="og:image"]').attr('content') || 
      $('meta[name="twitter:image"]').attr('content') || 
      $('img').first().attr('src') || '';

    structured.imageUrl = foundImage;

    return NextResponse.json({
      title: structured.title || $('title').text() || '',
      artist: structured.artist || '',
      image_url: foundImage,
      auction_house: auctionHouse,
      extracted: { ...structured, auctionHouse },
      url,
    });
  } catch (error: any) {
    console.error('[parse-url Error]:', error);
    return NextResponse.json({ error: error?.message || String(error) }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
