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

    console.log(`[Curator Engine] Page fetched successfully. HTML length: ${htmlContent.length}. Extracting deep data...`);

    // 1. Извлекаем базовые Open Graph метатеги
    const getMetaContent = (property: string): string => {
      const match = htmlContent.match(new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i')) ||
                    htmlContent.match(new RegExp(`<meta[^>]*content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i'));
      return match ? decodeEntities(match[1]) : '';
    };

    const ogTitle = getMetaContent('og:title');
    const ogDescription = getMetaContent('og:description');
    const ogImage = getMetaContent('og:image');

    // 2. Парсим JSON-LD (Schema.org / VisualArtwork), так как сайт на Stencil.js и не имеет __NEXT_DATA__
    let lotData: any = {};
    const jsonLdMatches = htmlContent.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g);
    
    for (const match of jsonLdMatches) {
      try {
        const json = JSON.parse(match[1]);
        const target = Array.isArray(json) 
          ? json.find(item => item['@type'] === 'VisualArtwork' || item['@type'] === 'Product' || item['@type'] === 'ArtGallery') 
          : json;
        
        if (target && (target['@type'] === 'VisualArtwork' || target.name || target.creator)) {
          lotData = {
            artist: target.creator?.name || target.author?.name || '',
            title: target.name || target.headline || '',
            medium: target.artMedium || target.material || '',
            dimensions: target.size || (target.width ? `${target.width} x ${target.height} ${target.unitText || ''}` : ''),
            date: target.dateCreated || target.releaseDate || '',
            image_url: target.image || '',
            description: target.description || ''
          };
          break;
        }
      } catch (e) {
        // Пропускаем невалидные JSON-блоки
      }
    }

    // Собираем итоговые данные с фоллбеками на Open Graph
    const parsedData = {
      artist: lotData.artist || extractArtist(ogTitle),
      title: lotData.title || extractTitle(ogTitle),
      medium: lotData.medium || 'N/A',
      dimensions: lotData.dimensions || 'N/A',
      date: lotData.date || extractPattern(htmlContent, /\b(19\d{2}|20\d{2})\b/) || 'N/A',
      estimate: 'N/A', 
      provenance: 'N/A',
      image_url: ogImage || lotData.image_url || '',
      raw_description: ogDescription || lotData.description || 'N/A'
    };

    console.log('[Curator Engine] Deep extraction complete:', parsedData);
    return NextResponse.json(parsedData);

  } catch (error: any) {
    console.error('[Parser Error]:', error);
    return NextResponse.json(
      { error: 'Parsing failed.', details: error?.message || String(error) }, 
      { status: 500 }
    );
  }
}

// Вспомогательные функции
function decodeEntities(str: string): string {
  if (!str) return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractArtist(ogTitle: string): string {
  if (!ogTitle) return 'N/A';
  const parts = ogTitle.split('|');
  return parts[0]?.trim() || 'N/A';
}

function extractTitle(ogTitle: string): string {
  if (!ogTitle) return 'N/A';
  const parts = ogTitle.split('|');
  return parts[1]?.trim() || 'N/A';
}

function extractPattern(html: string, regex: RegExp): string {
  const match = html.match(regex);
  return match ? match[0] : '';
}
