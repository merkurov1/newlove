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

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();

    const {
      data,
      error,
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
        ].join(','),
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
      .limit(100);

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

    return NextResponse.json(
      {
        items: data ?? [],
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
        error:
          error instanceof Error
            ? error.message
            : 'Failed to load Flow items.',
      },
      {
        status: 500,
      },
    );
  }
}