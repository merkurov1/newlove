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

    // The postcards -> orders relation in the DB is implemented via the
    // `postcard_orders` table (see migrations). Use a proper relationship
    // selection or an aggregate subquery. We'll select the postcards and
    // include a count of related orders via the `postcard_orders` table.
    const { data: postcards, error } = await supabase
      .from('postcards')
      .select('*, postcard_orders:postcard_orders(count)')
      .order('createdAt', { ascending: false });
    if (error) {
      console.error('Error fetching postcards from Supabase', error);
      return NextResponse.json({ error: 'Ошибка при загрузке открыток' }, { status: 500 });
    }

    return NextResponse.json({ postcards });
  } catch (error) {
    console.error('Error fetching postcards:', error);
    return NextResponse.json({ error: 'Ошибка при загрузке открыток' }, { status: 500 });
  }
}