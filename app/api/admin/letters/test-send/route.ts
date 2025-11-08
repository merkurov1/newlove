// ===== ФАЙЛ: app/api/admin/letters/test-send/route.ts =====
// (ПОЛНЫЙ ЧИСТЫЙ КОД С ИСПРАВЛЕНИЯМИ)
// @ts-nocheck
import { NextResponse } from 'next/server';
import { sendNewsletterToSubscriber } from '@/lib/newsletter/sendNewsletterToSubscriber';
import { requireAdminFromRequest } from '@/lib/serverAuth'; // Импортируем для проверки прав
import { cookies } from 'next/headers';

// NOTE: `dynamic` is already exported above; avoid duplicate exports
// -----------------------------------------------------------------
// НОВЫЙ POST ОБРАБОТЧИК (для кнопки в админке)
// -----------------------------------------------------------------
export async function POST(req: Request) {
  try {
    // 1. Проверяем, что запрос делает администратор
    const buildRequest = () => {
        const cookieHeader = cookies()
          .getAll()
          .map((c: any) => `${c.name}=${encodeURIComponent(c.value)}`)
          .join('; ');
        return new Request(req.url, { headers: { cookie: cookieHeader } });
    };
    await requireAdminFromRequest(buildRequest());
    
    // 2. Получаем title и content из формы
    const body = await req.json();
    const { title, content } = body;

    if (!title || !content) {
      return NextResponse.json({ ok: false, error: 'Title and content are required' }, { status: 400 });
    }

    // 3. Используем тестовые данные для подписчика
    const email = 'merkurov@gmail.com'; // Ваш email для тестов
    const testSubscriber = { id: 'test-admin-subscriber', email };
    
    // 4. Создаем письмо с РЕАЛЬНЫМ контентом из формы
    const testLetter = {
      title: `[Тест] ${title}`,
      content: content,
    };

    // 5. Отправляем письмо
    // Функция сама найдет RESEND_API_KEY в process.env
  // For test sends we avoid modifying subscriber_tokens in the DB.
  const result = await sendNewsletterToSubscriber(testSubscriber, testLetter, { skipTokenInsert: true });

    if (result.status === 'sent' || result.status === 'skipped') {
      const message = result.status === 'skipped' 
        ? '✅ Dry-run (ключ RESEND не найден), но логика отработала'
        : `✅ Тестовое письмо успешно отправлено на ${email}`;
      return NextResponse.json({ ok: true, message, result });
    } else {
      // Если sendNewsletterToSubscriber вернул 'error'
      return NextResponse.json({ ok: false, error: result.error || 'Unknown send error', result }, { status: 500 });
    }

  } catch (err: any) {
    console.error('test-send POST error', (err && err.stack) || String(err));
    // Если упала проверка прав админа или другая ошибка
    const errorMessage = err.message === 'Unauthorized' ? 'Ошибка: нет прав администратора.' : err?.message || String(err);
    const status = err.message === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ ok: false, error: errorMessage }, { status });
  }
}


// -----------------------------------------------------------------
// СТАРЫЙ GET ОБРАБОТЧИК (оставляем его для отладки по URL)
// -----------------------------------------------------------------
export async function GET(req: Request) {
  try {
    // Hardcoded test address per request
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
    console.error('test-send GET error', (err && err.stack) || String(err));
    return NextResponse.json({ ok: false, error: err?.message || String(err) }, { status: 500 });
  }
}

export const dynamic = 'force-dynamic';
