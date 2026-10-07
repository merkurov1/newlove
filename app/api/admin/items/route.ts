import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient({
      useServiceRole: true,
    });

    const { data: items, error } = await supabase
      .from('items')
      .select(
        [
          'id',
          'title',
          'slug',
          'lang',
          'type',
          'status',
          'visibility',
          'body_md',
          'published_at',
          'created_at',
          'updated_at',
        ].join(',')
      )
      .eq('status', 'published')
      .eq('visibility', 'public')
      .order('published_at', {
        ascending: false,
        nullsFirst: false,
      })
      .limit(100);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      items: items ?? [],
    });
  } catch (error) {
    console.error('[flow-items]', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load flow',
      },
      { status: 500 }
    );
  }
}