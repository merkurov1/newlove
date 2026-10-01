'use client';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import Header from '@/components/Header';
import {
  ArrowLeft,
  BookOpen,
  Check,
  List,
  Menu,
  Minus,
  Plus,
  Settings,
  X,
} from 'lucide-react';

import 'highlight.js/styles/github.css';

type Theme = 'light' | 'sepia' | 'dark';
type FontFamily = 'serif' | 'sans';

interface ReaderPrefs {
  fontSize: number;
  fontFamily: FontFamily;
  lineHeight: number;
  theme: Theme;
}

interface TocItem {
  id: string;
  title: string;
  level: number;
}

const DEFAULT_PREFS: ReaderPrefs = {
  fontSize: 19,
  fontFamily: 'serif',
  lineHeight: 1.8,
  theme: 'light',
};

const PREFS_KEY = 'unframed_prefs';
const UNLOCKED_KEY = 'unframed_unlocked';
const ADMIN_KEY = 'unframed_admin';

const slugify = (value: string): string => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
};

function Paywall({ onUnlock }: { onUnlock: () => void }) {
  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white flex flex-col selection:bg-white selection:text-black">
      <Header />
      <div className="flex-1 flex items-center justify-center px-6 pt-36 pb-16">
        <div className="w-full max-w-xl text-center space-y-6">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center border border-white/20 rounded-2xl bg-white/5 backdrop-blur-md">
              <BookOpen size={24} strokeWidth={1.5} />
            </div>
          </div>

          <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/40">
            UNFRAMED / PRIVATE READER
          </div>

          <h1 className="font-serif text-4xl md:text-5xl tracking-tight">
            The Manuscript
          </h1>

          <p className="mx-auto max-w-md text-sm md:text-base leading-relaxed text-white/60 font-serif">
            A private reading edition of <i>Unframed</i>, a memoir by Anton Merkurov.
          </p>

          <div className="pt-4">
            <button
              type="button"
              onClick={onUnlock}
              className="inline-flex items-center gap-3 bg-white text-black px-8 py-4 font-mono text-xs uppercase tracking-[0.2em] transition-all hover:bg-white/90 active:scale-95 shadow-lg cursor-pointer"
            >
              <BookOpen size={14} />
              Enter Reader
            </button>
          </div>

          <div className="pt-4">
            <Link
              href="/unframed"
              className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 hover:text-white transition-colors"
            >
              ← Back to Unframed overview
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function BookReaderPage() {
  // Надежная синхронная ленивая инициализация прав с клиента, исключающая проскок
  const [authChecked, setAuthChecked] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [admin, setAdmin] = useState(false);

  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [progress, setProgress] = useState(0);
  const [toc, setToc] = useState<TocItem[]>([]);

  const articleRef = useRef<HTMLElement | null>(null);

  // Первичная проверка прав доступа и параметров URL
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const paid = params.get('paid') === '1';
      const adminParam = params.get('admin') === '1';

      if (paid) {
        window.localStorage.setItem(UNLOCKED_KEY, 'true');
      }
      if (adminParam) {
        window.localStorage.setItem(ADMIN_KEY, 'true');
      }

      const storedUnlocked = window.localStorage.getItem(UNLOCKED_KEY) === 'true';
      const storedAdmin = window.localStorage.getItem(ADMIN_KEY) === 'true';

      setUnlocked(storedUnlocked || paid);
      setAdmin(storedAdmin || adminParam);

      const storedPrefs = window.localStorage.getItem(PREFS_KEY);
      if (storedPrefs) {
        const parsed = JSON.parse(storedPrefs) as Partial<ReaderPrefs>;
        setPrefs((prev) => ({ ...prev, ...parsed }));
      }
    } catch {
      // Игнорируем ошибки хранилища
    } finally {
      setAuthChecked(true);
    }
  }, []);

  // Загрузка файла книги только после подтверждения авторизации
  useEffect(() => {
    if (!authChecked || (!unlocked && !admin)) return;

    let cancelled = false;
    const loadBook = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch('/unframed/Unframed.markdown', { cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const markdown = await response.text();
        if (!cancelled) setContent(markdown);
      } catch (err) {
        console.error(err);
        if (!cancelled) setError('Unable to load the manuscript.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadBook();
    return () => {
      cancelled = true;
    };
  }, [authChecked, unlocked, admin]);

  const unlockHandler = useCallback(() => {
    try {
      window.localStorage.setItem(UNLOCKED_KEY, 'true');
    } catch {}
    setUnlocked(true);
  }, []);

  const updatePrefs = useCallback((patch: Partial<ReaderPrefs>) => {
    setPrefs((current) => {
      const next = { ...current, ...patch };
      try {
        window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  // Расчет прогресса чтения
  useEffect(() => {
    const updateProgress = () => {
      const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
      if (documentHeight <= 0) {
        setProgress(0);
        return;
      }
      const value = (window.scrollY / documentHeight) * 100;
      setProgress(Math.min(100, Math.max(0, value)));
    };

    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
    return () => {
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
    };
  }, [content]);

  // Генерация оглавления (TOC)
  useEffect(() => {
    if (!content) {
      setToc([]);
      return;
    }
    const lines = content.split(/\r?\n/);
    const items: TocItem[] = [];
    for (const line of lines) {
      const match = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
      if (!match) continue;
      const level = match[1].length;
      const title = match[2]
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_`]/g, '')
        .trim();
      if (!title) continue;
      items.push({ id: slugify(title), title, level });
    }
    setToc(items);
  }, [content]);

  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (!element) return;
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setShowToc(false);
  }, []);

  const markdownComponents: Components = useMemo(
    () => ({
      h1: ({ children }) => {
        const textContent = React.Children.toArray(children).join('');
        const id = slugify(textContent);
        return (
          <h1 id={id} className="scroll-mt-36 mt-28 mb-10 font-serif text-3xl md:text-4xl tracking-tight font-normal border-b border-current/10 pb-4">
            {children}
          </h1>
        );
      },
      h2: ({ children }) => {
        const textContent = React.Children.toArray(children).join('');
        const id = slugify(textContent);
        return (
          <h2 id={id} className="scroll-mt-36 mt-20 mb-6 font-serif text-2xl md:text-3xl tracking-tight font-normal">
            {children}
          </h2>
        );
      },
      h3: ({ children }) => {
        const textContent = React.Children.toArray(children).join('');
        const id = slugify(textContent);
        return (
          <h3 id={id} className="scroll-mt-36 mt-14 mb-4 font-serif text-xl md:text-2xl font-normal">
            {children}
          </h3>
        );
      },
      p: ({ children }) => <p className="mb-6 leading-relaxed">{children}</p>,
      blockquote: ({ children }) => (
        <blockquote className="my-8 border-l-2 border-current/40 pl-6 font-serif italic opacity-90">
          {children}
        </blockquote>
      ),
      ul: ({ children }) => <ul className="mb-6 ml-6 list-disc space-y-2">{children}</ul>,
      ol: ({ children }) => <ol className="mb-6 ml-6 list-decimal space-y-2">{children}</ol>,
      li: ({ children }) => <li className="pl-1">{children}</li>,
      hr: () => (
        <div className="my-16 flex items-center justify-center">
          <span className="h-px w-16 bg-current opacity-20" />
        </div>
      ),
      a: ({ children, href }) => (
        <a
          href={href}
          className="underline underline-offset-4 decoration-current/30 hover:decoration-current transition-colors"
          target={href?.startsWith('http') ? '_blank' : undefined}
          rel={href?.startsWith('http') ? 'noreferrer' : undefined}
        >
          {children}
        </a>
      ),
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      em: ({ children }) => <em>{children}</em>,
      code: ({ children, className }) => {
        const isBlock = Boolean(className?.includes('language-'));
        if (isBlock) {
          return <code className={`${className ?? ''} text-[13px] leading-6`}>{children}</code>;
        }
        return <code className="rounded bg-current/10 px-1.5 py-0.5 font-mono text-[0.85em]">{children}</code>;
      },
      pre: ({ children }) => (
        <pre className="my-8 overflow-x-auto rounded-xl border border-current/10 bg-current/[0.03] p-5">{children}</pre>
      ),
    }),
    [],
  );

  const themeClasses = {
    light: 'bg-[#faf9f5] text-[#1c1c1c]',
    sepia: 'bg-[#f4ecd8] text-[#3c2f2f]',
    dark: 'bg-[#121212] text-[#e0e0e0]',
  };

  const currentThemeClass = themeClasses[prefs.theme];
  const mutedClass = prefs.theme === 'dark' ? 'text-white/45' : prefs.theme === 'sepia' ? 'text-[#3c2f2f]/60' : 'text-black/50';
  const borderClass = prefs.theme === 'dark' ? 'border-white/10' : prefs.theme === 'sepia' ? 'border-[#3c2f2f]/15' : 'border-black/10';
  const readerFont = prefs.fontFamily === 'serif' ? 'font-serif' : 'font-sans';

  // ЖЕСТКИЙ БЛОКАТОР: Если проверка не завершена ИЛИ нет доступа — сразу рендерим Paywall
  if (!authChecked || (!unlocked && !admin)) {
    return <Paywall onUnlock={unlockHandler} />;
  }

  if (loading) {
    return (
      <div className={`min-h-screen ${currentThemeClass} flex flex-col`}>
        <Header />
        <div className="flex-1 flex items-center justify-center pt-24">
          <div className="text-center space-y-4">
            <div className={`font-mono text-[10px] uppercase tracking-[0.25em] ${mutedClass}`}>
              Opening manuscript...
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`min-h-screen ${currentThemeClass} flex flex-col`}>
        <Header />
        <div className="flex-1 flex items-center justify-center px-6 pt-24">
          <div className="max-w-md text-center space-y-4">
            <div className={`font-mono text-[10px] uppercase tracking-[0.25em] ${mutedClass}`}>Reader error</div>
            <p className="text-sm font-serif">{error}</p>
            <Link
              href="/unframed"
              className="inline-flex items-center gap-2 border border-current px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em]"
            >
              <ArrowLeft size={13} />
              Back
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${currentThemeClass} transition-colors duration-300 relative`}>
      <Header />

      {/* TOP READER BAR — зафиксировано корректно ниже хедера с высоким z-index */}
      <div className={`sticky top-0 z-40 border-b ${borderClass} ${prefs.theme === 'dark' ? 'bg-[#121212]/95' : prefs.theme === 'sepia' ? 'bg-[#f4ecd8]/95' : 'bg-[#faf9f5]/95'} backdrop-blur-md shadow-xs`}>
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <Link
              href="/unframed"
              className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] ${mutedClass} hover:opacity-100 transition-opacity`}
            >
              <ArrowLeft size={13} />
              <span>Back</span>
            </Link>
            <span className={`h-3 w-px ${borderClass}`} />
            <span className={`font-mono text-[10px] uppercase tracking-[0.15em] ${mutedClass} truncate max-w-[180px] md:max-w-md`}>
              Unframed / Anton Merkurov
            </span>
          </div>

          <div className="flex items-center gap-4">
            <span className={`font-mono text-[10px] hidden sm:inline ${mutedClass}`}>
              {Math.round(progress)}%
            </span>

            <button
              type="button"
              onClick={() => {
                setShowToc((v) => !v);
                setShowSettings(false);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border ${borderClass} font-mono text-[10px] uppercase tracking-[0.12em] hover:bg-current/5 transition-colors cursor-pointer`}
            >
              <List size={13} />
              <span className="hidden md:inline">Contents</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowSettings((v) => !v);
                setShowToc(false);
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border ${borderClass} font-mono text-[10px] uppercase tracking-[0.12em] hover:bg-current/5 transition-colors cursor-pointer`}
            >
              <Settings size={13} />
              <span className="hidden md:inline">Settings</span>
            </button>
          </div>
        </div>

        {/* PROGRESS LINE */}
        <div className="h-[2px] w-full bg-current/10">
          <div
            className="h-full bg-current transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* TOC DRAWER */}
      {showToc && (
        <div className="fixed inset-0 z-50" onClick={() => setShowToc(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" />
          <aside
            className={`absolute left-0 top-0 bottom-0 w-full max-w-sm overflow-y-auto border-r ${borderClass} ${
              prefs.theme === 'dark' ? 'bg-[#181818]' : prefs.theme === 'sepia' ? 'bg-[#efe5ce]' : 'bg-[#fff]'
            } p-6 shadow-2xl z-50`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-6 border-b border-current/10 mb-6">
              <span className="font-mono text-xs uppercase tracking-[0.2em]">Contents</span>
              <button type="button" onClick={() => setShowToc(false)} className={`${mutedClass} cursor-pointer`}>
                <X size={18} />
              </button>
            </div>
            <nav className="space-y-2">
              {toc.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className={`block w-full text-left py-2.5 hover:opacity-70 transition-opacity cursor-pointer ${
                    item.level === 1
                      ? 'font-serif font-medium text-base'
                      : item.level === 2
                      ? 'pl-4 font-serif text-sm'
                      : 'pl-8 font-sans text-xs'
                  } ${mutedClass}`}
                >
                  {item.title}
                </button>
              ))}
            </nav>
          </aside>
        </div>
      )}

      {/* SETTINGS DRAWER */}
      {showSettings && (
        <div className="fixed inset-0 z-50" onClick={() => setShowSettings(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-xs" />
          <aside
            className={`absolute right-0 top-0 bottom-0 w-full max-w-sm overflow-y-auto border-l ${borderClass} ${
              prefs.theme === 'dark' ? 'bg-[#181818]' : prefs.theme === 'sepia' ? 'bg-[#efe5ce]' : 'bg-[#fff]'
            } p-6 shadow-2xl z-50 space-y-8`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-6 border-b border-current/10">
              <span className="font-mono text-xs uppercase tracking-[0.2em]">Reader Settings</span>
              <button type="button" onClick={() => setShowSettings(false)} className={`${mutedClass} cursor-pointer`}>
                <X size={18} />
              </button>
            </div>

            {/* Theme */}
            <div className="space-y-3">
              <label className={`font-mono text-[10px] uppercase tracking-[0.15em] ${mutedClass}`}>Theme</label>
              <div className="grid grid-cols-3 gap-2">
                {(['light', 'sepia', 'dark'] as Theme[]).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => updatePrefs({ theme: t })}
                    className={`py-2.5 font-mono text-[9px] uppercase tracking-[0.12em] border rounded-lg flex items-center justify-center gap-1 cursor-pointer ${
                      prefs.theme === t ? 'border-current bg-current text-white dark:text-black font-medium' : borderClass
                    }`}
                  >
                    {prefs.theme === t && <Check size={11} />}
                    {t}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Family */}
            <div className="space-y-3">
              <label className={`font-mono text-[10px] uppercase tracking-[0.15em] ${mutedClass}`}>Typeface</label>
              <div className="grid grid-cols-2 gap-2">
                {(['serif', 'sans'] as FontFamily[]).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => updatePrefs({ fontFamily: f })}
                    className={`py-2.5 text-sm rounded-lg border cursor-pointer ${
                      f === 'serif' ? 'font-serif' : 'font-sans'
                    } ${
                      prefs.fontFamily === f ? 'border-current bg-current text-white dark:text-black font-medium' : borderClass
                    }`}
                  >
                    {f === 'serif' ? 'Serif' : 'Sans'}
                  </button>
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className={`font-mono text-[10px] uppercase tracking-[0.15em] ${mutedClass}`}>Font Size</label>
                <span className="font-mono text-xs">{prefs.fontSize}px</span>
              </div>
              <div className="flex items-center border border-current/25 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => updatePrefs({ fontSize: Math.max(15, prefs.fontSize - 1) })}
                  className="flex-1 py-2.5 flex items-center justify-center hover:bg-current/5 cursor-pointer"
                >
                  <Minus size={14} />
                </button>
                <div className="w-px h-6 bg-current/20" />
                <button
                  type="button"
                  onClick={() => updatePrefs({ fontSize: Math.min(26, prefs.fontSize + 1) })}
                  className="flex-1 py-2.5 flex items-center justify-center hover:bg-current/5 cursor-pointer"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            {/* Line Height */}
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label className={`font-mono text-[10px] uppercase tracking-[0.15em] ${mutedClass}`}>Line Spacing</label>
                <span className="font-mono text-xs">{prefs.lineHeight.toFixed(2)}</span>
              </div>
              <input
                type="range"
                min="1.5"
                max="2.2"
                step="0.05"
                value={prefs.lineHeight}
                onChange={(e) => updatePrefs({ lineHeight: Number(e.target.value) })}
                className="w-full accent-current cursor-pointer"
              />
            </div>

            {/* Reset */}
            <div className="pt-4 border-t border-current/10">
              <button
                type="button"
                onClick={() => updatePrefs(DEFAULT_PREFS)}
                className={`font-mono text-[10px] uppercase tracking-[0.15em] ${mutedClass} hover:opacity-100 cursor-pointer`}
              >
                Reset to default
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* ARTICLE / BOOK CONTENT */}
      <article ref={articleRef} className="mx-auto px-6 py-28 max-w-2xl">
        <header className="mb-20 text-center border-b border-current/15 pb-14">
          <div className={`font-mono text-[10px] uppercase tracking-[0.3em] ${mutedClass} mb-4`}>
            Private Memoir Edition
          </div>
          <h1 className="font-serif text-5xl md:text-6xl tracking-tight mb-4 font-normal">Unframed</h1>
          <div className={`font-mono text-xs uppercase tracking-[0.25em] ${mutedClass}`}>
            Anton Merkurov
          </div>
        </header>

        <div
          className={`${readerFont} text-justify`}
          style={{
            fontSize: `${prefs.fontSize}px`,
            lineHeight: prefs.lineHeight,
          }}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
            components={markdownComponents}
          >
            {content}
          </ReactMarkdown>
        </div>

        <div className="mt-32 border-t border-current/15 pt-14 text-center">
          <div className={`font-mono text-[10px] uppercase tracking-[0.25em] ${mutedClass} mb-4`}>
            End of manuscript
          </div>
          <Link
            href="/unframed"
            className="inline-flex items-center gap-2 font-mono text-xs uppercase tracking-[0.2em] underline underline-offset-8 hover:opacity-70 transition-opacity"
          >
            <ArrowLeft size={13} />
            Return to overview
          </Link>
        </div>
      </article>

      {/* MOBILE FLOATING MENU BUTTON */}
      <button
        type="button"
        onClick={() => {
          setShowToc((v) => !v);
          setShowSettings(false);
        }}
        className={`fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border ${borderClass} ${
          prefs.theme === 'dark' ? 'bg-[#181818] text-white' : prefs.theme === 'sepia' ? 'bg-[#efe5ce] text-[#3c2f2f]' : 'bg-white text-black'
        } shadow-xl md:hidden cursor-pointer`}
      >
        {showToc ? <X size={18} /> : <Menu size={18} />}
      </button>
    </div>
  );
}
