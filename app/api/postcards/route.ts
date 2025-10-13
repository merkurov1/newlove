import { NextResponse } from 'next/server';

export async function GET() {
  try {
    // For build-time/export operations use the server service-role client directly
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    let supabase;
    try {
      supabase = getServerSupabaseClient();
    } catch (e) {
      console.error('Unable to create server supabase client in postcards route', e);
      return NextResponse.json({ postcards: [] });
    }

  // Use canonical plural table name so PostgREST can detect foreign-key relationships
  // The orders for postcards are stored in `postcard_orders` (FK postcard_orders.postcardId -> postcards.id)
  const { data: postcards, error } = await supabase.from('postcards').select('*, postcard_orders(count)').order('createdAt', { ascending: false });
    if (error) {
      // If the postcards table/schema isn't available during build, return an empty list
      // instead of failing the build. This keeps previews and CI stable.
      console.warn('Error fetching postcards from Supabase (falling back to empty):', error?.message || error);
      return NextResponse.json({ postcards: [] });
    }

    return NextResponse.json({ postcards: postcards || [] });
  } catch (error) {
    console.error('Error fetching postcards:', error);
    return NextResponse.json({ error: 'Ошибка при загрузке открыток' }, { status: 500 });
  }
}