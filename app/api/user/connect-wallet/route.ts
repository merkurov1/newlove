import { NextResponse } from 'next/server';
import { getUserAndSupabaseForRequest } from '@/lib/getUserAndSupabaseForRequest';

export async function POST(req: Request) {
    try {
        // Build cookie-aware Request for server helper
        const cookieHeader = req.headers.get('cookie') || '';
        const wrapped = new Request('http://localhost', { headers: { cookie: cookieHeader } });
        const ctx = await getUserAndSupabaseForRequest(wrapped) || {};
        const user = (ctx as any).user || null;
        if (!user || !user.id) return NextResponse.json({ error: 'unauthenticated' }, { status: 401 });

        const body = await req.json();
        const wallet = (body && body.wallet_address) ? String(body.wallet_address).toLowerCase() : null;
        if (!wallet) return NextResponse.json({ error: 'wallet_missing' }, { status: 400 });

        // Use service-role client to update DB safely
        const { getServerSupabaseClient } = await import('@/lib/serverAuth');
        const svc = getServerSupabaseClient({ useServiceRole: true });

        // Update users table wallet field if exists, and upsert into subscribers table (best-effort)
        try {
            await svc.from('users').update({ wallet }).eq('id', user.id);
        } catch (e) {
            // ignore update failures
            console.warn('connect-wallet: users update failed', e);
        }

        try {
            // Upsert subscribers with userId and wallet_address
            const up = { userId: user.id, wallet_address: wallet };
            await svc.from('subscribers').upsert(up, { onConflict: 'userId' });
        } catch (e) {
            // ignore
        }

        return NextResponse.json({ ok: true, wallet });
    } catch (err: any) {
        console.error('connect-wallet error', err);
        return NextResponse.json({ error: err?.message || String(err) }, { status: 500 });
    }
}
