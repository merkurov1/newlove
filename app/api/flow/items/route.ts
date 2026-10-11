import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function getSupabaseAdmin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Supabase server environment variables are missing.',
    );
  }

  return createClient(
    url,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    },
  );
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limitParam = searchParams.get('limit');
    const offsetParam = searchParams.get('offset');

    // Default to 10 items for lightning-fast initial load
    const limit = Math.min(
      Math.max(parseInt(limitParam || '10', 10) || 10, 1),
      50,
    );
    const offset = Math.max(parseInt(offsetParam || '0', 10) || 0, 0);

    const supabase = getSupabaseAdmin();

    const {
      data,
      error,
      count,
    } = await supabase
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
          'source_url',
          'metadata',
        ].join(','),
        { count: 'exact' },
      )
      .eq('status', 'published')
      .eq('visibility', 'public')
      .order(
        'published_at',
        {
          ascending: false,
          nullsFirst: false,
        },
      )
      .range(offset, offset + limit - 1);

    if (error) {
      console.error(
        '[api/flow/items] database error:',
        error,
      );

      return NextResponse.json(
        {
          error: 'Failed to load Flow items.',
          details: error.message,
        },
        {
          status: 500,
        },
      );
    }

    const items = data ?? [];
    const totalCount = count ?? 0;
    const hasMore = totalCount > offset + items.length;

    return NextResponse.json(
      {
        items,
        hasMore,
        total: totalCount,
        nextOffset: offset + items.length,
      },
      {
        status: 200,
        headers: {
          'Cache-Control':
            'no-store, no-cache, must-revalidate',
        },
      },
    );
  } catch (error) {
    console.error(
      '[api/flow/items] unexpected error:',
      error,
    );

    return NextResponse.json(
      {
        error: 'Internal server error while loading Flow items.',
      },
      {
        status: 500,
      },
    );
  }
}
