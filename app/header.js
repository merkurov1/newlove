'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';

export default function Header({ articles, siteName, slogan }) {
  const [theme, setTheme] = useState('light');

  useEffect(() => {
    const localTheme = localStorage.getItem('theme');
    if (localTheme) {
      setTheme(localTheme);
      document.documentElement.classList.add(localTheme);
    } else if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setTheme('dark');
      document.documentElement.classList.add('dark');
    }
  }, []);

  const toggleTheme = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    setTheme(newTheme);
    localStorage.setItem('theme', newTheme);
    document.documentElement.classList.remove(theme);
    document.documentElement.classList.add(newTheme);
  };
  
  const logoUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/logo.png';
  
  const headerBg = theme === 'light' ? 'bg-white' : 'bg-gray-800';
  const headerText = theme === 'light' ? 'text-gray-900' : 'text-white';
  const menuText = theme === 'light' ? 'text-gray-800' : 'text-gray-300';
  const sloganText = theme === 'light' ? 'text-gray-600' : 'text-gray-400';

  return (
    <>
      <header className={`flex flex-wrap items-center justify-between p-6 ${headerBg}`}>
        <div className="flex items-center flex-shrink-0 mr-6">
          <Link href="/">
            <Image src={logoUrl} alt="Логотип" width={48} height={48} />
          </Link>
          <div className="ml-4">
            <Link href="/" className={`font-bold text-xl tracking-tight ${headerText}`}>{siteName}</Link>
            <p className={`text-sm ${sloganText}`}>{slogan}</p>
          </div>
        </div>
        <button onClick={toggleTheme} className={`px-4 py-2 rounded-full ${headerText} border`}>
          {theme === 'light' ? 'Темная тема' : 'Светлая тема'}
        </button>
      </header>
      <nav className={`w-full p-4 ${headerBg}`}>
        <div className="text-sm">
          {articles.map((article) => (
            <Link key={article.slug} href={`/${article.slug}`} className={`block mt-4 lg:inline-block lg:mt-0 ${menuText} hover:text-blue-600 mr-4`}>
              {article.title}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
