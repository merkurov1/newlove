// ===== ФАЙЛ: app/api/letters/route.ts =====
// (ВОЗВРАЩАЕМ ОРИГИНАЛЬНЫЙ КОД)

export async function GET(request: Request) {
	try {
		// Prefer service-role server client for public reads to avoid RLS surprises
		let supabase: any = null;
		try {
			const { getServerSupabaseClient } = await import('@/lib/serverAuth');
			supabase = getServerSupabaseClient({ useServiceRole: true });
		} catch (e) {
			// Fallback to request-scoped client
			try {
				const { getSupabaseForRequest } = await import('@/lib/getSupabaseForRequest');
				supabase = (await getSupabaseForRequest(request))?.supabase;
			} catch (err) {
				supabase = null;
			}
		}

		if (!supabase) {
			return new Response(JSON.stringify({ letters: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
		}

		// Fetch published letters. Try plural table name `letters` (matches migrations/dumps).
		const { data, error } = await supabase
			.from('letters')
			.select('id,title,slug,published,publishedAt,createdAt,author:authorId(name)')
			.eq('published', true)
			.order('publishedAt', { ascending: false })
			.limit(100);

		if (error) {
			console.error('Failed to fetch letters', error);
			return new Response(JSON.stringify({ letters: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
		}

		return new Response(JSON.stringify({ letters: data || [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
	} catch (e) {
		console.error('letters API error', e);
		return new Response(JSON.stringify({ letters: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
	}
}

export async function POST(request: Request) {
	// Placeholder implementation during migration.
	const body = await request.text();
	return new Response(JSON.stringify({ ok: true, received: body }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}

export function OPTIONS() {
	return new Response(null, { status: 204 });
}
