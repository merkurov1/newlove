import { NextResponse } from 'next/server';
import { generateAndUploadReel } from '@/lib/video/reelGenerator';
import { createClient } from '@supabase/supabase-js';

// Инициализируем серверный клиент Supabase
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

    // 2. Формируем картинку (если путь относительный, дополняем до полного URL)
    const imageUrl = lot.image_path?.startsWith('http')
      ? lot.image_path
      : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/artifacts/${lot.image_path}`;

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
