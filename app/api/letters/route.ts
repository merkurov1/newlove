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
	// initialize debug as an object to avoid runtime TypeErrors when spreading
	let debug: Record<string, any> = {};

	try {
		// If the incoming request includes cookies (likely a logged-in user),
		// we want to return minimal debug info back so the archive UI can show
		// why the service/anon path was selected or what error happened.
		const hasCookies = Boolean(request.headers.get('cookie'));
		// Always include debug info in the response body so users without DevTools
		// can see what's happening. We still avoid printing secrets, but include
		// the captured errors and a small header snapshot for diagnosis.
		const includeDebugForRequest = true;
		const headerSnapshot = {
			host: request.headers.get('host') || undefined,
			userAgent: request.headers.get('user-agent') || undefined,
			cookiePresent: hasCookies,
		};
		// For the public archive we always use the anon client. This avoids
		// cookie/session-related failures for logged-in users and keeps the
		// behaviour identical between guests and authenticated visitors.
		try {
			const anon = createClient();
			const { data, error } = await anon
				.from('letters')
				.select('id,title,slug,published,publishedAt,createdAt,author:authorId(name)')
				.eq('published', true)
				.order('publishedAt', { ascending: false })
				.limit(100);
			if (error) {
				if (debugEnabled) debug = { ...(debug || {}), anonError: String(error) };
				console.error('letters API anon query error', error);
				return NextResponse.json({ error: 'Failed to fetch letters', debug: includeDebugForRequest ? { headerSnapshot, ...(debug || {}) } : undefined }, { status: 500 });
			}
			return NextResponse.json({ letters: data || [], debug: includeDebugForRequest ? { headerSnapshot, ...(debug || {}) } : undefined });
		} catch (anonErr) {
			if (debugEnabled) debug = { ...(debug || {}), anonError: String(anonErr) };
			console.error('letters API final failure', anonErr);
			return NextResponse.json({ error: 'Failed to fetch letters', debug: includeDebugForRequest ? { headerSnapshot, ...(debug || {}) } : undefined }, { status: 500 });
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
