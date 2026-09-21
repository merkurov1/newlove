import { NextResponse } from 'next/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const runtime = 'nodejs';
export const maxDuration = 30; 

export async function POST(req: Request) {
  try {
    await requireAdminFromRequest(req);
    const { url } = await req.json();

    if (!url) return NextResponse.json({ error: 'No URL provided' }, { status: 400 });

    console.log(`[Curator Engine] Fetching via Social Bot emulation: ${url}`);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
      },
      redirect: 'follow',
    });

    const htmlContent = await response.text();

    if (!response.ok || htmlContent.length < 500) {
      throw new Error(`Target auction house blocked the request (Status: ${response.status})`);
    }

    console.log(`[Curator Engine] Page fetched successfully. HTML length: ${htmlContent.length}. Extracting data...`);

    // 1. Извлекаем Open Graph метатеги (надежный источник для превью и основных данных)
    const getMetaContent = (property: string): string => {
      const match = htmlContent.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i')) ||
                    htmlContent.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i'));
      return match ? decodeEntities(match[1]) : '';
    };

    const ogTitle = getMetaContent('og:title');
    const ogDescription = getMetaContent('og:description');
    const ogImage = getMetaContent('og:image');

    // 2. Пытаемся достать глубокий JSON Next.js (__NEXT_DATA__), если он есть на странице
    let nextData: any = {};
    const nextDataMatch = htmlContent.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (nextDataMatch) {
      try {
        nextData = JSON.parse(nextDataMatch[1]);
      } catch (e) {
        console.warn('[Curator Engine] Failed to parse __NEXT_DATA__ JSON');
      }
    }

    // Собираем базовую структуру данных
    const parsedData = {
      artist: extractArtist(ogTitle),
      title: extractTitle(ogTitle),
      medium: '',
      dimensions: '',
      date: '',
      estimate: '',
      provenance: '',
      image_url: ogImage || '',
      raw_description: ogDescription || ''
    };

    console.log('[Curator Engine] Extraction complete:', parsedData);
    return NextResponse.json(parsedData);

  } catch (error: any) {
    console.error('[Parser Error]:', error);
    return NextResponse.json(
      { error: 'Parsing failed.', details: error?.message || String(error) }, 
      { status: 500 }
    );
  }
}

// Вспомогательные функции для очистки HTML-сущностей и парсинга заголовков
function decodeEntities(str: string): string {
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractArtist(ogTitle: string): string {
  // Обычно формат заголовка: "Artist Name (Year-Year) | Title | Auction"
  if (!ogTitle) return '';
  const parts = ogTitle.split('|');
  return parts[0]?.trim() || '';
}

function extractTitle(ogTitle: string): string {
  if (!ogTitle) return '';
  const parts = ogTitle.split('|');
  return parts[1]?.trim() || '';
}
