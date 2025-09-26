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
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });


// 2. Функция для форматирования даты
function getFormattedDate() {
    const today = new Date();
    const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric' };
    return new Intl.DateTimeFormat('ru-RU', options).format(today);
}

export async function POST(request: Request) {
  // 3. Защита эндпоинта
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const currentDate = getFormattedDate();
  const searchDate = new Date().toLocaleDateString('en-CA'); // Формат YYYY-MM-DD для поиска

  // 4. ОБНОВЛЕННЫЙ ПРОМТ
  const prompt = `
# Задача
Создай информационный дайджест из 5 главных новостей из мира искусства и культуры за последние 24 часа.
Результат должен быть отформатирован в виде чистого Markdown, без каких-либо вводных слов или комментариев.

# Требования к поиску
- **Период:** Только новости за последние 24 часа от текущей даты ${searchDate}.
- **Обязательные источники для мониторинга:** The Art Newspaper, ARTNews, Hyperallergic, Artsy, The Guardian (Culture), The New York Times (Arts).
- **Темы в приоритете:** Крупные выставки, арт-рынок (результаты аукционов), назначения в музеях, архитектурные проекты, скандалы в арт-мире, технологии в искусстве, важные события в кино и литературе.

# Структура и формат вывода (СТРОГО СЛЕДОВАТЬ)
Используй Markdown для форматирования: \`##\` для главного заголовка, \`###\` для подзаголовков новостей, \`**жирный шрифт**\` для акцентов и \`[текст](url)\` для ссылок.

## Новости от ${currentDate}

---

### [Эмодзи] [Заголовок новости]
Развернутое описание новости в 2-4 предложениях, раскрывающее суть события, его участников и значение. Текст должен быть информативным и емким.
**Источник:** [Название издания](прямая ссылка на статью)

(Повтори этот блок для каждой из 5 новостей. Между новостями вставляй разделитель \`---\`)

## Эмодзи для категорий:
- 🏛️ Музеи и галереи
- 🖼️ Выставки
- 💰 Арт-рынок и аукционы
- 🎭 Театр и кино
- 📚 Литература
- 🏗️ Архитектура
- 💔 Некрологи
- 💡 Технологии и ИИ в искусстве
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
    const dbTitle = `Новости от ${currentDate}`;
    const dbSlug = `digest-${new Date().toISOString().split('T')[0]}`;

    const { data, error } = await supabase
      .from('digests')
      .insert([
        { 
          title: dbTitle, 
          content: generatedContent,
          slug: dbSlug, 
          status: 'draft' 
        }
      ])
      .select();

    if (error) {
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
