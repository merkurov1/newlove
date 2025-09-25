import { NextResponse } from 'next/server';

export async function POST(request) {
  // 1. Получаем заголовок Authorization из запроса
  const authHeader = request.headers.get('authorization');

  // 2. Проверяем, совпадает ли токен с вашим секретом из переменных окружения
  //    Это более безопасный способ, чем вшивать ключ прямо в код.
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    // Если секрет неверный, возвращаем ошибку "Unauthorized"
    return new Response('Unauthorized', { status: 401 });
  }

  // 3. Если проверка пройдена, выполняем вашу логику
  try {
    // ===================================================
    // ⬇️ ЗДЕСЬ ВАША ЛОГИКА ДЛЯ CRON-ЗАДАНИЯ ⬇️
    // Например, обновление базы данных, отправка писем и т.д.
    console.log("Cron job executed successfully!");
    // ===================================================

    // Возвращаем успешный JSON-ответ
    return NextResponse.json({ success: true, message: "Cron job executed" });

  } catch (error) {
    // В случае ошибки в вашей логике, возвращаем ошибку сервера
    console.error("Cron job failed:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
