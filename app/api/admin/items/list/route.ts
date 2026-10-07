import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const supabase = createClient({ useServiceRole: true });

    const { data, error } = await supabase
      .from('items')
      .select('*')
      .order('updated_at', { ascending: false })
      .limit(200);

    if (error) throw error;

    return NextResponse.json({ success: true, items: data ?? [] });
  } catch (error) {
    console.error('[admin-items-list]', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
