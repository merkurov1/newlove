// app/components/Header.js

import Link from 'next/link';
import Image from 'next/image';

// Предположим, что эти данные приходят из Supabase или настроек
const siteName = 'Anton Merkurov';
const slogan = 'Art x Love x Money';

export default function Header({ pages }) {
  return (
    <header className="bg-white text-gray-800 p-4 shadow-md">
      <div className="container mx-auto flex justify-between items-center">
        
        {/* Секция с названием сайта и слоганом */}
        <div className="flex items-center space-x-4">
          <div>
            <Link href="/">
              <h1 className="text-2xl font-bold cursor-pointer">{siteName}</h1>
            </Link>
            <p className="text-sm text-gray-500 mt-1">{slogan}</p>
          </div>
        </div>

        {/* Меню навигации */}
        <nav>
          <ul className="flex space-x-6">
            <li>
              <Link href="/">
                <span className="text-gray-800 hover:text-blue-600 transition-colors duration-200 font-medium">Главная</span>
              </Link>
            </li>
            {pages && pages.map((page) => (
              <li key={page.id}>
                <Link href={`/pages/${page.slug}`}>
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

