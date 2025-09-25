// app/api/generate-post/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. Инициализация клиентов
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
// Рекомендуем модель, способную обрабатывать сложные инструкции и, возможно, имеющую доступ к свежей информации
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });


// 2. Функция для форматирования даты
function getFormattedDate() {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, '0');
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const year = today.getFullYear();
    return `${day}.${month}.${year}`;
}

export async function POST(request: Request) {
  // 3. Защита эндпоинта
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const currentDate = getFormattedDate();
  const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
  const currentYear = new Date().getFullYear();

  // 4. Ваш промт, интегрированный в код
  // Динамически подставляем актуальную дату
  const prompt = `
    # Основная задача
    Создай ежедневный дайджест главных новостей искусства и культуры в формате телеграм-поста.

    # Требования к поиску новостей

    ## Временные рамки
    - Ищи новости только за последние 24 часа.
    - Используй текущую дату в поисковых запросах: ${currentDate}.
    - Приоритет отдавай событиям дня поиска.

    ## Источники для мониторинга (обязательные):
    The Guardian (Culture), The New York Times (Arts), The Art Newspaper, ARTNews, Le Monde (Culture), Le Figaro (Culture), The Washington Post (Arts), Artsy, Hyperallergic.

    ## Поисковые запросы
    Используй запросы вроде:
    - "${currentDate}" art culture news today
    - breaking art news today ${currentMonth} ${currentYear}
    - museum exhibition gallery news today
    - art auction culture events today ${currentDate}
    - artist death obituary today ${currentDate}

    # Критерии отбора новостей
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
    - Факты: цитируй только проверенные источники.
    - Количество новостей: от 5 до 7.
  `;

  try {
    // 5. Запрос к Gemini API
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const generatedContent = response.text();

    if (!generatedContent || generatedContent.length < 100) {
        throw new Error("AI response is empty or too short.");
    }

    // 6. Подготовка данных для сохранения в Supabase
    const dbTitle = `Дайджест новостей: ${currentDate}`;
    const dbSlug = `digest-${new Date().toISOString().split('T')[0]}`; // slug вида "digest-2025-09-25"

    const { data, error } = await supabase
      .from('digests') // <-- Сохраняем в новую таблицу 'digests'
      .insert([
        { 
          title: dbTitle, 
          content: generatedContent, // <-- Весь сгенерированный пост идет сюда
          slug: dbSlug, 
          status: 'draft' 
        }
      ])
      .select();

    if (error) {
      // Обработка возможной ошибки дублирования slug (если крон запустится дважды в день)
      if (error.code === '23505') { 
          console.warn(`Digest for ${dbSlug} already exists.`);
          return NextResponse.json({ success: false, message: 'Digest already exists' }, { status: 200 });
      }
      console.error('Supabase error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, digest: data });

  } catch (e) {
    console.error('Full cycle error:', e);
    return NextResponse.json({ error: 'Failed to generate or save digest' }, { status: 500 });
  }
}
