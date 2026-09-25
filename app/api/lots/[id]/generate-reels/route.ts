import { NextResponse } from 'next/server';
import { generateAndUploadReel } from '@/lib/video/reelGenerator';
import { createClient } from '@supabase/supabase-js';

// Инициализируем серверный клиент Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

/**
 * Безопасно получает картинку: если это внешний URL (например, Christie's), 
 * скачивает её через wsrv.nl прокси, чтобы избежать ETIMEDOUT и блокировок.
 */
async function getSafeImageUrl(imagePathOrUrl: string): Promise<string> {
  if (!imagePathOrUrl) return '';

  // Если это уже наша ссылка из Supabase Storage — оставляем как есть
  if (imagePathOrUrl.includes('/storage/v1/object/public/')) {
    return imagePathOrUrl;
  }

  // Если это полный внешний URL (начинается с http)
  let targetUrl = imagePathOrUrl;
  if (!imagePathOrUrl.startsWith('http')) {
    targetUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/artifacts/${imagePathOrUrl}`;
  }

  // Если ссылка все еще ведет на сторонний домен (например, christies.com), прогоняем через прокси для стабильности
  if (targetUrl.includes('christies.com') || targetUrl.includes('sothebys.com')) {
    try {
      const proxyUrl = `https://wsrv.nl/?url=${encodeURIComponent(targetUrl)}`;
      const res = await fetch(proxyUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      if (res.ok) {
        const buffer = Buffer.from(await res.arrayBuffer());
        const fileName = `reels-cache/lot-${Date.now()}-${Math.random().toString(36).substring(2, 8)}.jpg`;
        
        await supabase.storage.from('artifacts').upload(fileName, buffer, {
          contentType: 'image/jpeg',
          upsert: true,
        });

        const { data } = supabase.storage.from('artifacts').getPublicUrl(fileName);
        if (data?.publicUrl) {
          console.log(`[ReelGen] Successfully cached external image to Supabase: ${data.publicUrl}`);
          return data.publicUrl;
        }
      }
    } catch (e) {
      console.warn('[ReelGen] Failed to proxy image via wsrv.nl, falling back to direct URL:', e);
    }
  }

  return targetUrl;
}

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const lotId = params.id;

    // 1. Достаем лот из базы данных
    const { data: lot, error: lotError } = await supabase
      .from('lots')
      .select('*')
      .eq('id', lotId)
      .single();

    if (lotError || !lot) {
      return NextResponse.json({ error: 'Лот не найден' }, { status: 404 });
    }

    // 2. Безопасно формируем/зеркалируем картинку для рилса
    const rawImage = lot.image_path || lot.image_url || '';
    const imageUrl = await getSafeImageUrl(rawImage);

    // Определяем аукционный дом (или берем из полей)
    const sourceUrl = (lot.source_url || '').toLowerCase();
    let auctionHouse = lot.auction_house || 'Auction';
    if (sourceUrl.includes('sothebys.com')) auctionHouse = "Sotheby's";
    else if (sourceUrl.includes('christies.com')) auctionHouse = "Christie's";
    else if (sourceUrl.includes('phillips.com')) auctionHouse = "Phillips";

    const lotData = {
      imageUrl,
      artist: lot.artist || 'Unknown Artist',
      title: lot.title || 'Untitled',
      auctionHouse,
      location: lot.ai_content?.location || 'Global',
      price: lot.estimate || lot.ai_content?.estimate_raw || 'On Request',
    };

    // 3. Запускаем генерацию и загрузку в Supabase Storage
    const videoUrl = await generateAndUploadReel(lotId, lotData);

    return NextResponse.json({ success: true, videoUrl });

  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message || 'Ошибка сервера при генерации' }, { status: 500 });
  }
}
