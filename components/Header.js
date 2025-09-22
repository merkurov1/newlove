// app/components/Header.js

import Link from 'next/link';
import Image from 'next/image';

export default function Header({ pages, settings }) {
  const site_name = settings?.site_name || 'Merkurov.love';
  const slogan = settings?.slogan || 'Art x Love x Money';
  const logoUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png';

  return (
    <header className="w-full pt-16 pb-8 border-b border-gray-200">
      <div className="container mx-auto flex flex-col items-center justify-center space-y-6">
        
        {/* === Логотип === */}
        <Link href="/">
          <Image 
            src={logoUrl} 
            alt="Логотип" 
            width={60} // Немного уменьшил для элегантности
            height={60}
            priority 
          />
        </Link>

        {/* === Имя сайта === */}
        <h1 className="text-5xl font-light tracking-wider text-gray-900">
          {site_name}
        </h1>

        {/* === Слоган с линиями по бокам === */}
        <div className="flex items-center w-full max-w-sm">
          <div className="flex-grow border-t border-gray-200"></div>
          <span className="mx-4 text-xs tracking-widest text-gray-400 uppercase">{slogan}</span>
          <div className="flex-grow border-t border-gray-200"></div>
        </div>
      </div>

      {/* === Навигационное меню === */}
      <nav className="w-full pt-8">
        {/* Убираем точки списка и центрируем */}
        <ul className="list-none flex items-center justify-center gap-10 text-xs font-medium tracking-widest uppercase"> 
          
          {Array.isArray(pages) && pages.map((page) => (
            <li key={page.id}>
              <Link href={`/projects/${page.slug}`}>
                <span className="text-gray-500 hover:text-black transition-colors">{page.title}</span>
              </Link>
            </li>
          ))}

          <li>
            <Link href="/talks">
              <span className="text-gray-500 hover:text-black transition-colors">Talks</span>
            </Link>
          </li>
        </ul>
      </nav>
    </header>
  );
}
