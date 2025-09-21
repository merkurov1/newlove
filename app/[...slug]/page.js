// app/[...slug]/page.js
import { createClient } from '@/lib/supabase-server';
import Link from 'next/link';
import { notFound } from 'next/navigation';

// Функция для получения статьи по slug
async function getArticleBySlug(slug) {
  const supabaseClient = createClient(); // Используем createClient

  const { data, error } = await supabaseClient
    .from('articles')
    .select('id, title, created_at, content, slug')
    .eq('slug', slug.join('/')) // Объединяем slug для catch-all маршрута
    .single();

  if (error || !data) {
    console.error('Error fetching article:', error);
    return null;
  }
  return data;
}

export default async function CatchAllPage({ params }) {
  const { slug } = params;
  const article = await getArticleBySlug(slug);

  if (!article) {
    notFound(); // Возвращаем 404, если статья не найдена
  }

  return (
    <div className="container mx-auto py-8">
      <h1 className="text-3xl font-bold mb-4">{article.title}</h1>
      <p className="text-sm text-gray-500 mb-4">
        {new Date(article.created_at).toLocaleDateString('ru-RU', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })}
      </p>
      <div className="prose max-w-none">{article.content}</div>
      <Link href="/" className="text-blue-500 hover:text-blue-400">
        Назад к статьям
      </Link>
    </div>
  );
}