import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const supabase = createClient({ useServiceRole: true });

    const title = (body.title ?? '').trim() || 'Untitled';
    const slugBase = title
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, '')
      .replace(/\s+/g, '-')
      .slice(0, 80) || 'untitled';

    const { data: item, error } = await supabase
      .from('items')
      .insert({
        type: body.type ?? 'note',
        status: 'draft',
        visibility: 'private',
        lang: body.lang ?? 'ru',
        slug: slugBase,
        title,
        body_md: body.body_md ?? '',
        source_url: body.source_url ?? null,
        metadata: body.metadata ?? {},
        ai_allowed: body.ai_allowed ?? true,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ success: true, item });
  } catch (error) {
    console.error('[admin-items-new]', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
