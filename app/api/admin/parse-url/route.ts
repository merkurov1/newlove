import { NextResponse } from 'next/server';
import { parseLot } from '@/lib/lots';
import { downloadAndStoreImage, resolveUrl } from '@/lib/lots/images';

function isBlockedHtml(html: string): boolean {
  if (!html || html.length < 500) return true;
  const lower = html.toLowerCase();
  return (
    lower.includes('just a moment...') ||
    lower.includes('enable javascript and cookies to continue') ||
    lower.includes('cf-browser-verification') ||
    lower.includes('challenge-running') ||
    lower.includes('attention required! | cloudflare')
  );
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const apiKey = process.env.SCRAPINGANT_API_KEY;
    let html = '';

    // 1. Быстрый прямой запрос
    try {
      const directRes = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(5_000),
      });

      if (directRes.ok) {
        const directHtml = await directRes.text();
        if (!isBlockedHtml(directHtml)) {
          html = directHtml;
        }
      }
    } catch {
      console.warn('[Parser] Direct HTML fetch failed, falling back to ScrapingAnt');
    }

    // 2. ScrapingAnt
    if (!html && apiKey) {
      try {
        const saEndpoint = new URL('https://api.scrapingant.com/v2/general');
        saEndpoint.searchParams.set('url', url);
        saEndpoint.searchParams.set('browser', 'true');

        const saRes = await fetch(saEndpoint, {
          headers: { 'x-api-key': apiKey },
          signal: AbortSignal.timeout(25_000),
        });

        if (saRes.ok) {
          html = await saRes.text();
        }
      } catch (err) {
        console.warn('[Parser] ScrapingAnt request failed:', err);
      }
    }

    if (!html || isBlockedHtml(html)) {
      return NextResponse.json(
        { error: 'Failed to retrieve unblocked HTML from the target URL' },
        { status: 422 }
      );
    }

    // 3. Парсинг данных лота
    const lotData = parseLot(html, url);

    // 4. Обработка изображения через модуль images.ts
    let permanentImageUrl = '';
    const candidates =
      lotData.imageCandidates && lotData.imageCandidates.length > 0
        ? lotData.imageCandidates
        : lotData.imageUrl
        ? [{ url: lotData.imageUrl }]
        : [];

    for (const candidate of candidates.slice(0, 3)) {
      try {
        const storedUrl = await downloadAndStoreImage(candidate.url, url, apiKey);
        if (storedUrl) {
          permanentImageUrl = storedUrl;
          break;
        }
      } catch (imageError) {
        console.warn(`[Parser] Image candidate failed (${candidate.url}):`, imageError);
      }
    }

    if (!permanentImageUrl && lotData.imageUrl) {
      permanentImageUrl = resolveUrl(lotData.imageUrl, url);
    }

    return NextResponse.json({
      ...lotData,
      imageUrl: permanentImageUrl,
    });
  } catch (error: any) {
    console.error('[API parse-lot] Error:', error);
    return NextResponse.json({ error: error?.message || 'Failed to parse lot' }, { status: 500 });
  }
}
