import Link from 'next/link';
import { supabase } from '../lib/supabase';
import Image from 'next/image';
import Header from './header.js';

// Асинхронная функция для получения настроек сайта
async function getSettings() {
  const { data: settingsData, error: settingsError } = await supabase
    .from('settings')
    .select('key, value');

  if (settingsError) {
    console.error('Ошибка загрузки настроек:', settingsError);
    return {};
  }

  const settings = {};
  settingsData.forEach(item => {
    settings[item.key] = item.value;
  });

  return settings;
}

// Асинхронная функция для получения всех статей
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

// Асинхронная функция для получения статей для меню
async function getMenuArticles() {
  const { data: articles, error } = await supabase
    .from('articles')
    .select('slug, title')
    .contains('tags', ['page']);

  if (error) {
    console.error('Error fetching menu articles:', error);
    return [];
  }

  return articles || [];
}

export default async function Home() {
  // Получаем данные для статей на главной странице
  const articles = await getArticles();
  
  // Получаем данные для меню (статьи с тегом 'page')
  const menuArticles = await getMenuArticles();

  // Получаем настройки сайта
  const settings = await getSettings();

  const siteName = settings.site_name || 'Название сайта';
  const slogan = settings.slogan || 'Слоган сайта';

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Передаем статьи для меню и настройки в компонент Header */}
      <Header articles={menuArticles} siteName={siteName} slogan={slogan} />
      
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
