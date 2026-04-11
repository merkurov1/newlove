'use client';
import React, { useEffect, useRef, useState, useMemo } from 'react';
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
  // Start in a fullscreen-like mode and hide the TOC by default
  const [fullscreen, setFullscreen] = useState<boolean>(true);
  const [tocCollapsed, setTocCollapsed] = useState<boolean>(true);
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

  // Normalize heading-like plain text from markdown source so it renders
  // as proper headings (covers uppercase CHAPTER / PART lines, escaped hashes, TOC title).
  const normalizeHeadings = (text: string | null): string => {
    if (!text) return '';
    let t = text;
    t = t.replace(/^#\s*$/gm, '---');
    t = t.replace(/^UNFRAMED\s*$/m, '# UNFRAMED');
    t = t.replace(/^📑 TABLE OF CONTENTS$/m, '## Table of Contents');
    t = t.replace(/^INTRODUCTION:\s*(.*)$/gim, '## INTRODUCTION: $1');
    t = t.replace(/^PROLOGUE:\s*(.*)$/gim, '## PROLOGUE: $1');
    t = t.replace(/^EPILOGUE:\s*(.*)$/gim, '## EPILOGUE: $1');
    t = t.replace(/^PART\s+([IVXLCDM]+):\s*(.*)$/gim, '## PART $1 — $2');
    t = t.replace(/^CHAPTER\s+(\d+):\s*(.*)$/gim, '### CHAPTER $1: $2');
    t = t.replace(/^Chapter\s+(\d+):\s*(.*)$/gim, '### Chapter $1: $2');
    return t;
  };

  // simple slugify for headings
  const slugify = (s: string) => {
    const str = s
      .toString()
      .normalize('NFKD')
      .replace(/\p{Diacritic}/gu, '')
      .replace(/[^a-zA-Z0-9\s-]/g, '')
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    return str;
  };

  // build TOC from normalized content
  const toc = useMemo(() => {
    if (!fileContent) return [] as Array<{ level: number; text: string; id: string }>;
    const t = normalizeHeadings(fileContent || '');
    const lines = t.split(/\r?\n/);
    const items: Array<{ level: number; text: string; id: string }> = [];
    for (const line of lines) {
      const m = line.match(/^(#{1,3})\s+(.*)$/);
      if (m) {
        const level = m[1].length;
        const text = m[2].replace(/\s*\(.+\)$/, '').trim();
        items.push({ level, text, id: slugify(text) });
      }
    }
    return items;
  }, [fileContent]);

  const scrollToId = (id: string) => {
    const root = readerRef.current;
    if (!root) return;
    const el = root.querySelector(`#${CSS.escape(id)}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // custom heading renderer to add id attributes that match TOC slugs
  const HeadingRenderer = (props: any) => {
    const { level, children } = props;
    const arr = React.Children.toArray(children as any);
    const text = arr
      .map((c: any) => (typeof c === 'string' ? c : c && c.props ? String(c.props.children) : ''))
      .join('');
    const id = slugify(text || `heading-${Math.random().toString(36).slice(2, 8)}`);
    const Tag = `h${level}`;
    return React.createElement(Tag as any, { id }, children);
  };

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

  // keyboard shortcuts: +/- to change font size, c to toggle columns, t to toggle theme
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') {
        setFontSize((s) => (s === 'sm' ? 'base' : s === 'base' ? 'lg' : s === 'lg' ? 'xl' : 'xl'));
      }
      if (e.key === '-') {
        setFontSize((s) => (s === 'xl' ? 'lg' : s === 'lg' ? 'base' : s === 'base' ? 'sm' : 'sm'));
      }
      if (e.key.toLowerCase() === 'c') {
        setColumns((c) => (c === 1 ? 2 : 1));
      }
      if (e.key.toLowerCase() === 't') {
        setTheme((t) => (t === 'light' ? 'dark' : 'light'));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Fullscreen change sync
  useEffect(() => {
    const onFull = () => {
      const isFull = !!document.fullscreenElement;
      setFullscreen(isFull);
    };
    document.addEventListener('fullscreenchange', onFull);
    return () => document.removeEventListener('fullscreenchange', onFull);
  }, []);

  // When fullscreen mode is toggled, apply simple fixed/fullscreen styles to readerRef
  useEffect(() => {
    const el = readerRef.current;
    if (!el) return;
    if (fullscreen) {
      el.style.position = 'fixed';
      el.style.top = '0';
      el.style.left = '0';
      el.style.right = '0';
      el.style.bottom = '0';
      el.style.height = '100vh';
      el.style.zIndex = '9999';
      el.style.background = 'var(--bg, transparent)';
    } else {
      el.style.position = '';
      el.style.top = '';
      el.style.left = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.height = '';
      el.style.zIndex = '';
      el.style.background = '';
    }
    return () => {
      // cleanup
      if (el) {
        el.style.position = '';
        el.style.top = '';
        el.style.left = '';
        el.style.right = '';
        el.style.bottom = '';
        el.style.height = '';
        el.style.zIndex = '';
        el.style.background = '';
      }
    };
  }, [fullscreen]);

  const unlockHandler = () => {
    try {
      localStorage.setItem('unframed_unlocked', '1');
    } catch (e) {}
    setUnlocked(true);
  };

  const sizeClass = { sm: 'prose-sm', base: 'prose', lg: 'prose-lg', xl: 'prose-xl' }[fontSize];
  const familyClass = { serif: 'font-serif', sans: 'font-sans', mono: 'font-mono' }[fontFamily];
  const lhClass = { normal: 'leading-7', relaxed: 'leading-8', loose: 'leading-9' }[lineHeight];

  if (!unlocked) return <Paywall onUnlock={unlockHandler} />;

  return (
    <div className={`${theme === 'dark' ? 'dark' : ''} min-h-screen py-8 px-4`}>
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold ui-sans">Unframed</h1>
          <div className="flex items-center gap-3 ui-sans">
            <select
              value={fontFamily}
              onChange={(e) => setFontFamily(e.target.value as any)}
              className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200"
            >
              <option value="serif">Serif</option>
              <option value="sans">Sans</option>
              <option value="mono">Mono</option>
            </select>
            <select
              value={fontSize}
              onChange={(e) => setFontSize(e.target.value as any)}
              className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200"
            >
              <option value="sm">S</option>
              <option value="base">M</option>
              <option value="lg">L</option>
              <option value="xl">XL</option>
            </select>
            <select
              value={lineHeight}
              onChange={(e) => setLineHeight(e.target.value as any)}
              className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200"
            >
              <option value="normal">Normal</option>
              <option value="relaxed">Relaxed</option>
              <option value="loose">Loose</option>
            </select>
            <select
              value={String(columns)}
              onChange={(e) => setColumns(Number(e.target.value))}
              className="border rounded px-2 py-1 bg-white dark:bg-gray-800 text-sm text-gray-800 dark:text-gray-200"
            >
              <option value={1}>1 col</option>
              <option value={2}>2 col</option>
            </select>
            <button
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              className="px-3 py-1 border rounded text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
            >
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
            <button
              onClick={savePrefs}
              className="px-3 py-1 bg-brand-500 text-white rounded text-sm"
            >
              Save
            </button>
            <button
              onClick={async () => {
                try {
                  if (!fullscreen) {
                    const el = readerRef.current || document.documentElement;
                    if (el && (el as any).requestFullscreen) await (el as any).requestFullscreen();
                    setFullscreen(true);
                  } else {
                    if (document.fullscreenElement) await document.exitFullscreen();
                    setFullscreen(false);
                  }
                } catch (e) {
                  console.warn('Fullscreen error', e);
                }
              }}
              className="px-3 py-1 border rounded text-sm bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200"
            >
              {fullscreen ? 'Exit full' : 'Full screen'}
            </button>
          </div>
        </div>

        {/* Floating quick controls */}
        <div className="fixed bottom-6 right-6 z-40 flex flex-col gap-2">
          <div className="bg-white/90 dark:bg-gray-900/80 backdrop-blur rounded-lg shadow p-2 flex gap-2 items-center">
            <button
              aria-label="Decrease font"
              onClick={() => setFontSize((s) => (s === 'xl' ? 'lg' : s === 'lg' ? 'base' : 'sm'))}
              className="px-2 py-1 border rounded text-sm"
            >
              A-
            </button>
            <button
              aria-label="Increase font"
              onClick={() => setFontSize((s) => (s === 'sm' ? 'base' : s === 'base' ? 'lg' : 'xl'))}
              className="px-2 py-1 border rounded text-sm"
            >
              A+
            </button>
            <button
              aria-label="Toggle columns"
              onClick={() => setColumns((c) => (c === 1 ? 2 : 1))}
              className="px-2 py-1 border rounded text-sm"
            >
              Cols
            </button>
            <button
              aria-label="Toggle theme"
              onClick={() => setTheme((t) => (t === 'light' ? 'dark' : 'light'))}
              className="px-2 py-1 border rounded text-sm"
            >
              Theme
            </button>
          </div>
        </div>

        <div className="relative mb-4">
          <div className="h-2 bg-gray-200 rounded overflow-hidden">
            <div className="h-2 bg-pink-600" style={{ width: `${progress}%` }} />
          </div>
          <div className="absolute right-2 top-0 text-sm text-gray-500">{progress}%</div>
        </div>

        <div className="rounded shadow-lg">
          <div
            ref={readerRef}
            style={{ height: 'calc(100vh - 12rem)', overflow: 'auto' }}
            className="relative flex gap-6"
          >
            {/* TOC sidebar */}
            <aside className="hidden md:block w-56 flex-shrink-0">
              <div className="sticky top-24 p-4 rounded bg-white/80 dark:bg-gray-900/70 backdrop-blur shadow-sm">
                <div className="text-xs text-gray-500 mb-2">Contents</div>
                <nav className="text-sm space-y-1">
                  {toc.map((it) => (
                    <div key={it.id} className={`pl-${Math.min((it.level - 1) * 3, 6)}`}>
                      <button
                        onClick={() => scrollToId(it.id)}
                        className="text-left w-full text-gray-700 dark:text-gray-200 hover:underline text-sm"
                      >
                        {it.text}
                      </button>
                    </div>
                  ))}
                </nav>
              </div>
            </aside>

            <article
              className={`mx-auto p-8 ${sizeClass} ${familyClass} ${lhClass} ${columns === 2 ? 'md:columns-2' : ''} prose bg-transparent dark:prose-invert w-full`}
            >
              {loading && <div className="text-center py-12 text-gray-500">Loading book…</div>}
              {error && (
                <div className="text-center py-6 text-red-500">Error loading book: {error}</div>
              )}
              {fileContent && (
                <Markdown
                  remarkPlugins={[remarkGfm]}
                  rehypePlugins={[rehypeHighlight]}
                  components={{
                    h1: (props) => <HeadingRenderer {...props} level={1} />,
                    h2: (props) => <HeadingRenderer {...props} level={2} />,
                    h3: (props) => <HeadingRenderer {...props} level={3} />,
                  }}
                >
                  {normalizeHeadings(fileContent)}
                </Markdown>
              )}
            </article>
          </div>
        </div>

        <footer className="mt-6 text-center text-sm text-gray-500">
          Rendered from <strong>/public/unframed/Unframed.markdown</strong>
        </footer>
      </div>
    </div>
  );
}
