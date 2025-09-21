// app/components/Header.js

import Link from 'next/link';

export default function Header({ pages, settings }) {
  const siteName = settings?.site_name || 'Site Name';
  const slogan = settings?.slogan || 'Slogan';

  return (
    <header className="bg-white text-gray-800 p-6 shadow-md border-b border-gray-200">
      <div className="container mx-auto flex justify-between items-center">
        
        {/* Секция с названием сайта и слоганом (остается без изменений) */}
        <div className="flex items-center space-x-4">
          <div>
            <Link href="/" className="cursor-pointer">
              <h1 className="text-2xl font-bold">{siteName}</h1>
            </Link>
            <p className="text-sm text-gray-500 mt-1">{slogan}</p>
          </div>
        </div>

        {/* Меню навигации - ИСПРАВЛЕНО */}
        <nav>
          {/* Добавлены классы flex и items-center для выравнивания */}
          <ul className="flex items-center space-x-6"> 
            <li>
              <Link href="/">
                <span className="text-gray-800 hover:text-blue-600 transition-colors duration-200 font-medium">Главная</span>
              </Link>
            </li>
            
            {/* Добавляем разделитель для красоты */}
            <li className="text-gray-300">|</li>

            {Array.isArray(pages) && pages.map((page) => (
              <li key={page.id}>
                {/* ИСПРАВЛЕНА ССЫЛКА!
                  Поскольку страницы берутся из таблицы 'projects', 
                  скорее всего, путь должен быть '/projects/slug-статьи'.
                  Если у вас другая структура папок, поменяйте '/projects' на вашу.
                */}
                <Link href={`/projects/${page.slug}`}>
                  <span className="text-gray-800 hover:text-blue-600 transition-colors duration-200 font-medium">{page.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

      </div>
    </header>
  );
}
