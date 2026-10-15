import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { crosspostFlowItem, type CrosspostPayload } from '@/lib/flow/crosspost';

export const dynamic = 'force-dynamic';

function getSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error('Supabase environment variables are missing.');
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * POST /api/flow/crosspost
 *
 * Серверный эндпоинт для запуска кросспостинга через API.
 * Принимает { id: string } или { slug: string } или прямой объект публикации.
 * Выполняет автоматический постинг в Telegram (Unframed/Pierrot) и Bluesky.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    let payload: CrosspostPayload;

    if (body.id || body.slug) {
      const supabase = getSupabaseAdmin();
      let query = supabase.from('items').select('*');

      if (body.id) {
        query = query.eq('id', body.id);
      } else {
        query = query.eq('slug', body.slug);
      }

      const { data: item, error } = await query.maybeSingle();

      if (error || !item) {
        return NextResponse.json(
          { error: 'Flow item not found', details: error?.message },
          { status: 404 }
        );
      }

      payload = item as CrosspostPayload;
    } else if (body.title || body.body_md) {
      payload = {
        id: body.id || 'manual-api-crosspost',
        title: body.title || null,
        body_md: body.body_md || null,
        source_url: body.source_url || null,
        slug: body.slug || null,
        lang: body.lang || 'ru',
        imageUrl: body.imageUrl || null,
        youtubeUrl: body.youtubeUrl || null,
        metadata: body.metadata || {},
      };
    } else {
      return NextResponse.json(
        { error: 'Provide item "id", "slug", or content ("title" / "body_md").' },
        { status: 400 }
      );
    }

    const result = await crosspostFlowItem(payload);

    return NextResponse.json({
      success: true,
      result,
    });
  } catch (error: any) {
    console.error('[api/flow/crosspost] Error:', error);
    return NextResponse.json(
      { error: 'Crosspost API failed', details: error?.message },
      { status: 500 }
    );
  }
}
