// app/page.js
import { createClient } from '../lib/supabase-server'; // Исправленный путь
import Link from 'next/link';

async function getArticles() {
  const supabaseClient = createClient();

  const { data, error } = await supabaseClient
    .from('articles')
    .select('id, title, created_at, content, slug')
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
    <div className="space-y-12">
      <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
        {articles.length > 0 ? (
          articles.map((article) => (
            <div
              key={article.id}
              className="bg-white rounded-lg shadow-sm hover:shadow-lg transition-shadow duration-300 p-6 border border-gray-100"
            >
              <Link href={`/articles/${article.slug}`}>
                <h2 className="text-xl font-semibold text-gray-900 mb-2 hover:text-blue-600 transition-colors duration-200 cursor-pointer">
                  {article.title}
                </h2>
              </Link>
              
              <p className="text-sm text-gray-500 mb-4">
                {new Date(article.created_at).toLocaleDateString('ru-RU', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              
              <p className="text-gray-700 mb-4 line-clamp-3">
                {article.content}
              </p>
              
              <Link
                href={`/articles/${article.slug}`}
                className="text-blue-500 font-medium hover:text-blue-400 transition-colors duration-300 inline-flex items-center"
              >
                Читать далее
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className="ml-1 w-4 h-4 transform group-hover:translate-x-1 transition-transform"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 5l7 7-7 7"
                  />
                </svg>
              </Link>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-500 col-span-full">Пока нет статей.</p>
        )}
      </div>
    </div>
  );
}