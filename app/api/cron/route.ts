// app/api/generate-post/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

// 🛡️ 1. Проверка переменных окружения на старте
// Это позволяет избежать ошибок во время выполнения, если какая-то переменная отсутствует.
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEMINI_KEY = process.env.GEMINI_API_KEY;
const CRON_SECRET = process.env.CRON_SECRET;

if (!SUPABASE_URL || !SUPABASE_KEY || !GEMINI_KEY || !CRON_SECRET) {
  throw new Error("Missing required environment variables.");
}

// 2. Инициализация клиентов
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const genAI = new GoogleGenerativeAI(GEMINI_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

// 📄 3. Функция для создания промта (рефакторинг)
// Выносим большой текст в отдельную функцию для чистоты и читаемости кода.
function createDigestPrompt(currentDate: string, currentMonth: string, currentYear: number): string {
  return `
    # Основная задача
    Ты — ИИ-ассистент, анализирующий мировые новости в сфере искусства. 
    Создай ежедневный дайджест главных новостей искусства и культуры в формате поста для Telegram.

    # Требования к анализу новостей

    ## Временные рамки
    - Анализируй события, произошедшие за последние 24-48 часов.
    - Текущая дата для контекста: ${currentDate}.

    ## Источники для анализа (основывайся на знаниях о публикациях из этих изданий):
    The Guardian (Culture), The New York Times (Arts), The Art Newspaper, ARTNews, Le Monde (Culture), Le Figaro (Culture), The Washington Post (Arts), Artsy, Hyperallergic.

    ## Критерии отбора новостей
    Приоритетные темы: Музейные события, Арт-рынок, Смерти знаменитостей, Скандалы и противоречия, Крупные назначения, Архитектура, Литература, Кино и театр, Технологии в искусстве.
    Критерии важности: Международная значимость, упоминание в нескольких источниках, финансовая значимость, культурное влияние, социальный резонанс.

    # Структура поста
    Выведи результат в строгом соответствии с этим форматом, без каких-либо комментариев до или после.

    🎨 **ИСКУССТВО И КУЛЬТУРА** | ${currentDate}
    📰 **ГЛАВНОЕ ЗА ДЕНЬ:**

    [эмодзи] **[Заголовок новости]**
    [Краткое описание в 1-2 предложениях с ключевыми деталями]
    📍 *[Источник]*

    (Повтори этот блок для 5-7 новостей)

    ## Эмодзи для категорий:
    - 🏛️ Музеи и галереи
    - 🖼️ Выставки и экспозиции
    - 💰 Арт-рынок и аукционы
    - 🎭 Театр и перформанс
    - 🎬 Кино и документальные фильмы
    - 📚 Литература
    - 🏗️ Архитектура и дизайн
    - 💔 Некрологи
    - ⚖️ Правовые споры
    - 💡 Технологии в искусстве

    # Завершение поста
    ---
    🔗 Источники: [список использованных источников]
    📲 *Подписывайтесь на канал культурных новостей*

    # Требования к качеству
    - Стиль: лаконичный, информативный, нейтральный.
    - Факты: используй только проверенную информацию из своей базы знаний.
    - Количество новостей: от 5 до 7.
  `;
}

// 🚀 4. Основная функция API
export async function POST(request: Request) {
  // Защита эндпоинта
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    // Подготовка дат
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const monthNum = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    const monthName = today.toLocaleString('en-US', { month: 'long' });
    const formattedDate = `${day}.${monthNum}.${year}`;

    // Создание промта
    const prompt = createDigestPrompt(formattedDate, monthName, year);

    // Запрос к Gemini API
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const generatedContent = response.text();

    // ✔️ Более надежная валидация ответа
    if (!generatedContent || !generatedContent.includes('ГЛАВНОЕ ЗА ДЕНЬ:')) {
        throw new Error("AI response is empty or doesn't match the required format.");
    }

    // Подготовка данных для сохранения в Supabase
    const dbTitle = `Дайджест новостей: ${formattedDate}`;
    const dbSlug = `digest-${year}-${monthNum}-${day}`; 

    const { data, error } = await supabase
      .from('digests')
      .insert({ 
          title: dbTitle, 
          content: generatedContent,
          slug: dbSlug, 
          status: 'draft' 
      })
      .select()
      .single(); // Используем .single() для получения одного объекта вместо массива

    if (error) {
      if (error.code === '23505') { 
          console.warn(`Digest for ${dbSlug} already exists.`);
          return NextResponse.json({ success: true, message: 'Digest already exists, operation skipped' });
      }
      throw error; // Передаем ошибку в главный catch блок
    }

    return NextResponse.json({ success: true, digest: data });

  } catch (e: any) {
    console.error('Full cycle error:', e);
    // Проверяем, является ли ошибка ошибкой Supabase для более детального ответа
    const errorMessage = e.message || 'Failed to generate or save digest';
    return NextResponse.json({ error: errorMessage }, { status: 500 });
  }
}
