import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { parseLotHtml } from '@/lib/lots/parse';

export const runtime = 'nodejs';

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

    // Определяем аукционный дом
    let auctionHouse = "Christie's";
    if (url.includes('sothebys.com')) auctionHouse = "Sotheby's";
    if (url.includes('phillips.com')) auctionHouse = "Phillips";

    // 1. Извлекаем структурированные данные (JSON-LD) до удаления скриптов
    const structured = parseLotHtml(html, url, auctionHouse, { debug: true });

    // 2. Очищаем HTML от скриптов/стилей и готовим rawData для AI
    const $= cheerio.load(html);$('script, style, svg, noscript, iframe, footer, nav, header').remove();
    const cleanText = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 30000);

    // Подтягиваем качество картинки Christie's
    let bestImage = structured.imageUrl || '';
    if (bestImage && bestImage.includes('christies.com')) {
      bestImage = bestImage.replace(/width=\d+/, 'width=2000').replace(/maxwidth=\d+/, 'maxwidth=2000');
    }

    return NextResponse.json({
      title: structured.title || '',
      artist: structured.artist || '',
      image_url: bestImage,
      extracted: structured,
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
