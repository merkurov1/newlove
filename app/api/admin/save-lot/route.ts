import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getAuctionHouseName(url: string, rawHouse?: string): string {
  const lowercaseUrl = (url || '').toLowerCase();
  if (lowercaseUrl.includes('sothebys.com')) return "Sotheby's";
  if (lowercaseUrl.includes('christies.com')) return "Christie's";
  if (lowercaseUrl.includes('phillips.com')) return "Phillips";
  if (lowercaseUrl.includes('bonhams.com')) return "Bonhams";
  return rawHouse || "Auction House";
}

export async function POST(req: Request) {
  try {
    const { artist, title, link, image_url, ai_content, specs } = await req.json();

    if (!link) {
      return NextResponse.json({ error: 'Source link is required' }, { status: 400 });
    }

    let storedImagePath = image_url;

    // Безопасная загрузка картинки в бакет с тайм-аутом в 5 секунд, чтобы сервер не зависал
    if (image_url && image_url.startsWith('http')) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 сек таймаут

        const imgRes = await fetch(image_url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'image/*'
          }
        });
        
        clearTimeout(timeoutId);

        if (imgRes.ok) {
          const buffer = await imgRes.arrayBuffer();
          const ext = image_url.split('.').pop()?.split('?')[0].split('#')[0] || 'jpg';
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('artifacts')
            .upload(fileName, buffer, {
              contentType: imgRes.headers.get('content-type') || 'image/jpeg',
              upsert: true,
            });

          if (!uploadError && uploadData) {
            storedImagePath = uploadData.path;
          }
        }
      } catch (e) {
        console.warn('Image bucket download timed out or failed, falling back to direct URL:', e);
        // Оставляем исходный внешний image_url, сохранение в базу не прерывается
      }
    }

    const resolvedAuctionHouse = getAuctionHouseName(link, specs?.auction_house);

    const lotPayload: any = {
      artist: artist || ai_content?.artist || 'Unknown Artist',
      title: title || ai_content?.title || 'Untitled',
      year: ai_content?.year || specs?.year || null,
      medium: ai_content?.medium || specs?.medium || null,
      dimensions: ai_content?.dimensions || specs?.dimensions || null,
      estimate: ai_content?.estimate_raw || specs?.estimate || null,
      source_url: link,
      auction_house: resolvedAuctionHouse,
      ai_content: ai_content,
    };

    if (storedImagePath) {
      lotPayload.image_path = storedImagePath;
    }

    // UPSERT в таблицу lots
    const { data: lot, error } = await supabase
      .from('lots')
      .upsert(lotPayload, { onConflict: 'source_url' })
      .select('id')
      .single();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      lot_id: lot.id,
      redirect_url: `/art-engine/lots/${lot.id}`,
    });
  } catch (error: any) {
    console.error('Error saving lot:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
