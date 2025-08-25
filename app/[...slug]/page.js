import { notFound } from 'next/navigation';
import { supabase } from '@/lib/supabase'; // Убедитесь, что путь верный

export default async function Page({ params }) {
  const { slug } = params;

  // Если slug - это массив, берем первый элемент
  const articleSlug = Array.isArray(slug) ? slug[0] : slug;

  // Запрос к Supabase для получения статьи по slug и наличию тега 'page'
  const { data: article, error } = await supabase
    .from('articles')
    .select('title, content')
    .eq('slug', articleSlug)
    .contains('tags', ['page']) // Проверяем наличие тега 'page'
    .single();

  if (error || !article) {
    // Если статья не найдена или не имеет тега 'page', показываем 404
    notFound();
  }

  return (
    <main>
      <h1>{article.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: article.content }} />
    </main>
  );
}

// Генерируем статические страницы для Next.js (SSG)
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
    slug: article.slug,
  }));
}
