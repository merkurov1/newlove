// app/api/cron/route.ts

import { NextResponse } from 'next/server';
// dynamic import to avoid circular/interop build issues

// Вспомогательная функция для генерации URL-дружественного слага из заголовка
// Я добавил транслитерацию для кириллических символов
const generateSlug = (title: string): string => {
  if (!title) return '';

  const translit: { [key: string]: string } = {
    'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'e', 'ж': 'zh',
    'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
    'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'h', 'ц': 'c',
    'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya'
  };

  return title
    .toLowerCase()
    .replace(/[а-яё]/g, char => translit[char] || '')
    .replace(/[^\w\s-]/g, '') // Удаляем все не-буквенные и не-цифровые символы, кроме пробелов и дефисов
    .replace(/\s+/g, '-') // Заменяем пробелы на дефисы
    .trim(); // Убираем лишние пробелы в начале и конце
};


export async function GET() {
  // Здесь, предположительно, ваш код для получения новостей
  // const newsApiUrl = `https://...`;
  // const response = await fetch(newsApiUrl);
  // const data = await response.json();
  // const articles = data.articles; // Предполагаемая структура

  try {
    // Я предполагаю, что вы используете prisma.upsert для добавления только новых статей
    // и здесь показан примерный цикл обработки
    
    // ---- НАЧАЛО ПРИМЕРНОГО КОДА ----
    // Этот код нужно адаптировать под вашу реальную логику получения новостей
    const articles: any[] = []; // Замените это на ваш реальный массив статей
    // ---- КОНЕЦ ПРИМЕРНОГО КОДА ----

  const globalReq = ((globalThis && (globalThis as any).request) as Request) || new Request('http://localhost');

  // Prefer the canonical wrapper which normalizes various export shapes
  // and provides a server fallback. Import dynamically to avoid circular
  // dependency issues during build.
  let supabaseClient: any = null;
  try {
    const mod = await import('@/lib/getUserAndSupabaseForRequest');
    const getUserAndSupabaseForRequest = (mod && (mod.default || mod.getUserAndSupabaseForRequest)) as any;
    if (typeof getUserAndSupabaseForRequest !== 'function') {
      throw new Error('getUserAndSupabaseForRequest is not available');
    }
    const result = await getUserAndSupabaseForRequest(globalReq);
    supabaseClient = result?.supabase || null;
  } catch (err) {
    console.error('Error obtaining supabase client for cron job', err);
    return NextResponse.json({ message: 'Supabase client unavailable' }, { status: 500 });
  }

  if (!supabaseClient) {
    console.error('Supabase client unavailable for cron job (no client returned)');
    return NextResponse.json({ message: 'Supabase client unavailable' }, { status: 500 });
  }
    for (const article of articles) {
      // <<< ГЛАВНОЕ ИЗМЕНЕНИЕ: Генерируем slug из заголовка статьи
      const slug = generateSlug(article.title);
      
      // Если у вас не получается сгенерировать slug (например, нет заголовка), пропускаем статью
      if (!slug) continue;

      // Upsert via Supabase (use onConflict=url)
      try {
        const payload = {
          title: article.title,
          slug: slug,
          description: article.description || '',
          url: article.url,
          imageUrl: article.imageUrl,
          publishedAt: article.publishedAt ? new Date(article.publishedAt).toISOString() : null,
          sourceName: article.source?.name || null,
        };
  await supabaseClient.from('newsArticle').upsert(payload, { onConflict: 'url' });
      } catch (e) {
        console.error('Supabase upsert newsArticle error', e);
      }
    }

    return NextResponse.json({ message: 'News processing finished successfully.' });

  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error('Error processing news:', error);
    }
    return new Response('Error processing news', { status: 500 });
  }
}
