// app/page.js

import Header from './Header'; // Убедитесь, что импорт правильный
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import Image from 'next/image'; // Импортируем компонент Image

async function getArticles() {
  const { data: articles, error } = await supabase
    .from('articles')
    .select('*')
    .order('published_at', { ascending: false });

  if (error) {
    console.error('Error fetching articles:', error);
    return [];
  }

  return articles || [];
}

export default async function Home() {
  const articles = await getArticles();

  return (
    <div className="container mx-auto px-4 py-8">
      <Header /> {/* Используем компонент с большой буквы */}
      
      <main>
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {articles.length > 0 ? (
            articles.map((article) => (
              <article
                key={article.id}
                className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
              >
                <h2 className="text-xl font-semibold text-gray-900 mb-3">
                  <Link href={`/articles/${article.slug}`} className="hover:text-blue-600">
                    {article.title}
                  </Link>
                </h2>                
                <p className="text-gray-700 mb-4 line-clamp-3">
                  {article.content?.substring(0, 150)}...
                </p>
                
                <div className="flex justify-between items-center text-sm text-gray-500">
                  <time>
                    {new Date(article.published_at).toLocaleDateString('ru-RU')}
                  </time>
                  <Link
                    href={`/articles/${article.slug}`}
                    className="bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200"
                  >
                    /{article.slug}
                  </Link>
                </div>
              </article>
            ))
          ) : (
            <div className="col-span-full text-center py-12">
              <p className="text-gray-500 text-lg">
                Статьи не найдены. Проверьте подключение к Supabase.
              </p>
            </div>
          )}
        </div>
      </main>

      <footer className="text-center mt-16 text-gray-500">
        <p>© 2025 Headless. Made with ❤️ & AI</p>
      </footer>
    </div>
  );
}
