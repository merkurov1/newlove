export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
export async function GET(req: Request) {
  try {
    const mod = await import('@/lib/supabase-server');
    const { getUserAndSupabaseFromRequest } = mod as any;
    const { user, supabase } = await getUserAndSupabaseFromRequest(req as Request);
    if (!user) return NextResponse.json({ isSubscribed: false });

    // Check subscribers table in Supabase for this user
    try {
      if (!supabase) return NextResponse.json({ isSubscribed: false });
      const { data, error } = await supabase.from('subscribers').select('id').eq('userId', (user as any).id).limit(1).maybeSingle();
      if (error) {
        console.error('Supabase query error', error);
        return NextResponse.json({ isSubscribed: false }, { status: 500 });
      }
      const isSubscribed = !!data;
      return NextResponse.json({ isSubscribed });
    } catch (e) {
      console.error('Error querying subscription', e);
      return NextResponse.json({ isSubscribed: false }, { status: 500 });
    }
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return NextResponse.json({ isSubscribed: false }, { status: 500 });
  }
}