// ===== ФАЙЛ: app/api/letters/route.ts =====
// (ПОЛНЫЙ ЧИСТЫЙ КОД С НОВОЙ ЛОГИКОЙ)

import { createClient } from '@/lib/supabase/server';
import buildSafeDebug from '@/lib/debug';
import { NextResponse } from 'next/server';

// safeStringify: convert unknown values to a safe JSON-friendly string,
// avoid throwing on circular structures and limit size to avoid truncation.
function safeStringify(obj: any, maxLen = 2000) {
	try {
		const seen = new WeakSet();
		const s = JSON.stringify(obj, function (k, v) {
			if (v && typeof v === 'object') {
				if (seen.has(v)) return '[Circular]';
				seen.add(v);
			}
			if (typeof v === 'bigint') return String(v);
			return v;
		});
		if (s.length > maxLen) return s.slice(0, maxLen) + '...';
		return s;
	} catch (e) {
		try { return String(obj); } catch { return 'unserializable'; }
	}
}

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
		// Include debug when explicitly enabled or when ?debug=1 is passed.
		const url = new URL(request.url);
		const includeDebugForRequest = debugEnabled || url.searchParams.get('debug') === '1';
		const headerSnapshot = {
			host: request.headers.get('host') || undefined,
			userAgent: request.headers.get('user-agent') || undefined,
			cookiePresent: hasCookies,
		};
		// Use Supabase REST endpoint with anon key to avoid server SDK/cookie issues.
		try {
			const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
			const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_KEY || '';
			if (!supabaseUrl || !anonKey) {
				const outDebug = buildSafeDebug(request, { errors: ['missing env'] });
				return NextResponse.json({ error: 'Supabase env missing', debug: includeDebugForRequest ? outDebug : undefined }, { status: 500 });
			}

			const base = supabaseUrl.replace(/\/$/, '');
			const select = encodeURIComponent('id,title,slug,published,publishedAt,createdAt,authorId');
			const url = `${base}/rest/v1/letters?select=${select}&published=eq.true&order=publishedAt.desc&limit=100`;

			const res = await fetch(url, {
				headers: {
					apikey: anonKey,
					Authorization: `Bearer ${anonKey}`,
					Accept: 'application/json'
				}
			});

			const text = await res.text();
			let parsedBody: any = null;
			try { parsedBody = JSON.parse(text); } catch { parsedBody = text; }

			if (!res.ok) {
				const outDebug = buildSafeDebug(request, { restStatus: res.status, restBody: parsedBody, errors: [String(res.status)] });
				console.error('letters REST error', res.status, parsedBody);

				// If anon REST is forbidden (401) or otherwise fails, attempt a
				// server-side service-role query as a fallback so public archive
				// remains available.
				try {
					const svc = createClient({ useServiceRole: true });
					const { data: svcData, error: svcErr } = await svc
						.from('letters')
						.select('id,title,slug,published,publishedAt,createdAt,authorId')
						.eq('published', true)
						.order('publishedAt', { ascending: false })
						.limit(100);
					if (svcErr) {
						console.error('letters service-role fallback error', svcErr);
						const svcDebug = buildSafeDebug(request, { errors: [String(svcErr)], restStatus: res.status });
						return NextResponse.json({ error: 'Failed to fetch letters', debug: includeDebugForRequest ? svcDebug : undefined }, { status: 500 });
					}
					const letters = svcData || [];
					const mergedDebug = includeDebugForRequest ? buildSafeDebug(request, { restStatus: res.status, restBody: { itemCount: Array.isArray(letters) ? letters.length : 0 }, errors: ['anon_rest_failed_used_service_role'] }) : undefined;
					return NextResponse.json({ letters, debug: mergedDebug });
				} catch (svcE) {
					console.error('letters service-role fallback threw', svcE);
					const svcDebug = buildSafeDebug(request, { errors: [String(svcE)], restStatus: res.status });
					return NextResponse.json({ error: 'Failed to fetch letters', debug: includeDebugForRequest ? svcDebug : undefined }, { status: 500 });
				}
			}

			// success - ensure we return an array of items only
			const letters = Array.isArray(parsedBody) ? parsedBody : [];
			const outDebug = includeDebugForRequest ? buildSafeDebug(request, { restStatus: res.status, restBody: { itemCount: letters.length } }) : undefined;
			return NextResponse.json({ letters, debug: outDebug });

		} catch (e) {
			console.error('letters REST final failure', e);
			const outDebug = buildSafeDebug(request, { errors: [String(e)] });
			return NextResponse.json({ error: 'Failed to fetch letters', debug: includeDebugForRequest ? outDebug : undefined }, { status: 500 });
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
