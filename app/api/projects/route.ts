export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getUserAndSupabaseFromRequest } from '@/lib/supabase-server';

export async function GET() {
  try {
    const { supabase } = await getUserAndSupabaseFromRequest(new Request('http://localhost'));
    if (!supabase) return NextResponse.json({ success: true, count: 0, projects: [] });

    const { data: projects, error } = await supabase.from('project').select('id,title,slug,published').order('createdAt', { ascending: false });
    if (error) {
      console.error('Supabase fetch projects error', error);
      return NextResponse.json({ success: false, error: error.message });
    }

    return NextResponse.json({ success: true, count: (projects || []).length, projects });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) });
  }
}