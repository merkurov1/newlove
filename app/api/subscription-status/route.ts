export const dynamic = 'force-dynamic';
import { NextResponse } from 'next/server';
export async function GET(req: Request) {
  try {
    // Load the request-bound helper only to resolve the current user from cookies.
    const mod = await import('@/lib/supabase-server');
    const getUserAndSupabaseFromRequest = (mod as any).getUserAndSupabaseFromRequest || (mod as any).default;
    const { user } = await getUserAndSupabaseFromRequest(req as Request);
    if (!user) return NextResponse.json({ isSubscribed: false });

    // Use the server service-role client for DB reads/writes. This avoids
    // relying on a request-scoped client for queries and is safer for server
    // routes and background tasks.
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const serverSupabase = getServerSupabaseClient();

    try {
      const { data, error } = await serverSupabase
        .from('subscribers')
        .select('id')
        .eq('userId', (user as any).id)
        .limit(1)
        .maybeSingle();
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