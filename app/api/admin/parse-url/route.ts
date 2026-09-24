import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import * as cheerio from 'cheerio';

export const runtime = 'nodejs';
export const maxDuration = 60;

async function fetchViaScrapingAnt(targetUrl: string): Promise<string> {
  const apiKey = (process.env.SCRAPINGANT_API_KEY || '').trim();
  if (!apiKey) {
    throw new Error('SCRAPINGANT_API_KEY is missing');
  }

  // Используем параметры в точности из генератора запросов ScrapingAnt
  const endpoint = new URL('https://api.scrapingant.com/v2/general');
  endpoint.searchParams.append('url', targetUrl);
  endpoint.searchParams.append('x-api-key', apiKey);
  endpoint.searchParams.append('return_page_source', 'true');
  endpoint.searchParams.append('browser', 'true');

  const res = await fetch(endpoint.toString(), {
    method: 'GET',
    headers: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    signal: AbortSignal.timeout(50_000),
  });

  if (!res.ok) throw new Error(`ScrapingAnt HTTP ${res.status}`);
  return await res.text();
}

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
    const { url } = await req.json();

    const html = await fetchViaScrapingAnt(url);
    const $ = cheerio.load(html);

    // 1. Проверяем наличие NEXT_DATA (Christie's хранит там всё состояние лота)
    let nextData: any = null;
    const nextScript = $('#__NEXT_DATA__').html();
    if (nextScript) {
      try {
        nextData = JSON.parse(nextScript);
      } catch (e) {
        console.error('Failed to parse __NEXT_DATA__', e);
      }
    }

    // 2. Ищем JSON-LD блоки
    const jsonLdBlocks: any[] = [];
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const raw = $(el).html();
        if (raw) jsonLdBlocks.push(JSON.parse(raw));
      } catch {}
    });

    // 3. Вытаскиваем заголовок страницы и данные Christie's
    const pageTitle = $('title').text().trim();
    let artist = '';
    let title = '';
    let date = '';

    // Разбор маски Christie's: "ИМЯ (ГОДЫ), Название | Christie's"
    const titleMatch = pageTitle.match(/^([^,(]+)(?:\(([^)]+)\))?,\s*([^|]+)/i);
    if (titleMatch) {
      artist = titleMatch[1].trim();
      date = titleMatch[2]?.trim() || '';
      title = titleMatch[3].trim();
    } else if (pageTitle.includes('|')) {
      const parts = pageTitle.split('|').map(p => p.trim());
      artist = parts[0] || '';
      title = parts[1] || '';
    }

    // 4. Поиск изображения высочайшего разрешения
    let image_url = $('meta[property="og:image"]').attr('content') || '';
    
    // Если в og:image превью, ищем ориг ссылки в DOM/NextData
    if (!image_url || image_url.includes('shorthand')) {
      const imgInDom = $('img[src*="christies"], img[src*="lot"]').first().attr('src');
      if (imgInDom) image_url = imgInDom;
    }

    // 5. Текст деталей лота
    const lotDetails = $('.chr-lot-details, [class*="lot-details"], .chr-article-body').text().trim() 
      || $('body').text().replace(/\s+/g, ' ').slice(0, 5000);

    return NextResponse.json({
      success: true,
      artist,
      title,
      date,
      image_url,
      medium: '',
      dimensions: '',
      estimate: '',
      provenance: '',
      raw_description: lotDetails,
      rawLength: html.length,
      extracted: {
        pageTitle,
        hasNextData: !!nextData,
        nextDataProps: nextData?.props?.pageProps || null,
        jsonLdBlocks,
        ogData: {
          title: $('meta[property="og:title"]').attr('content'),
          image: $('meta[property="og:image"]').attr('content'),
        }
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'parse_failed', details: e?.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
