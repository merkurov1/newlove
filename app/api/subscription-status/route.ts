export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
import { getUserAndSupabaseFromRequest } from '@/lib/supabase-server';

export async function GET(req: Request) {
  try {
    const { user, supabase } = await getUserAndSupabaseFromRequest(req);
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