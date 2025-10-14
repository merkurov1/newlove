export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
export async function GET() {
  try {
    let supabase;
    try {
      const { getUserAndSupabaseForRequest } = await import('@/lib/getUserAndSupabaseForRequest');
      supabase = (await getUserAndSupabaseForRequest(new Request('http://localhost')))?.supabase;
    } catch (e) {
      // Fallback to server client
      const { getServerSupabaseClient } = await import('@/lib/serverAuth');
      try { supabase = getServerSupabaseClient(); } catch (err) { supabase = null; }
    }
    if (!supabase) return NextResponse.json({ success: true, count: 0, projects: [] });

  const { data: projects, error } = await supabase.from('projects').select('id,title,slug,published').order('createdAt', { ascending: false });
    if (error) {
      console.error('Supabase fetch projects error', error);
      return NextResponse.json({ success: false, error: error.message });
    }

    return NextResponse.json({ success: true, count: (projects || []).length, projects });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
}