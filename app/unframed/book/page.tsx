'use client';
import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import Paywall from './Paywall';

// стили подсветки
import 'highlight.js/styles/github.css';

import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';

const Markdown = dynamic(() => import('react-markdown'), {
  ssr: false,
  loading: () => <p>Loading renderer...</p>,
});

export default function BookReaderPage() {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [unlocked, setUnlocked] = useState<boolean>(false);

  // preferences
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('base');
  const [fontFamily, setFontFamily] = useState<'serif' | 'sans' | 'mono'>('serif');
  const [lineHeight, setLineHeight] = useState<'normal' | 'relaxed' | 'loose'>('relaxed');
  const [columns, setColumns] = useState<number>(1);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  const readerRef = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState<number>(0);

  useEffect(() => {
    try {
      const prefs = localStorage.getItem('unframed_prefs');
      if (prefs) {
        const obj = JSON.parse(prefs);
        if (obj.fontSize) setFontSize(obj.fontSize);
        if (obj.fontFamily) setFontFamily(obj.fontFamily);
        if (obj.lineHeight) setLineHeight(obj.lineHeight);
        if (obj.columns) setColumns(obj.columns || 1);
        if (obj.theme) setTheme(obj.theme);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('paid') === '1' || localStorage.getItem('unframed_unlocked') === '1') {
        setUnlocked(true);
      }
    } catch (e) {}
  }, []);

  useEffect(() => {
    if (!unlocked) return;
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
  }, [unlocked]);

  useEffect(() => {
    const el = readerRef.current;
    if (!el) return;
    const onScroll = () => {
      const scrollTop = el.scrollTop;
      const scrollHeight = el.scrollHeight - el.clientHeight;
      const p = scrollHeight > 0 ? Math.round((scrollTop / scrollHeight) * 100) : 0;
      setProgress(p);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => el.removeEventListener('scroll', onScroll);
  }, [fileContent]);

  const savePrefs = () => {
    const obj = { fontSize, fontFamily, lineHeight, columns, theme };
    try {
      localStorage.setItem('unframed_prefs', JSON.stringify(obj));
    } catch (e) {}
  };

  const unlockHandler = () => {
    try {
      localStorage.setItem('unframed_unlocked', '1');
    } catch (e) {}
    setUnlocked(true);
  };

  const sizeClass = { sm: 'text-sm', base: 'text-base', lg: 'text-lg', xl: 'text-xl' }[fontSize];
  const familyClass = { serif: 'prose-serif', sans: 'prose-sans', mono: 'font-mono' }[fontFamily];
  const lhClass = { normal: 'leading-7', relaxed: 'leading-8', loose: 'leading-9' }[lineHeight];

  if (!unlocked) return <Paywall onUnlock={unlockHandler} />;

  return (
    <div className={`${theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'} min-h-screen py-8 px-4`}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold">Unframed</h1>
          <div className="flex items-center gap-3">
            <select value={fontFamily} onChange={(e) => setFontFamily(e.target.value as any)} className="border rounded px-2 py-1 bg-white text-sm">
              <option value="serif">Serif</option>
              <option value="sans">Sans</option>
              <option value="mono">Mono</option>
            </select>
            <select value={fontSize} onChange={(e) => setFontSize(e.target.value as any)} className="border rounded px-2 py-1 bg-white text-sm">
              <option value="sm">S</option>
              <option value="base">M</option>
              <option value="lg">L</option>
              <option value="xl">XL</option>
            </select>
            <select value={lineHeight} onChange={(e) => setLineHeight(e.target.value as any)} className="border rounded px-2 py-1 bg-white text-sm">
              <option value="normal">Normal</option>
              <option value="relaxed">Relaxed</option>
              <option value="loose">Loose</option>
            </select>
            <select value={String(columns)} onChange={(e) => setColumns(Number(e.target.value))} className="border rounded px-2 py-1 bg-white text-sm">
              <option value={1}>1 col</option>
              <option value={2}>2 col</option>
            </select>
            <button onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))} className="px-3 py-1 border rounded text-sm">
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
            <button onClick={savePrefs} className="px-3 py-1 bg-pink-600 text-white rounded text-sm">Save</button>
          </div>
        </div>

        <div className="relative mb-4">
          <div className="h-2 bg-gray-200 rounded overflow-hidden">
            <div className="h-2 bg-pink-600" style={{ width: `${progress}%` }} />
          </div>
          <div className="absolute right-2 top-0 text-sm text-gray-500">{progress}%</div>
        </div>

        <div ref={readerRef} style={{ height: '70vh', overflow: 'auto' }} className="rounded shadow-lg">
          <article className={`prose mx-auto p-8 ${sizeClass} ${familyClass} ${lhClass} ${columns === 2 ? 'prose-col-2' : ''} bg-white`}>
            {loading && <div className="text-center py-12 text-gray-500">Loading book…</div>}
            {error && <div className="text-center py-6 text-red-500">Error loading book: {error}</div>}
            {fileContent && (
              <Markdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
                {fileContent}
              </Markdown>
            )}
          </article>
        </div>

        <footer className="mt-6 text-center text-sm text-gray-500">Rendered from <strong>/public/unframed/Unframed.markdown</strong></footer>
      </div>
    </div>
  );
}
