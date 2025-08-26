// app/articles/page.js
import Link from 'next/link';
import { createClient } from '@/utils/supabase/server';

export const revalidate = 60;

async function getArticles() {
  const supabase = createClient();
  const { data: articles } = await supabase
    .from('articles')
    .select('id, title, slug, published_at')
    .order('published_at', { ascending: false });
  return articles;
}

export default async function ArticlesPage() {
  const articles = await getArticles();
  if (!articles) return <div>Статьи не найдены.</div>;

  return (
    <div>
      <h1 className="text-4xl font-bold mb-6">Блог</h1>
      <div className="space-y-6">
        {articles.map(article => (
          <Link key={article.id} href={`/articles/${article.slug}`} className="block p-4 border rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <h2 className="text-2xl font-semibold">{article.title}</h2>
            <p className="text-sm text-gray-500 mt-1">Опубликовано: {new Date(article.published_at).toLocaleDateString()}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
