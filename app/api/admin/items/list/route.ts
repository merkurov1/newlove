import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { isAuthenticationError } from '@/lib/auth/errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  // Authentication is deliberately separate from the query below. Expected
  // unauthenticated polling must stay a quiet 401 security event instead of a
  // runtime error, while database failures must not be disguised as 401.
  try {
    await requireAdminFromRequest(req);
  } catch (error) {
    if (isAuthenticationError(error)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    console.error('[admin-items-list] auth check failed:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to authorize request.',
      },
      { status: 500 }
    );
  }

  try {
    const supabase = await createClient({
      useServiceRole: true,
    });

    const { data: items, error } = await supabase
      .from('items')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[admin-items-list] database error:', error);

      return NextResponse.json(
        {
          success: false,
          error: 'Failed to load items.',
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      items: items ?? [],
    });
  } catch (error) {
    console.error('[admin-items-list] unexpected error:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Failed to load items.',
      },
      { status: 500 }
    );
  }
}
