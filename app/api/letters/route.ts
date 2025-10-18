// ===== ФАЙЛ: app/api/letters/route.ts =====
// (ПОЛНЫЙ ЧИСТЫЙ КОД)

import { createServerClient } from '@/lib/supabase/server';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

// Заставляем этот маршрут всегда выполняться динамически
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
	try {
		const cookieStore = cookies();
		
		// 1. Используем СРАЗУ service-role клиент,
        //    как в твоем оригинальном файле
		const supabase = createServerClient(cookieStore, { useServiceRole: true });

		// 2. Создаем запрос (только опубликованные, как в оригинале)
		const { data, error } = await supabase
			.from('letters')
			.select('id,title,slug,published,publishedAt,createdAt,author:authorId(name)')
			.eq('published', true) // <-- Только опубликованные
			.order('publishedAt', { ascending: false })
			.limit(100);

		if (error) {
			console.error('Failed to fetch letters (service client)', error);
			return new Response(JSON.stringify({ error: 'Failed to fetch letters' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
		}

		return NextResponse.json({ letters: data || [] });

	} catch (e) {
		console.error('letters API error', e);
		return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
	}
}


export async function POST(request: Request) {
	// Placeholder
	const body = await request.text();
	return new Response(JSON.stringify({ ok: true, received: body }), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
	});
}

export function OPTIONS() {
	return new Response(null, { status: 204 });
}
