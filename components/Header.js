// app/components/Header.js

import Link from 'next/link';
import Image from 'next/image'; // Не забудьте импортировать Image

export default function Header({ pages, settings }) {
  // Забираем данные из settings или используем запасные варианты
  const siteName = settings?.site_name || 'Anton Merkurov';
  const slogan = settings?.slogan || 'Art x Love x Money';
  
  // URL вашего логотипа в Supabase
  const logoUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png';

  return (
    <header className="bg-white text-gray-800 p-4 shadow-md border-b border-gray-200">
      <div className="container mx-auto flex justify-between items-center">
        
        {/* === СЕКЦИЯ С ЛОГОТИПОМ И НАЗВАНИЕМ - ОБНОВЛЕНО === */}
        <Link href="/" className="flex items-center space-x-4">
          {/* Логотип */}
          <Image 
            src={logoUrl} 
            alt="Логотип сайта" 
            width={50} // Укажите ширину
            height={50} // и высоту
            className="rounded-full" // Делаем логотип круглым для эстетики
          />
          {/* Название и слоган */}
          <div>
            <h1 className="text-xl font-bold">{siteName}</h1>
            <p className="text-sm text-gray-500 mt-1">{slogan}</p>
          </div>
        </Link>

        {/* === МЕНЮ НАВИГАЦИИ - ОБНОВЛЕНО === */}
        <nav>
          <ul className="flex items-center space-x-6 text-sm font-medium"> 
            <li>
              <Link href="/">
                <span className="text-gray-600 hover:text-blue-600 transition-colors">Главная</span>
              </Link>
            </li>
            
            {Array.isArray(pages) && pages.map((page) => (
              <li key={page.id}>
                <Link href={`/projects/${page.slug}`}>
                  <span className="text-gray-600 hover:text-blue-600 transition-colors">{page.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

      </div>
    </header>
  );
}
