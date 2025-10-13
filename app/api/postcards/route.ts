import { NextResponse } from 'next/server';
import { getUserAndSupabaseFromRequest } from '@/lib/supabase-server';

export async function GET() {
  try {
    const { supabase } = await getUserAndSupabaseFromRequest(new Request('http://localhost'));
    if (!supabase) return NextResponse.json({ postcards: [] });

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