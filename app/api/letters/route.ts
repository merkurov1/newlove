// ===== ФАЙЛ: app/api/letters/route.ts =====
// (ПОЛНЫЙ ЧИСТЫЙ КОД С НОВОЙ ЛОГИКОЙ)

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

// Заставляем этот маршрут всегда выполняться динамически
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
	try {
		// 1. Создаем ОБЫЧНЫЙ клиент, чтобы проверить, кто пользователь
		const supabaseUserClient = createClient();
		const { data: { user } } = await supabaseUserClient.auth.getUser();
		const isAdmin = user && (String((user.user_metadata || {}).role || user.role || '').toUpperCase() === 'ADMIN');

		// 2. Создаем SERVICE_ROLE клиент, чтобы читать данные
		const supabaseService = createClient({ useServiceRole: true });

		// 3. Создаем запрос с помощью service-клиента
		let query = supabaseService
			.from('letters')
			.select('id,title,slug,published,publishedAt,createdAt,author:authorId(name)')
			.order('publishedAt', { ascending: false })
			.limit(100);

		// 4. Если пользователь НЕ админ, показываем только опубликованные
		if (!isAdmin) {
			query = query.eq('published', true);
		}

		const { data, error } = await query;

		if (error) {
			console.error('Failed to fetch letters (service client)', error);
			return NextResponse.json({ error: 'Failed to fetch letters' }, { status: 500 });
		}

		return NextResponse.json({ letters: data || [] });

	} catch (e) {
		console.error('letters API error', e);
		return NextResponse.json({ error: String(e) }, { status: 500 });
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
