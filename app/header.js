'use client'; // Добавляем директиву для использования в качестве Client Component

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabase';
import Image from 'next/image';

async function getSettingsAndMenu() {
  const { data: settingsData, error: settingsError } = await supabase
    .from('settings')
    .select('key, value');

  if (settingsError) {
    console.error('Ошибка загрузки настроек:', settingsError);
    return { settings: {}, articles: [] };
  }

  const settings = {};
  settingsData.forEach(item => {
    settings[item.key] = item.value;
  });

  const { data: articlesData, error: articlesError } = await supabase
    .from('articles')
    .select('slug, title')
    .contains('tags', ['page']);

  if (articlesError) {
    console.error('Ошибка загрузки статей:', articlesError);
    return { settings, articles: [] };
  }

  return { settings, articles: articlesData || [] };
}

export default function Header({ articles }) {
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
  
  const siteName = 'Название сайта'; // Теперь получаем из props
  const slogan = 'Слоган сайта';
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

// Новый Server Component для получения данных
export async function getHeaderData() {
  const { settings, articles } = await getSettingsAndMenu();
  return { settings, articles };
}

// Пример использования в вашем макете (layout.js или page.js)
// import Header, { getHeaderData } from './header';
// const { articles } = await getHeaderData();
// <Header articles={articles} />
