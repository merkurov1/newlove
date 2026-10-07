import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function POST(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient({ useServiceRole: true });

    const { data: item, error } = await supabase
      .from('items')
      .update({
        status: 'published',
        visibility: 'public',
        published_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', params.id)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.redirect(new URL(`/admin/items/${params.id}`, 'http://localhost:3000'));
  } catch (error) {
    console.error('[admin-item-publish]', error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
