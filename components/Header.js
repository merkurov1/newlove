// components/header.js

import Link from 'next/link';
import Image from 'next/image';
import LoginButton from './LoginButton'; // Вы можете импортировать .tsx компонент в .js файл

export default function Header({ pages, settings }) {
  // Используем данные из settings, с запасными вариантами
  const site_name = settings?.site_name || 'Merkurov.love';
  const slogan = settings?.slogan || 'Art x Love x Money';
  const logoUrl = settings?.logo_url || 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png';

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 bg-white/80 backdrop-blur-sm">
      <div className="container mx-auto flex items-center justify-between px-4 py-4">
        
        {/* Левая часть: Логотип и название */}
        <Link href="/" className="group flex items-center space-x-4">
          <Image 
            src={logoUrl} 
            alt="Логотип" 
            width={40}
            height={40}
            priority 
            className="transition-transform duration-300 group-hover:scale-110"
          />
          <div>
            <h1 className="text-xl font-light tracking-wider text-gray-900">
              {site_name}
            </h1>
            <p className="hidden text-xs uppercase tracking-widest text-gray-400 sm:block">
              {slogan}
            </p>
          </div>
        </Link>

        {/* Центральная часть: Навигация */}
        <nav className="hidden md:flex">
          <ul className="list-none flex items-center justify-center gap-6 text-xs font-semibold uppercase tracking-[0.2em]"> 
            {Array.isArray(pages) && pages.map((page) => (
              <li key={page.id}>
                <Link href={`/projects/${page.slug}`} className="group py-2 text-gray-500 transition-colors duration-300 hover:text-gray-900">
                  {page.title}
                  <span className="block h-px max-w-full scale-x-0 bg-gray-900 transition-all duration-300 group-hover:scale-x-100"></span>
                </Link>
              </li>
            ))}
            <li>
              <Link href="/talks" className="group py-2 text-gray-500 transition-colors duration-300 hover:text-gray-900">
                Talks
                <span className="block h-px max-w-full scale-x-0 bg-gray-900 transition-all duration-300 group-hover:scale-x-100"></span>
              </Link>
            </li>
          </ul>
        </nav>

        {/* Правая часть: Кнопка аутентификации */}
        <div className="flex items-center">
          <LoginButton />
        </div>

      </div>
    </header>
  );
}
