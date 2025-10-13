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

    const { data: postcards, error } = await supabase.from('postcard').select('*, orders(count)').order('createdAt', { ascending: false });
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