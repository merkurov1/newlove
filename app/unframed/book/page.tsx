'use client';

import React, { useEffect, useRef, useState, useMemo } from 'react';
import dynamic from 'next/dynamic';
import Paywall from '../Paywall';
import Link from 'next/link';

// Стилли подсветки синтаксиса
import 'highlight.js/styles/github-dark.css';

import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import { 
  Maximize, 
  Minimize, 
  Settings, 
  ChevronLeft, 
  Menu, 
  X, 
  Bookmark, 
  Moon, 
  Sun,
  BookOpen,
  Terminal,
  Columns as ColumnsIcon
} from 'lucide-react';

const Markdown = dynamic(() => import('react-markdown'), {
  ssr: false,
  loading: () => <p className="font-mono text-xs text-zinc-500 p-8">Loading renderer...</p>,
});

export default function BookReaderPage() {
  const [fileContent, setFileContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [unlocked, setUnlocked] = useState<boolean>(false);

  // Настройки чтения
  const [fontSize, setFontSize] = useState<'sm' | 'base' | 'lg' | 'xl'>('base');
  const [fontFamily, setFontFamily] = useState<'serif' | 'sans' | 'mono'>('serif');
  const [lineHeight, setLineHeight] = useState<'normal' | 'relaxed' | 'loose'>('relaxed');
  const [columns, setColumns] = useState<number>(1);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark'); // По умолчанию темный нуар

  const readerRef = useRef<HTMLDivElement | null>(null);
  const [fullscreen, setFullscreen] = useState<boolean>(false);
  const [tocOpen, setTocOpen] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [showSettings, setShowSettings] = useState<boolean>(false);

  // Загрузка настроек и проверка авторизации / админского доступа
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

    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('paid') === '1' || params.get('admin') === '1' || localStorage.getItem('unframed_unlocked') === '1') {
        setUnlocked(true);
      }
    } catch (e) {}
  }, []);

  // Загрузка текста книги
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

  // Нормализация заголовков для Markdown
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

  // Построение оглавления (TOC)
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
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      setTocOpen(false);
    }
  };

  const HeadingRenderer = (props: any) => {
    const { level, children } = props;
    const arr = React.Children.toArray(children as any);
    const text = arr
      .map((c: any) => (typeof c === 'string' ? c : c && c.props ? String(c.props.children) : ''))
      .join('');
    const id = slugify(text || `heading-${Math.random().toString(36).slice(2, 8)}`);
    const Tag = `h${level}`;
    return React.createElement(Tag as any, { id, className: 'scroll-mt-24 font-bold tracking-tight text-white mb-4' }, children);
  };

  // Отслеживание прогресса чтения
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
      setShowSettings(false);
    } catch (e) {}
  };

  const unlockHandler = () => {
    try {
      localStorage.setItem('unframed_unlocked', '1');
    } catch (e) {}
    setUnlocked(true);
  };

  const sizeClass = { 
    sm: 'text-sm', 
    base: 'text-base md:text-lg', 
    lg: 'text-lg md:text-xl', 
    xl: 'text-xl md:text-2xl' 
  }[fontSize];

  const familyClass = { 
    serif: 'font-serif', 
    sans: 'font-sans', 
    mono: 'font-mono' 
  }[fontFamily];

  const lhClass = { 
    normal: 'leading-normal', 
    relaxed: 'leading-relaxed', 
    loose: 'leading-loose' 
  }[lineHeight];

  if (!unlocked) return <Paywall onUnlock={unlockHandler} />;

  return (
    <div className={`${theme === 'dark' ? 'bg-[#050505] text-zinc-200' : 'bg-zinc-100 text-zinc-900'} min-h-screen flex flex-col selection:bg-red-600 selection:text-white font-sans transition-colors duration-300`}>
      {/* GLOBAL GRAIN */}
      <div
        className="fixed inset-0 pointer-events-none z-50 opacity-[0.03] mix-blend-overlay"
        style={{ backgroundImage: `url("https://grainy-gradients.vercel.app/noise.svg")` }}
      />

      {/* TOP HEADER / NAVBAR */}
      <header className={`sticky top-0 z-40 border-b ${theme === 'dark' ? 'bg-[#050505]/90 border-zinc-900' : 'bg-white/90 border-zinc-200'} backdrop-blur px-6 py-4 flex items-center justify-between`}>
        <div className="flex items-center gap-4">
          <Link
            href="/unframed"
            className={`p-2 border ${theme === 'dark' ? 'border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-600' : 'border-zinc-300 text-zinc-600 hover:text-black'} transition-colors`}
            title="Back to Dossier"
          >
            <ChevronLeft size={16} />
          </Link>
          <div>
            <span className="font-mono text-[10px] text-red-500 uppercase tracking-widest block">Manuscript Reader</span>
            <h1 className="text-sm font-bold uppercase tracking-tight font-sans">UNFRAMED — Anton Merkurov</h1>
          </div>
        </div>

        {/* CONTROLS RIGHT */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setTocOpen(!tocOpen)}
            className={`flex items-center gap-2 px-3 py-2 border font-mono text-xs uppercase tracking-widest transition-colors ${
              theme === 'dark' ? 'border-zinc-800 bg-zinc-900/50 hover:border-red-600 text-zinc-300' : 'border-zinc-300 bg-zinc-50 hover:border-red-600 text-zinc-700'
            }`}
          >
            <Menu size={14} />
            <span className="hidden md:inline">Contents</span>
          </button>

          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`flex items-center gap-2 px-3 py-2 border font-mono text-xs uppercase tracking-widest transition-colors ${
              theme === 'dark' ? 'border-zinc-800 bg-zinc-900/50 hover:border-red-600 text-zinc-300' : 'border-zinc-300 bg-zinc-50 hover:border-red-600 text-zinc-700'
            }`}
          >
            <Settings size={14} />
            <span className="hidden md:inline">Settings</span>
          </button>
        </div>
      </header>

      {/* PROGRESS BAR */}
      <div className="w-full bg-zinc-900 h-[2px] relative z-40">
        <div className="bg-red-600 h-full transition-all duration-150 shadow-[0_0_10px_red]" style={{ width: `${progress}%` }} />
      </div>

      {/* SETTINGS DROPDOWN MODAL */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className={`max-w-md w-full border ${theme === 'dark' ? 'border-zinc-800 bg-black text-white' : 'border-zinc-300 bg-white text-black'} p-8 shadow-2xl`}>
            <div className="flex items-center justify-between mb-6 border-b border-zinc-800 pb-4">
              <span className="font-mono text-xs uppercase tracking-widest text-red-500">Reader Preferences</span>
              <button onClick={() => setShowSettings(false)} className="text-zinc-500 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <div className="space-y-6 font-mono text-xs">
              <div>
                <label className="block text-zinc-500 uppercase tracking-widest mb-2">Font Family</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['serif', 'sans', 'mono'] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setFontFamily(f)}
                      className={`py-2 border uppercase tracking-wider ${fontFamily === f ? 'border-red-600 bg-red-950/20 text-white' : 'border-zinc-800 text-zinc-400'}`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-zinc-500 uppercase tracking-widest mb-2">Font Size</label>
                <div className="grid grid-cols-4 gap-2">
                  {(['sm', 'base', 'lg', 'xl'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setFontSize(s)}
                      className={`py-2 border uppercase ${fontSize === s ? 'border-red-600 bg-red-950/20 text-white' : 'border-zinc-800 text-zinc-400'}`}
                    >
                      {s.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-zinc-500 uppercase tracking-widest mb-2">Line Spacing</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['normal', 'relaxed', 'loose'] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLineHeight(l)}
                      className={`py-2 border uppercase tracking-wider ${lineHeight === l ? 'border-red-600 bg-red-950/20 text-white' : 'border-zinc-800 text-zinc-400'}`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-zinc-500 uppercase tracking-widest mb-2">Columns</label>
                <div className="grid grid-cols-2 gap-2">
                  {[1, 2].map((c) => (
                    <button
                      key={c}
                      onClick={() => setColumns(c)}
                      className={`py-2 border uppercase tracking-wider ${columns === c ? 'border-red-600 bg-red-950/20 text-white' : 'border-zinc-800 text-zinc-400'}`}
                    >
                      {c} Column{c > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-zinc-500 uppercase tracking-widest mb-2">Theme</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setTheme('dark')}
                    className={`py-2 border uppercase tracking-wider flex items-center justify-center gap-2 ${theme === 'dark' ? 'border-red-600 bg-red-950/20 text-white' : 'border-zinc-800 text-zinc-400'}`}
                  >
                    <Moon size={14} /> Dark
                  </button>
                  <button
                    onClick={() => setTheme('light')}
                    className={`py-2 border uppercase tracking-wider flex items-center justify-center gap-2 ${theme === 'light' ? 'border-red-600 bg-red-100 text-black' : 'border-zinc-800 text-zinc-400'}`}
                  >
                    <Sun size={14} /> Light
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4 border-t border-zinc-800 flex justify-end">
              <button
                onClick={savePrefs}
                className="w-full bg-white text-black font-bold uppercase tracking-[0.2em] py-3 hover:bg-red-600 hover:text-white transition-all font-mono text-[10px]"
              >
                Save Preferences
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MAIN LAYOUT */}
      <div className="flex-1 flex relative overflow-hidden">
        {/* TOC SIDEBAR */}
        {tocOpen && (
          <aside className={`w-80 border-r ${theme === 'dark' ? 'border-zinc-900 bg-[#070707]' : 'border-zinc-200 bg-white'} overflow-y-auto p-6 z-30 transition-all`}>
            <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-800">
              <span className="font-mono text-xs uppercase tracking-widest text-red-500">Table of Contents</span>
              <button onClick={() => setTocOpen(false)} className="text-zinc-500 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <nav className="space-y-2 font-mono text-xs">
              {toc.map((it) => (
                <button
                  key={it.id}
                  onClick={() => scrollToId(it.id)}
                  style={{ paddingLeft: `${Math.max(0, (it.level - 1) * 12)}px` }}
                  className="block w-full text-left py-1 text-zinc-400 hover:text-red-500 transition-colors truncate"
                >
                  {it.text}
                </button>
              ))}
            </nav>
          </aside>
        )}

        {/* READER CONTENT CONTAINER */}
        <main
          ref={readerRef}
          className="flex-1 h-[calc(100vh-4rem)] overflow-y-auto px-6 py-16 flex justify-center"
        >
          <article className={`w-full max-w-4xl ${sizeClass} ${familyClass} ${lhClass} ${columns === 2 ? 'md:columns-2 md:gap-12' : ''} prose dark:prose-invert`}>
            {loading && (
              <div className="flex flex-col items-center justify-center py-32 gap-4 font-mono text-xs text-zinc-500">
                <Terminal className="animate-pulse text-red-600" size={24} />
                <span>DECRYPTING MANUSCRIPT...</span>
              </div>
            )}

            {error && (
              <div className="border border-red-900/50 bg-red-950/20 p-6 text-red-400 font-mono text-xs">
                &gt; ERROR LOADING SOURCE: {error}
              </div>
            )}

            {fileContent && (
              <Markdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeHighlight]}
                components={{
                  h1: (props) => <HeadingRenderer {...props} level={1} />,
                  h2: (props) => <HeadingRenderer {...props} level={2} />,
                  h3: (props) => <HeadingRenderer {...props} level={3} />,
                  p: (props) => <p className="mb-6 text-zinc-300 font-serif tracking-normal" {...props} />,
                  blockquote: (props) => (
                    <blockquote className="border-l-2 border-red-600 pl-6 my-8 italic text-zinc-400 font-serif" {...props} />
                  ),
                }}
              >
                {normalizeHeadings(fileContent)}
              </Markdown>
            )}
          </article>
        </main>
      </div>

      {/* FOOTER STATS */}
      <footer className={`py-4 px-6 border-t ${theme === 'dark' ? 'border-zinc-900 bg-black text-zinc-600' : 'border-zinc-200 bg-white text-zinc-500'} font-mono text-[10px] uppercase tracking-widest flex items-center justify-between`}>
        <span>Anton Merkurov / Unframed</span>
        <span>Progress: {progress}%</span>
      </footer>
    </div>
  );
}
