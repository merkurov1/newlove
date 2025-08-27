// app/page.js
import { supabase } from '@/utils/supabase';
import Link from 'next/link';

async function getArticles() {
  const { data, error } = await supabase
    .from('articles')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching articles:', error);
    return [];
  }
  return data;
}

export default async function HomePage() {
  const articles = await getArticles();

  return (
    <div className="space-y-6">
      <h1 className="text-4xl font-bold mb-6">Последние публикации</h1>
      {articles.length > 0 ? (
        articles.map((article) => (
          <div key={article.id} className="p-4 border border-gray-200 rounded-lg shadow-sm hover:shadow-md transition-shadow">
            <h2 className="text-2xl font-semibold">
              <Link href={`/articles/${article.slug}`}>
                <span className="text-blue-600 hover:underline">{article.title}</span>
              </Link>
            </h2>
            <p className="text-gray-600 mt-2 line-clamp-3">{article.content}</p>
            <Link href={`/articles/${article.slug}`}>
              <span className="text-blue-500 hover:underline mt-2 inline-block">Читать далее</span>
            </Link>
          </div>
        ))
      ) : (
        <p className="text-center text-gray-500">Пока нет статей.</p>
      )}
    </div>
  );
}
