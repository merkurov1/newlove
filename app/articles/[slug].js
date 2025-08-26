// app/articles/page.js
import Link from 'next/link';
import { createClient } from '@/lib/supabase'; // Исправленный путь
import Image from 'next/image';

export const revalidate = 60;

async function getPublishedArticles() {
  const supabase = createClient();
  const { data: articles, error } = await supabase
    .from('articles')
    .select('id, title, slug, published_at, image_url')
    .eq('is_draft', false)
    .order('published_at', { ascending: false });

  if (error) {
    console.error('Ошибка загрузки статей:', error);
    return [];
  }
  return articles;
}

export default async function ArticlesPage() {
  const articles = await getPublishedArticles();

  if (!articles.length) {
    return <div className="text-center text-gray-500">Пока нет опубликованных статей.</div>;
  }

  return (
    <div>
      <h1 className="text-4xl font-bold mb-8">Блог</h1>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {articles.map(article => (
          <Link key={article.id} href={`/articles/${article.slug}`} className="block border rounded-lg overflow-hidden shadow-lg hover:shadow-xl transition-shadow duration-300">
            {article.image_url && (
              <Image
                src={article.image_url}
                alt={article.title}
                width={500}
                height={300}
                className="w-full object-cover h-48"
              />
            )}
            <div className="p-4">
              <h2 className="text-xl font-semibold">{article.title}</h2>
              <p className="text-sm text-gray-500 mt-1">Опубликовано: {new Date(article.published_at).toLocaleDateString('ru-RU')}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
