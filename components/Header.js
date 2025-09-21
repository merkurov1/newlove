// app/components/Header.js

import Link from 'next/link';

// Теперь компонент принимает 'pages' и 'settings'
export default function Header({ pages, settings }) {
  // Используем данные из 'settings' или ставим значения по умолчанию, если данных нет
  const siteName = settings?.site_name || 'Anton Merkurov';
  const slogan = settings?.slogan || 'Art x Love x Money';

  return (
    <header className="bg-white text-gray-800 p-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        
        {/* Секция с названием сайта и слоганом */}
        <div className="flex items-center space-x-4">
          <div>
            <Link href="/" className="cursor-pointer">
              <h1 className="text-2xl font-bold">{siteName}</h1>
            </Link>
            <p className="text-sm text-gray-500 mt-1">{slogan}</p>
          </div>
        </div>

        {/* Меню навигации */}
        <nav>
          <ul className="flex items-center space-x-6">
            <li>
              <Link href="/">
                <span className="text-gray-800 hover:text-blue-600 transition-colors duration-200 font-medium">Главная</span>
              </Link>
            </li>
            {/* Проверяем, что pages существует и является массивом */}
            {Array.isArray(pages) && pages.map((page) => (
              <li key={page.id}>
                <Link href={`/${page.slug}`}>
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
