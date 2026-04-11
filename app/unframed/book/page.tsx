'use client';
import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';

const Markdown = dynamic(() => import('react-markdown'), { ssr: false });
const remarkGfm = require('remark-gfm');
const rehypeHighlight = require('rehype-highlight');
import 'highlight.js/styles/github.css';

export default function BookReaderPage() {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('base');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetch('/unframed/Unframed.markdown')
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (!mounted) return;
        setFileContent(text);
      })
      .catch((err) => {
        if (!mounted) return;
        setError(err?.message || 'Error loading book');
      })
      .finally(() => {
        if (!mounted) return;
        setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const sizeClass = {
    sm: 'text-sm leading-6',
    base: 'text-base leading-7',
    lg: 'text-lg leading-8',
    xl: 'text-xl leading-9',
  }[fontSize];

  const containerBg = theme === 'light' ? 'bg-white text-gray-900' : 'bg-gray-900 text-gray-100';

  return (
    <div
      className={`min-h-screen py-12 px-4 sm:px-6 lg:px-8 ${theme === 'dark' ? 'bg-gray-800' : 'bg-gray-50'}`}
    >
      <div className="mx-auto max-w-4xl">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-3xl font-extrabold">Unframed</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <label className="text-sm mr-1">Font</label>
              <select
                value={fontSize}
                onChange={(e) => setFontSize(e.target.value as any)}
                className="border rounded px-2 py-1 bg-white text-sm"
              >
                <option value="sm">S</option>
                <option value="base">M</option>
                <option value="lg">L</option>
                <option value="xl">XL</option>
              </select>
            </div>
            <button
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              className="px-3 py-1 border rounded text-sm"
            >
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
          </div>
        </header>

        <main className={`prose prose-lg mx-auto p-8 rounded-lg shadow-lg ${containerBg}`}>
          {loading && <div className="text-center py-12 text-gray-500">Loading book…</div>}
          {error && (
            <div className="text-center py-6 text-red-500">Error loading book: {error}</div>
          )}
          {fileContent && (
            <article className={sizeClass}>
              <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {fileContent}
              </Markdown>
            </article>
          )}
        </main>

        <footer className="mt-6 text-center text-sm text-gray-500">
          <div>
            Rendered from <strong>/public/unframed/Unframed.markdown</strong>
          </div>
        </footer>
      </div>
    </div>
  );
}
