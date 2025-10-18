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
		const supabase = createServerClient(cookieStore);

		// 1. Проверяем, залогинен ли пользователь
		const { data: { user } } = await supabase.auth.getUser();
		const isAdmin = user && (String((user.user_metadata || {}).role || user.role || '').toUpperCase() === 'ADMIN');

		// 2. Создаем запрос
		let query = supabase
			.from('letters')
			.select('id,title,slug,published,publishedAt,createdAt,author:authorId(name)')
			.order('publishedAt', { ascending: false })
			.limit(100);

		// 3. Если пользователь НЕ админ, показываем только опубликованные
		if (!isAdmin) {
			query = query.eq('published', true);
		}
		// (Если пользователь - админ, он увидит все письма)

		const { data, error } = await query;

		if (error) {
			console.error('Failed to fetch letters', error);
			// Возвращаем ошибку, а не пустой массив
			return new Response(JSON.stringify({ error: 'Failed to fetch' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
		}

		return NextResponse.json({ letters: data || [] });

	} catch (e) {
		console.error('letters API error', e);
		return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { 'Content-Type': 'application/json' } });
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
