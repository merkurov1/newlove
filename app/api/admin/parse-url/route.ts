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

  const endpoint = new URL('https://api.scrapingant.com/v2/general');
  endpoint.searchParams.append('url', targetUrl);
  endpoint.searchParams.append('x-api-key', apiKey);
  endpoint.searchParams.append('browser', 'true');
  endpoint.searchParams.append('wait_for_selector', 'h1, .chr-lot-header, [data-test="lot-title"]');

  const res = await fetch(endpoint.toString(), {
    method: 'GET',
    signal: AbortSignal.timeout(45_000),
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

    // 1. Проверяем тег <title> — на Christie's он имеет вид "JEAN-MICHEL BASQUIAT (1960-1988) | Ancient Scientist | Christie's"
    const pageTitle = $('title').text().trim();
    
    let artist = '';
    let title = '';
    let date = '';

    // Разбираем заголовок лота Christie's
    if (pageTitle.includes('|')) {
      const parts = pageTitle.split('|').map(p => p.trim());
      // [ "JEAN-MICHEL BASQUIAT (1960-1988)", "Ancient Scientist", "Christie's" ]
      if (parts.length >= 2) {
        const artistPart = parts[0];
        const dateMatch = artistPart.match(/\(([^)]+)\)/);
        if (dateMatch) {
          date = dateMatch[1];
          artist = artistPart.replace(/\([^)]+\)/, '').trim();
        } else {
          artist = artistPart;
        }
        title = parts[1];
      }
    }

    // 2. Ищем JSON-LD данные (Product / VisualArtwork / AuctionLot)
    let jsonLdData: any = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const parsed = JSON.parse($(el).html() || '');
        if (parsed['@type'] === 'VisualArtwork' || parsed['@type'] === 'Product' || parsed.name) {
          jsonLdData = parsed;
        }
      } catch {}
    });

    // 3. Достаем изображения высочайшего качества
    let image_url = $('meta[property="og:image"]').attr('content') || '';
    
    // Если Christie's отдал превью, переключаем на максимум
    if (image_url.includes('responsive-images')) {
      image_url = image_url.replace(/w=\d+/, 'w=1920');
    }

    // 4. Ищем спецификации в DOM (medium, dimensions, estimate, provenance)
    const bodyText = $('body').text();
    
    // Извлекаем блок о деталях лота
    const detailsText = $('.chr-lot-details, [class*="lot-details"], .lot-description').text().trim() || bodyText.slice(0, 4000);

    return NextResponse.json({
      success: true,
      artist: artist || jsonLdData?.artist?.name || '',
      title: title || jsonLdData?.name || '',
      date,
      image_url,
      medium: jsonLdData?.artMedium || '',
      dimensions: jsonLdData?.height ? `${jsonLdData.height} x ${jsonLdData.width}` : '',
      estimate: '',
      provenance: '',
      raw_description: detailsText,
      extracted: {
        pageTitle,
        jsonLdData,
        ogData: {
          title: $('meta[property="og:title"]').attr('content'),
          image: image_url
        }
      }
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'parse_failed', details: e?.message }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
