// ===== ФАЙЛ: app/api/admin/letters/test-send/route.ts =====
import { NextResponse } from 'next/server';
import { sendNewsletterToSubscriber } from '@/lib/newsletter/sendNewsletterToSubscriber';
import { requireAdminFromRequest } from '@/lib/serverAuth';
import { cookies } from 'next/headers';

export const dynamic = 'force-dynamic';

// -----------------------------------------------------------------
// POST ОБРАБОТЧИК (для кнопки тестовой рассылки в админке)
// -----------------------------------------------------------------
export async function POST(req: Request) {
  try {
    // 1. Корректно асинхронно получаем куки для проверки прав администратора (Next.js 15)
    const cookieStore = await cookies();
    const cookieHeader = cookieStore
      .getAll()
      .map((c) => `${c.name}=${encodeURIComponent(c.value)}`)
      .join('; ');

    const authRequest = new Request(req.url, { headers: { cookie: cookieHeader } });
    await requireAdminFromRequest(authRequest);
    
    // 2. Получаем title и content из формы
    const body = await req.json();
    const { title, content } = body;

    if (!title || !content) {
      return NextResponse.json({ ok: false, error: 'Title and content are required' }, { status: 400 });
    }

    // 3. Используем email автора/администратора для тестов
    const email = 'merkurov@gmail.com';
    const testSubscriber = { id: 'test-admin-subscriber', email };
    
    // 4. Формируем тестовое письмо
    const testLetter = {
      title: `[Тест] ${title}`,
      content: content,
    };

    // 5. Отправляем письмо через Resend (пропуская запись токенов отписки в БД)
    const result = await sendNewsletterToSubscriber(testSubscriber, testLetter, { skipTokenInsert: true });

    if (result.status === 'sent' || result.status === 'skipped') {
      const message = result.status === 'skipped' 
        ? '✅ Dry-run (ключ RESEND не найден), логика отработала успешно'
        : `✅ Тестовое письмо успешно отправлено на ${email}`;
      return NextResponse.json({ ok: true, message, result });
    } else {
      return NextResponse.json({ ok: false, error: result.error || 'Unknown send error', result }, { status: 500 });
    }

  } catch (err: any) {
    console.error('test-send POST error:', err?.stack || String(err));
    const errorMessage = err.message === 'Unauthorized' ? 'Ошибка: нет прав администратора.' : err?.message || String(err);
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, error: errorMessage }, { status });
  }
}

// -----------------------------------------------------------------
// GET ОБРАБОТЧИК (для отладки по URL)
// -----------------------------------------------------------------
export async function GET(req: Request) {
  try {
    const email = 'merkurov@gmail.com';
    const testSubscriber = { id: 'test-subscriber', email };
    const testLetter = {
      title: 'Test newsletter from local environment (GET)',
      content: [{ type: 'richText', data: { html: `<p>This is a test preview of the newsletter HTML.</p>` } }],
    };

    const url = new URL(req.url);
    const key = url.searchParams.get('key') || undefined;

    if (!process.env.RESEND_API_KEY && !key) {
      const result = await sendNewsletterToSubscriber(testSubscriber, testLetter, { resendApiKey: undefined, skipTokenInsert: true });
      return NextResponse.json({ ok: true, dryRun: true, message: 'RESEND_API_KEY not configured. Dry-run performed.', result });
    }

    const result = await sendNewsletterToSubscriber(testSubscriber, testLetter, { resendApiKey: key, skipTokenInsert: true });
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    console.error('test-send GET error:', err?.stack || String(err));
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}
