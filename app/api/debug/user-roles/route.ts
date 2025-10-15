import { NextResponse } from 'next/server';
import { getServerSupabaseClient } from '@/lib/serverAuth';

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('user_id');
    if (!userId) return NextResponse.json({ error: 'user_id query param required' }, { status: 400 });

    // Try to use service-role client explicitly
    try {
      const supabase = getServerSupabaseClient({ useServiceRole: true });
      const res = await (supabase as any)
        .from('user_roles')
        .select('role_id,roles(name)')
        .eq('user_id', userId);
      return NextResponse.json({ data: res.data, error: res.error });
    } catch (e: any) {
      // If service role client is not available (env missing), return clear error
      return NextResponse.json({ error: 'service role client unavailable or failed', details: String(e) }, { status: 500 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
