// app/components/Header.js

import Link from 'next/link';
import Image from 'next/image';

export default function Header({ pages, settings }) {
  // Если settings не пришли, используем пустой объект, чтобы избежать ошибок
  const { site_name = 'Название сайта', slogan = 'Слоган' } = settings || {};
  
  const logoUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png';

  return (
    // Добавляем w-full, чтобы шапка гарантированно занимала всю ширину
    <header className="w-full bg-white shadow-md border-b border-gray-200">
      {/* Контейнер теперь внутри, чтобы фон шапки был на всю ширину */}
      <div className="container mx-auto flex justify-between items-center p-4">
        
        {/* === ЛЕВЫЙ БЛОК: Лого + Название === */}
        <Link href="/" className="flex items-center gap-4"> {/* gap-4 создает отступ */}
          <Image 
            src={logoUrl} 
            alt="Логотип" 
            width={50}
            height={50}
            className="rounded-full"
            priority // Говорит Next.js загрузить логотип в первую очередь
          />
          <div>
            <h1 className="text-xl font-bold text-gray-900">{site_name}</h1>
            <p className="text-sm text-gray-500">{slogan}</p>
          </div>
        </Link>

        {/* === ПРАВЫЙ БЛОК: Навигация === */}
        <nav>
          <ul className="flex items-center gap-6 text-sm font-medium"> 
            <li>
              <Link href="/">
                <span className="text-gray-600 hover:text-blue-500 transition-colors">Главная</span>
              </Link>
            </li>
            
            {Array.isArray(pages) && pages.map((page) => (
              <li key={page.id}>
                <Link href={`/projects/${page.slug}`}>
                  <span className="text-gray-600 hover:text-blue-500 transition-colors">{page.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

      </div>
    </header>
  );
}
