// ===== ФАЙЛ: app/api/letters/route.ts =====
// (ПОЛНЫЙ ЧИСТЫЙ КОД С НОВОЙ ЛОГИКОЙ)

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Заставляем этот маршрут всегда выполняться динамически
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
	// Try to use service-role client first; if it fails (missing key or permissions),
	// fall back to anon client and return only published letters. Include debug info
	// when running in development or when fallback occurs so the page can display it.
	const debugEnabled = process.env.NEXT_PUBLIC_DEBUG === 'true' || process.env.NODE_ENV !== 'production';
	let debug: any = null;

	try {
		// 1. Build viewer context to check admin status if possible
		let isAdmin = false;
		try {
			const supabaseUserClient = createClient();
			const { data: { user } } = await supabaseUserClient.auth.getUser();
			isAdmin = !!(user && (String((user.user_metadata || {}).role || user.role || '').toUpperCase() === 'ADMIN'));
		} catch (e) {
			// ignore viewer lookup failures; treat as non-admin
			if (debugEnabled) debug = { ...(debug || {}), viewerError: String(e) };
		}

		// 2. Attempt with service-role client
		try {
			const supabaseService = createClient({ useServiceRole: true });
			let query = supabaseService
				.from('letters')
				.select('id,title,slug,published,publishedAt,createdAt,author:authorId(name)')
				.order('publishedAt', { ascending: false })
				.limit(100);

			if (!isAdmin) query = query.eq('published', true);

			const { data, error } = await query;
			if (error) throw error;
			return NextResponse.json({ letters: data || [] });
		} catch (svcErr) {
			// record and fall back to anon client
			if (debugEnabled) debug = { ...(debug || {}), serviceRoleError: String(svcErr) };
		}

		// 3. Fallback: use anon client and only select minimal fields (published only)
		try {
			const anon = createClient();
			const { data, error } = await anon
				.from('letters')
				.select('id,title,slug,published,publishedAt,createdAt,author:authorId(name)')
				.eq('published', true)
				.order('publishedAt', { ascending: false })
				.limit(100);
			if (error) throw error;
			return NextResponse.json({ letters: data || [], debug: debugEnabled ? debug : undefined });
		} catch (anonErr) {
			// final failure
			if (debugEnabled) debug = { ...(debug || {}), anonError: String(anonErr) };
			console.error('letters API final failure', debug || anonErr);
			return NextResponse.json({ error: 'Failed to fetch letters', debug: debugEnabled ? debug : undefined }, { status: 500 });
		}

	} catch (e) {
		console.error('letters API unexpected error', e);
		return NextResponse.json({ error: String(e), debug: debugEnabled ? (debug || String(e)) : undefined }, { status: 500 });
	}
}

// ... (POST и OPTIONS остаются как были)
export async function POST(request: Request) {
	const body = await request.text();
	return new Response(JSON.stringify({ ok: true, received: body }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}
export function OPTIONS() {
	return new Response(null, { status: 204 });
}
