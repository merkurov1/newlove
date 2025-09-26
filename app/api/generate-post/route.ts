// app/api/generate-post/route.ts
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from "@google/generative-ai";

// 1. Инициализация клиентов (без изменений)
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

// 2. Функция для форматирования даты (без изменений)
function getFormattedDate() {
    const today = new Date();
    const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'long', year: 'numeric' };
    return new Intl.DateTimeFormat('ru-RU', options).format(today);
}

/**
 * НОВАЯ ФУНКЦИЯ: Сбор новостей
 * Здесь должна быть ваша логика для получения данных.
 * Это пример с использованием NewsAPI.
 * Вам нужно будет установить 'newsapi' клиент: npm install newsapi
 */
async function fetchNewsFromSources(): Promise<string> {
    // ВАЖНО: Добавьте NEWS_API_KEY в ваши переменные окружения (.env.local)
    const newsApiKey = process.env.NEWS_API_KEY;
    if (!newsApiKey) {
        throw new Error("NEWS_API_KEY is not set in environment variables");
    }
    
    // Источники, которые мы мониторим. Используем домены для NewsAPI.
    const sources = 'the-new-york-times, the-guardian-uk, hyperallergic.com, artnews.com'; // Artsy и The Art Newspaper могут не поддерживаться напрямую, проверьте документацию NewsAPI

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    try {
        // Замените этот URL на реальный вызов SDK или fetch к NewsAPI
        const response = await fetch(
            `https://newsapi.org/v2/everything?q=art+OR+culture+OR+museum&domains=${sources}&from=${twentyFourHoursAgo}&sortBy=publishedAt&language=en&apiKey=${newsApiKey}`
        );
        const newsData = await response.json();

        if (newsData.status !== 'ok' || newsData.articles.length === 0) {
            console.warn('No articles found or API error:', newsData);
            return "Новостей для обработки не найдено.";
        }
        
        // Форматируем найденные статьи в простой текстовый формат для передачи в AI
        return newsData.articles
            .slice(0, 15) // Берем с запасом, чтобы AI было из чего выбрать
            .map((article: any) => 
                `###\nTITLE: ${article.title}\nURL: ${article.url}\nSOURCE: ${article.source.name}\nCONTENT: ${article.description || article.content || ''}\n###`
            )
            .join('\n\n');

    } catch (error) {
        console.error("Failed to fetch news:", error);
        return "Произошла ошибка при сборе новостей.";
    }
}


export async function POST(request: Request) {
  // 3. Защита эндпоинта (без изменений)
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // --- ШАГ 1: СБОР ДАННЫХ ---
  const rawNewsContent = await fetchNewsFromSources();
  if (rawNewsContent.includes("Новостей для обработки не найдено") || rawNewsContent.includes("ошибка при сборе")) {
      return NextResponse.json({ success: false, message: 'Could not fetch news to process.' }, { status: 500 });
  }

  // --- ШАГ 2: ОБРАБОТКА ДАННЫХ С ПОМОЩЬЮ AI ---
  const currentDate = getFormattedDate();

  // 4. ОБНОВЛЕННЫЙ ПРОМТ
  const prompt = `
# Задача
Ты — редактор арт-дайджеста. Проанализируй предоставленный ниже список новостей и выбери 5 самых главных событий из мира искусства и культуры.
На основе этих данных создай информационный дайджест.
Результат должен быть отформатирован в виде чистого Markdown, без каких-либо вводных слов, извинений или комментариев.

# Контекст (сырые данные новостей)
${rawNewsContent}

# Требования к результату
- **Язык:** Русский.
- **Темы в приоритете:** Крупные выставки, арт-рынок (результаты аукционов), назначения в музеях, архитектурные проекты, скандалы в арт-мире, технологии в искусстве, важные события в кино и литературе.
- **Действие:** Выбери 5 самых значимых новостей из контекста выше, перепиши их кратко и емко (2-4 предложения) и отформатируй согласно структуре ниже. Не придумывай новости, которых нет в контексте.

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
    // 5. Запрос к Gemini API (логика без изменений)
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const generatedContent = response.text();

    if (!generatedContent || generatedContent.length < 100) {
        throw new Error("AI response is empty or too short.");
    }

    // 6. Подготовка и сохранение в Supabase (логика без изменений)
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
