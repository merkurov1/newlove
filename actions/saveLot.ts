'use server';

import { createClient } from '@supabase/supabase-js';
import { parseLotWithAI } from '@/lib/openrouter';
import { revalidatePath } from 'next/cache';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function saveLotAction(url: string, rawText?: string) {
  try {
    // Парсим через AI + скрапинг
    const lotData = await parseLotWithAI(url, rawText);

    // Вставляем или обновляем по source_url
    const { data, error } = await supabase
      .from('auction_lots')
      .upsert({
        title: lotData.title || 'Без названия',
        artist: lotData.artist,
        year: lotData.year,
        medium: lotData.medium,
        estimate_low: lotData.estimate_low,
        estimate_high: lotData.estimate_high,
        currency: lotData.currency || 'USD',
        description: lotData.description,
        preview_image: lotData.preview_image,
        source_url: url,
        raw_metadata: lotData,
        updated_at: new Date().toISOString()
      }, { onConflict: 'source_url' })
      .select()
      .single();

    if (error) throw error;

    revalidatePath('/admin');
    return { success: true, data };
  } catch (err: any) {
    console.error('Save Lot Error:', err);
    return { success: false, error: err.message || 'Ошибка при сохранении' };
  }
}
