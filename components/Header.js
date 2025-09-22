// app/components/Header.js

import Link from 'next/link';
import Image from 'next/image';

export default function Header({ pages, settings }) {
  // Используем данные из settings или запасные варианты
  const site_name = settings?.site_name || 'Anton Merkurov';
  const slogan = settings?.slogan || 'Art x Love x Money';
  
  // URL вашего логотипа (сердце)
  // Я нашел похожее изображение. Если у вас есть свое, замените URL.
  const logoUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png'; // Используем ваш логотип

  return (
    <header className="w-full bg-white pt-10 pb-6 border-b border-gray-200">
      <div className="container mx-auto flex flex-col items-center justify-center space-y-5">
        
        {/* === Логотип === */}
        <Link href="/">
          <Image 
            src={logoUrl} 
            alt="Логотип" 
            width={70}
            height={70}
            priority 
          />
        </Link>

        {/* === Имя сайта === */}
        <h1 className="text-4xl font-light tracking-wider text-gray-800">
          {site_name}
        </h1>

        {/* === Слоган с линиями по бокам === */}
        <div className="flex items-center w-full max-w-xs">
          <div className="flex-grow border-t border-gray-300"></div>
          <span className="mx-4 text-xs tracking-widest text-gray-500">{slogan}</span>
          <div className="flex-grow border-t border-gray-300"></div>
        </div>

      </div>

      {/* === Навигационное меню === */}
      <nav className="w-full mt-6">
        <ul className="flex items-center justify-center gap-8 text-xs font-medium tracking-widest uppercase"> 
          
          {/* Динамические страницы из Supabase */}
          {Array.isArray(pages) && pages.map((page) => (
            <li key={page.id}>
              <Link href={`/projects/${page.slug}`}>
                <span className="text-gray-600 hover:text-black transition-colors">{page.title}</span>
              </Link>
            </li>
          ))}

          {/* Статическая ссылка "Talks", как вы просили */}
          <li>
            <Link href="/talks">
              <span className="text-gray-600 hover:text-black transition-colors">Talks</span>
            </Link>
          </li>

        </ul>
      </nav>
    </header>
  );
}
