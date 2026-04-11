'use client';
import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

// Импортируем стили
import 'highlight.js/styles/github.css';

// Плагины лучше импортировать через import
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

// Динамический импорт Markdown с отключенным SSR
const Markdown = dynamic(() => import('react-markdown'), { 
  ssr: false,
  loading: () => <p>Loading Renderer...</p> 
});

export default function BookReaderPage() {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('base');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    let mounted = true;
    
    // Убедитесь, что путь к файлу верный. 
    // Файл должен лежать в public/unframed/Unframed.markdown
    fetch('/unframed/Unframed.markdown')
      .then((res) => {
        if (!res.ok) throw new Error(`Ошибка загрузки: ${res.status} ${res.statusText}`);
        return res.text();
      })
      .then((text) => {
        if (mounted) {
          setFileContent(text);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          setError(err.message);
          setLoading(false);
        }
      });

    return () => { mounted = false; };
  }, []);

  const sizeClass = {
    sm: 'text-sm leading-6',
    base: 'text-base leading-7',
    lg: 'text-lg leading-8',
    xl: 'text-xl leading-9',
  }[fontSize];

  const containerBg = theme === 'light' ? 'bg-white text-gray-900' : 'bg-gray-900 text-gray-100';

  return (
    <div className={`min-h-screen py-12 px-4 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}>
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-bold">Unframed</h1>
          <div className="flex gap-4 items-center">
            <select 
              value={fontSize} 
              onChange={(e) => setFontSize(e.target.value as any)}
              className="p-1 border rounded"
            >
              <option value="sm">S</option>
              <option value="base">M</option>
              <option value="lg">L</option>
              <option value="xl">XL</option>
            </select>
            <button 
              onClick={() => setTheme(t => t === 'light' ? 'dark' : 'light')}
              className="px-4 py-1 border rounded bg-white text-black"
            >
              {theme === 'light' ? 'Dark Mode' : 'Light Mode'}
            </button>
          </div>
        </header>

        <main className={`prose max-w-none p-8 rounded-lg shadow-lg ${containerBg} ${sizeClass}`}>
          {loading && <div className="text-center py-12">Загрузка...</div>}
          {error && <div className="text-center py-12 text-red-500">{error}</div>}
          
          {fileContent && (
            <Markdown 
              remarkPlugins={[remarkGfm]} 
              rehypePlugins={[rehypeHighlight]}
            >
              {fileContent}
            </Markdown>
          )}
        </main>
      </div>
    </div>
  );
}
