import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import Image from 'next/image'; // Импортируем компонент Image

export default async function Page({ params }) {
  const { slug } = params;

  // Next.js передает slug как массив для catch-all маршрута
  const articleSlug = Array.isArray(slug) ? slug[0] : slug;

  const { data: article, error } = await supabase
    .from('articles')
    .select('title, content')
    .eq('slug', articleSlug)
    .contains('tags', ['page'])
    .single();

  if (error || !article) {
    notFound();
  }

  // Осторожно: dangerouslySetInnerHTML - небезопасный метод.
  // Если контент содержит теги <img>, они не будут оптимизированы.
  return (
    <main>
      <h1>{article.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: article.content }} />
    </main>
  );
}

---

## Исправленная функция `generateStaticParams`

Основная проблема была здесь. Мы должны возвращать `slug` как массив для каждого элемента.

```javascript
export async function generateStaticParams() {
  const { data: articles, error } = await supabase
    .from('articles')
    .select('slug')
    .contains('tags', ['page']);

  if (error) {
    console.error('Ошибка генерации статических параметров:', error);
    return [];
  }

  return articles.map((article) => ({
    // Главное исправление: `slug` теперь является массивом.
    slug: [article.slug],
  }));
}
