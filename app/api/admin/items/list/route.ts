import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireAdminFromRequest } from '@/lib/serverAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    await requireAdminFromRequest(req);

    const supabase = createClient({
      useServiceRole: true,
    });

    const { data: items, error } = await supabase
      .from('items')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      items: items ?? [],
    });
  } catch (error) {
    console.error('[admin-items-list]', error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Unauthorized',
      },
      { status: 401 }
    );
  }
}