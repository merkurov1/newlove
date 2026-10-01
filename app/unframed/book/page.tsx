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
import {
  ArrowLeft,
  BookOpen,
  Check,
  ChevronDown,
  List,
  Menu,
  Minus,
  Plus,
  Settings,
  X,
} from 'lucide-react';

import 'highlight.js/styles/github.css';

type Theme = 'light' | 'dark';
type FontFamily = 'serif' | 'sans';
type Columns = 1 | 2;

interface ReaderPrefs {
  fontSize: number;
  fontFamily: FontFamily;
  lineHeight: number;
  columns: Columns;
  theme: Theme;
}

interface TocItem {
  id: string;
  title: string;
  level: number;
}

const DEFAULT_PREFS: ReaderPrefs = {
  fontSize: 18,
  fontFamily: 'serif',
  lineHeight: 1.75,
  columns: 1,
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

function Paywall({
  onUnlock,
}: {
  onUnlock: () => void;
}) {
  return (
    <main className="min-h-screen bg-black text-white flex items-center justify-center px-6">
      <div className="w-full max-w-xl text-center">
        <div className="mb-8 flex justify-center">
          <div className="flex h-16 w-16 items-center justify-center border border-white/30">
            <BookOpen size={25} strokeWidth={1.2} />
          </div>
        </div>

        <div className="font-mono text-[10px] uppercase tracking-[0.28em] text-white/45 mb-4">
          UNFRAMED / PRIVATE READER
        </div>

        <h1 className="font-serif text-4xl md:text-5xl tracking-tight mb-6">
          The manuscript
        </h1>

        <p className="mx-auto max-w-md text-sm md:text-base leading-7 text-white/60">
          A private reading edition of <i>Unframed</i>, a memoir by Anton
          Merkurov.
        </p>

        <button
          type="button"
          onClick={onUnlock}
          className="mt-10 inline-flex items-center gap-3 border border-white/40 px-7 py-4 font-mono text-[10px] uppercase tracking-[0.22em] transition-colors hover:bg-white hover:text-black"
        >
          <BookOpen size={14} />
          Enter Reader
        </button>

        <div className="mt-8">
          <Link
            href="/unframed"
            className="font-mono text-[9px] uppercase tracking-[0.2em] text-white/35 hover:text-white transition-colors"
          >
            ← Back to Unframed
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function BookReaderPage() {
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [unlocked, setUnlocked] = useState(false);
  const [admin, setAdmin] = useState(false);

  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);

  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const [progress, setProgress] = useState(0);
  const [toc, setToc] = useState<TocItem[]>([]);

  const articleRef = useRef<HTMLElement | null>(null);

  /*
   * ------------------------------------------------------------
   * ACCESS
   * ------------------------------------------------------------
   */

  useEffect(() => {
    try {
      const storedPrefs = window.localStorage.getItem(PREFS_KEY);

      if (storedPrefs) {
        const parsed = JSON.parse(storedPrefs) as Partial<ReaderPrefs>;

        setPrefs({
          ...DEFAULT_PREFS,
          ...parsed,
        });
      }

      const storedUnlocked =
        window.localStorage.getItem(UNLOCKED_KEY) === 'true';

      const storedAdmin =
        window.localStorage.getItem(ADMIN_KEY) === 'true';

      const params = new URLSearchParams(window.location.search);

      const paid = params.get('paid') === '1';
      const adminParam = params.get('admin') === '1';

      if (paid || storedUnlocked) {
        setUnlocked(true);
      }

      if (adminParam || storedAdmin) {
        setAdmin(true);
      }

      /*
       * The current reader keeps the existing client-side access
       * mechanism. For a production paywall, manuscript delivery
       * should ultimately be moved behind server-side entitlement
       * validation.
       */
    } catch {
      // Ignore malformed local preferences.
    }
  }, []);

  /*
   * ------------------------------------------------------------
   * LOAD MANUSCRIPT
   * ------------------------------------------------------------
   */

  useEffect(() => {
    if (!unlocked && !admin) {
      setLoading(false);
      return;
    }

    let cancelled = false;

    const loadBook = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch('/unframed/Unframed.markdown', {
          cache: 'no-store',
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const markdown = await response.text();

        if (!cancelled) {
          setContent(markdown);
        }
      } catch (err) {
        console.error(err);

        if (!cancelled) {
          setError('Unable to load the manuscript.');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadBook();

    return () => {
      cancelled = true;
    };
  }, [unlocked, admin]);

  /*
   * ------------------------------------------------------------
   * UNLOCK
   * ------------------------------------------------------------
   */

  const unlockHandler = useCallback(() => {
    window.localStorage.setItem(UNLOCKED_KEY, 'true');
    setUnlocked(true);
  }, []);

  /*
   * ------------------------------------------------------------
   * PREFERENCES
   * ------------------------------------------------------------
   */

  const updatePrefs = useCallback(
    (patch: Partial<ReaderPrefs>) => {
      setPrefs((current) => {
        const next = {
          ...current,
          ...patch,
        };

        try {
          window.localStorage.setItem(
            PREFS_KEY,
            JSON.stringify(next),
          );
        } catch {
          // Ignore storage failures.
        }

        return next;
      });
    },
    [],
  );

  /*
   * ------------------------------------------------------------
   * SCROLL PROGRESS
   * ------------------------------------------------------------
   */

  useEffect(() => {
    const updateProgress = () => {
      const documentHeight =
        document.documentElement.scrollHeight - window.innerHeight;

      if (documentHeight <= 0) {
        setProgress(0);
        return;
      }

      const value =
        (window.scrollY / documentHeight) * 100;

      setProgress(Math.min(100, Math.max(0, value)));
    };

    updateProgress();

    window.addEventListener('scroll', updateProgress, {
      passive: true,
    });

    window.addEventListener('resize', updateProgress);

    return () => {
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
    };
  }, [content]);

  /*
   * ------------------------------------------------------------
   * TABLE OF CONTENTS
   * ------------------------------------------------------------
   */

  useEffect(() => {
    if (!content) {
      setToc([]);
      return;
    }

    const lines = content.split(/\r?\n/);
    const items: TocItem[] = [];

    for (const line of lines) {
      const match = /^(#{1,3})\s+(.+?)\s*$/.exec(line);

      if (!match) {
        continue;
      }

      const level = match[1].length;

      const title = match[2]
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[*_`]/g, '')
        .trim();

      if (!title) {
        continue;
      }

      items.push({
        id: slugify(title),
        title,
        level,
      });
    }

    setToc(items);
  }, [content]);

  /*
   * ------------------------------------------------------------
   * SCROLL TO SECTION
   * ------------------------------------------------------------
   */

  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);

    if (!element) {
      return;
    }

    element.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });

    setShowToc(false);
  }, []);

  /*
   * ------------------------------------------------------------
   * MARKDOWN COMPONENTS
   *
   * Important:
   * `Components` gives ReactMarkdown proper types for
   * children / href / node etc. This removes the implicit-any
   * error that appeared in the previous version.
   * ------------------------------------------------------------
   */

  const markdownComponents: Components = useMemo(
    () => ({
      h1: ({ children }) => {
        const title = React.Children.toArray(children)
          .map((child: React.ReactNode) =>
            typeof child === 'string' ||
            typeof child === 'number'
              ? String(child)
              : '',
          )
          .join('');

        const id = slugify(title);

        return (
          <h1
            id={id}
            className="scroll-mt-28 mt-20 mb-8 font-serif text-4xl md:text-5xl leading-[1.08] tracking-tight"
          >
            {children}
          </h1>
        );
      },

      h2: ({ children }) => {
        const title = React.Children.toArray(children)
          .map((child: React.ReactNode) =>
            typeof child === 'string' ||
            typeof child === 'number'
              ? String(child)
              : '',
          )
          .join('');

        const id = slugify(title);

        return (
          <h2
            id={id}
            className="scroll-mt-28 mt-16 mb-6 font-serif text-3xl md:text-4xl leading-[1.12] tracking-tight"
          >
            {children}
          </h2>
        );
      },

      h3: ({ children }) => {
        const title = React.Children.toArray(children)
          .map((child: React.ReactNode) =>
            typeof child === 'string' ||
            typeof child === 'number'
              ? String(child)
              : '',
          )
          .join('');

        const id = slugify(title);

        return (
          <h3
            id={id}
            className="scroll-mt-28 mt-12 mb-5 font-serif text-2xl md:text-3xl leading-[1.15]"
          >
            {children}
          </h3>
        );
      },

      p: ({ children }) => (
        <p className="mb-6">
          {children}
        </p>
      ),

      blockquote: ({ children }) => (
        <blockquote className="my-10 border-l border-black/30 dark:border-white/30 pl-6 font-serif italic text-black/65 dark:text-white/65">
          {children}
        </blockquote>
      ),

      ul: ({ children }) => (
        <ul className="mb-7 ml-6 list-disc space-y-2">
          {children}
        </ul>
      ),

      ol: ({ children }) => (
        <ol className="mb-7 ml-6 list-decimal space-y-2">
          {children}
        </ol>
      ),

      li: ({ children }) => (
        <li className="pl-1">
          {children}
        </li>
      ),

      hr: () => (
        <div className="my-16 flex items-center justify-center">
          <span className="h-px w-16 bg-black/20 dark:bg-white/20" />
        </div>
      ),

      a: ({ children, href }) => (
        <a
          href={href}
          className="underline underline-offset-4 decoration-black/30 dark:decoration-white/30 hover:decoration-black dark:hover:decoration-white transition-colors"
          target={
            href?.startsWith('http')
              ? '_blank'
              : undefined
          }
          rel={
            href?.startsWith('http')
              ? 'noreferrer'
              : undefined
          }
        >
          {children}
        </a>
      ),

      strong: ({ children }) => (
        <strong className="font-semibold">
          {children}
        </strong>
      ),

      em: ({ children }) => (
        <em>{children}</em>
      ),

      code: ({ children, className }) => {
        const isBlock = Boolean(
          className?.includes('language-'),
        );

        if (isBlock) {
          return (
            <code
              className={`${className ?? ''} text-[13px] leading-6`}
            >
              {children}
            </code>
          );
        }

        return (
          <code className="rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.5 font-mono text-[0.85em]">
            {children}
          </code>
        );
      },

      pre: ({ children }) => (
        <pre className="my-8 overflow-x-auto rounded-none border border-black/10 dark:border-white/10 bg-black/[0.025] dark:bg-white/[0.04] p-5">
          {children}
        </pre>
      ),

      table: ({ children }) => (
        <div className="my-10 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            {children}
          </table>
        </div>
      ),

      thead: ({ children }) => (
        <thead className="border-b border-black/20 dark:border-white/20">
          {children}
        </thead>
      ),

      tbody: ({ children }) => (
        <tbody>{children}</tbody>
      ),

      tr: ({ children }) => (
        <tr className="border-b border-black/10 dark:border-white/10">
          {children}
        </tr>
      ),

      th: ({ children }) => (
        <th className="px-3 py-3 text-left font-mono text-[10px] uppercase tracking-[0.12em]">
          {children}
        </th>
      ),

      td: ({ children }) => (
        <td className="px-3 py-3 align-top">
          {children}
        </td>
      ),
    }),
    [],
  );

  /*
   * ------------------------------------------------------------
   * THEME CLASSES
   * ------------------------------------------------------------
   */

  const isDark = prefs.theme === 'dark';

  const pageClass = isDark
    ? 'bg-[#111111] text-[#eeeeee]'
    : 'bg-[#f7f7f5] text-[#111111]';

  const headerClass = isDark
    ? 'border-white/10 bg-[#111111]/95'
    : 'border-black/10 bg-[#f7f7f5]/95';

  const mutedClass = isDark
    ? 'text-white/45'
    : 'text-black/45';

  const borderClass = isDark
    ? 'border-white/10'
    : 'border-black/10';

  const readerFont =
    prefs.fontFamily === 'serif'
      ? 'font-serif'
      : 'font-sans';

  /*
   * ------------------------------------------------------------
   * ACCESS SCREEN
   * ------------------------------------------------------------
   */

  if (!unlocked && !admin) {
    return <Paywall onUnlock={unlockHandler} />;
  }

  /*
   * ------------------------------------------------------------
   * LOADING
   * ------------------------------------------------------------
   */

  if (loading) {
    return (
      <main
        className={`min-h-screen ${pageClass} flex items-center justify-center`}
      >
        <div className="text-center">
          <div
            className={`font-mono text-[10px] uppercase tracking-[0.28em] ${mutedClass}`}
          >
            Loading manuscript
          </div>

          <div
            className={`mt-5 h-px w-24 ${
              isDark ? 'bg-white/20' : 'bg-black/20'
            }`}
          />
        </div>
      </main>
    );
  }

  /*
   * ------------------------------------------------------------
   * ERROR
   * ------------------------------------------------------------
   */

  if (error) {
    return (
      <main
        className={`min-h-screen ${pageClass} flex items-center justify-center px-6`}
      >
        <div className="max-w-md text-center">
          <div
            className={`font-mono text-[10px] uppercase tracking-[0.25em] ${mutedClass}`}
          >
            Reader error
          </div>

          <p className="mt-5 text-sm">
            {error}
          </p>

          <Link
            href="/unframed"
            className="mt-8 inline-flex items-center gap-2 border border-current px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em]"
          >
            <ArrowLeft size={13} />
            Back
          </Link>
        </div>
      </main>
    );
  }

  /*
   * ------------------------------------------------------------
   * READER
   * ------------------------------------------------------------
   */

  return (
    <main
      className={`min-h-screen ${pageClass} transition-colors duration-200`}
    >
      {/* TOP HEADER */}

      <header
        className={`fixed inset-x-0 top-0 z-50 border-b ${headerClass} backdrop-blur-md`}
      >
        <div className="mx-auto flex h-14 max-w-[1600px] items-center justify-between px-4 md:px-6">
          <div className="flex min-w-0 items-center gap-4">
            <Link
              href="/unframed"
              className={`flex shrink-0 items-center gap-2 ${mutedClass} hover:opacity-100 transition-opacity`}
              aria-label="Back to Unframed"
            >
              <ArrowLeft size={15} strokeWidth={1.4} />
            </Link>

            <div
              className={`h-4 w-px ${
                isDark ? 'bg-white/15' : 'bg-black/15'
              }`}
            />

            <div className="min-w-0">
              <div className="font-mono text-[9px] uppercase tracking-[0.22em] truncate">
                UNFRAMED
              </div>

              <div
                className={`font-mono text-[8px] uppercase tracking-[0.12em] ${mutedClass} truncate`}
              >
                Anton Merkurov
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1 md:gap-2">
            <div
              className={`hidden sm:block mr-3 font-mono text-[9px] ${mutedClass}`}
            >
              {Math.round(progress)}%
            </div>

            <button
              type="button"
              onClick={() => {
                setShowToc((value) => !value);
                setShowSettings(false);
              }}
              className={`flex h-9 items-center gap-2 px-3 font-mono text-[9px] uppercase tracking-[0.12em] ${mutedClass} hover:opacity-100`}
              aria-label="Table of contents"
            >
              <List size={14} strokeWidth={1.4} />
              <span className="hidden md:inline">
                Contents
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowSettings((value) => !value);
                setShowToc(false);
              }}
              className={`flex h-9 items-center gap-2 px-3 font-mono text-[9px] uppercase tracking-[0.12em] ${mutedClass} hover:opacity-100`}
              aria-label="Reader settings"
            >
              <Settings size={14} strokeWidth={1.4} />
              <span className="hidden md:inline">
                Settings
              </span>
            </button>
          </div>
        </div>

        {/* PROGRESS */}

        <div
          className={`h-px ${
            isDark ? 'bg-white/5' : 'bg-black/5'
          }`}
        >
          <div
            className="h-px bg-current transition-[width] duration-150"
            style={{
              width: `${progress}%`,
            }}
          />
        </div>
      </header>

      {/* TABLE OF CONTENTS DRAWER */}

      {showToc && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowToc(false)}
        >
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

          <aside
            className={`absolute left-0 top-14 bottom-0 w-full max-w-sm overflow-y-auto border-r ${borderClass} ${
              isDark ? 'bg-[#151515]' : 'bg-[#f7f7f5]'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-6 py-5">
              <div>
                <div className="font-mono text-[9px] uppercase tracking-[0.2em]">
                  Contents
                </div>

                <div
                  className={`mt-1 font-mono text-[8px] ${mutedClass}`}
                >
                  {toc.length} sections
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowToc(false)}
                className={mutedClass}
                aria-label="Close contents"
              >
                <X size={16} />
              </button>
            </div>

            <nav className="px-4 py-5">
              {toc.length === 0 ? (
                <div
                  className={`px-2 py-5 text-sm ${mutedClass}`}
                >
                  No sections detected.
                </div>
              ) : (
                toc.map((item: TocItem) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      scrollToSection(item.id)
                    }
                    className={`block w-full border-b ${borderClass} py-3 text-left transition-opacity hover:opacity-60 ${
                      item.level === 1
                        ? 'font-serif text-lg'
                        : item.level === 2
                          ? 'pl-4 font-serif text-base'
                          : 'pl-8 font-sans text-sm'
                    }`}
                  >
                    {item.title}
                  </button>
                ))
              )}
            </nav>
          </aside>
        </div>
      )}

      {/* SETTINGS DRAWER */}

      {showSettings && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowSettings(false)}
        >
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px]" />

          <aside
            className={`absolute right-0 top-14 bottom-0 w-full max-w-sm overflow-y-auto border-l ${borderClass} ${
              isDark ? 'bg-[#151515]' : 'bg-[#f7f7f5]'
            }`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-6 py-5">
              <div className="font-mono text-[9px] uppercase tracking-[0.2em]">
                Reader settings
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowSettings(false)
                }
                className={mutedClass}
                aria-label="Close settings"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-8 px-6 py-7">
              {/* THEME */}

              <section>
                <div
                  className={`mb-3 font-mono text-[9px] uppercase tracking-[0.18em] ${mutedClass}`}
                >
                  Theme
                </div>

                <div
                  className={`grid grid-cols-2 border ${borderClass}`}
                >
                  {(['light', 'dark'] as Theme[]).map(
                    (theme: Theme) => (
                      <button
                        key={theme}
                        type="button"
                        onClick={() =>
                          updatePrefs({ theme })
                        }
                        className={`flex items-center justify-center gap-2 py-3 font-mono text-[9px] uppercase tracking-[0.14em] ${
                          prefs.theme === theme
                            ? isDark
                              ? 'bg-white text-black'
                              : 'bg-black text-white'
                            : ''
                        }`}
                      >
                        {prefs.theme === theme && (
                          <Check size={12} />
                        )}
                        {theme}
                      </button>
                    ),
                  )}
                </div>
              </section>

              {/* FONT */}

              <section>
                <div
                  className={`mb-3 font-mono text-[9px] uppercase tracking-[0.18em] ${mutedClass}`}
                >
                  Typeface
                </div>

                <div
                  className={`grid grid-cols-2 border ${borderClass}`}
                >
                  {(
                    ['serif', 'sans'] as FontFamily[]
                  ).map((font: FontFamily) => (
                    <button
                      key={font}
                      type="button"
                      onClick={() =>
                        updatePrefs({
                          fontFamily: font,
                        })
                      }
                      className={`py-3 text-sm ${
                        font === 'serif'
                          ? 'font-serif'
                          : 'font-sans'
                      } ${
                        prefs.fontFamily === font
                          ? isDark
                            ? 'bg-white text-black'
                            : 'bg-black text-white'
                          : ''
                      }`}
                    >
                      {font === 'serif'
                        ? 'Serif'
                        : 'Sans'}
                    </button>
                  ))}
                </div>
              </section>

              {/* FONT SIZE */}

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <div
                    className={`font-mono text-[9px] uppercase tracking-[0.18em] ${mutedClass}`}
                  >
                    Type size
                  </div>

                  <div className="font-mono text-[9px]">
                    {prefs.fontSize}px
                  </div>
                </div>

                <div className="flex items-center border border-current">
                  <button
                    type="button"
                    onClick={() =>
                      updatePrefs({
                        fontSize: Math.max(
                          14,
                          prefs.fontSize - 1,
                        ),
                      })
                    }
                    className="flex h-11 w-12 items-center justify-center"
                    aria-label="Decrease font size"
                  >
                    <Minus size={15} />
                  </button>

                  <div className="h-5 w-px bg-current opacity-15" />

                  <button
                    type="button"
                    onClick={() =>
                      updatePrefs({
                        fontSize: Math.min(
                          28,
                          prefs.fontSize + 1,
                        ),
                      })
                    }
                    className="flex h-11 flex-1 items-center justify-center"
                    aria-label="Increase font size"
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </section>

              {/* LINE HEIGHT */}

              <section>
                <div className="mb-3 flex items-center justify-between">
                  <div
                    className={`font-mono text-[9px] uppercase tracking-[0.18em] ${mutedClass}`}
                  >
                    Line spacing
                  </div>

                  <div className="font-mono text-[9px]">
                    {prefs.lineHeight.toFixed(2)}
                  </div>
                </div>

                <input
                  type="range"
                  min="1.4"
                  max="2.1"
                  step="0.05"
                  value={prefs.lineHeight}
                  onChange={(event) =>
                    updatePrefs({
                      lineHeight: Number(
                        event.target.value,
                      ),
                    })
                  }
                  className="w-full"
                />
              </section>

              {/* COLUMNS */}

              <section>
                <div
                  className={`mb-3 font-mono text-[9px] uppercase tracking-[0.18em] ${mutedClass}`}
                >
                  Layout
                </div>

                <div
                  className={`grid grid-cols-2 border ${borderClass}`}
                >
                  {([1, 2] as Columns[]).map(
                    (columns: Columns) => (
                      <button
                        key={columns}
                        type="button"
                        onClick={() =>
                          updatePrefs({
                            columns,
                          })
                        }
                        className={`py-3 font-mono text-[9px] uppercase tracking-[0.14em] ${
                          prefs.columns === columns
                            ? isDark
                              ? 'bg-white text-black'
                              : 'bg-black text-white'
                            : ''
                        }`}
                      >
                        {columns === 1
                          ? 'Single'
                          : 'Two columns'}
                      </button>
                    ),
                  )}
                </div>

                {prefs.columns === 2 && (
                  <p
                    className={`mt-3 text-[11px] leading-5 ${mutedClass}`}
                  >
                    Two-column mode is intended for
                    wider desktop screens.
                  </p>
                )}
              </section>

              {/* RESET */}

              <section className={`border-t ${borderClass} pt-6`}>
                <button
                  type="button"
                  onClick={() =>
                    updatePrefs(DEFAULT_PREFS)
                  }
                  className={`font-mono text-[9px] uppercase tracking-[0.16em] ${mutedClass} hover:opacity-100`}
                >
                  Reset reader settings
                </button>
              </section>
            </div>
          </aside>
        </div>
      )}

      {/* BOOK */}

      <article
        ref={articleRef}
        className="mx-auto px-5 pb-32 pt-28 md:px-8 md:pt-32"
      >
        <div
          className={`mx-auto ${
            prefs.columns === 2
              ? 'max-w-[1200px]'
              : 'max-w-3xl'
          }`}
        >
          {/* BOOK HEADER */}

          <header className="mb-20 border-b pb-10">
            <div
              className={`mb-7 font-mono text-[9px] uppercase tracking-[0.24em] ${mutedClass}`}
            >
              Private Reading Edition
            </div>

            <h1 className="font-serif text-5xl md:text-7xl leading-[0.95] tracking-[-0.035em]">
              Unframed
            </h1>

            <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2">
              <span
                className={`font-mono text-[9px] uppercase tracking-[0.16em] ${mutedClass}`}
              >
                Anton Merkurov
              </span>

              <span
                className={`h-1 w-1 rounded-full ${
                  isDark ? 'bg-white/30' : 'bg-black/30'
                }`}
              />

              <span
                className={`font-mono text-[9px] uppercase tracking-[0.16em] ${mutedClass}`}
              >
                2026
              </span>
            </div>
          </header>

          {/* MARKDOWN */}

          <div
            className={`
              ${readerFont}
              ${prefs.columns === 2 ? 'md:columns-2 md:gap-16' : ''}
              [&_img]:max-w-full
              [&_img]:h-auto
              [&_img]:my-10
              [&_figure]:my-10
              [&_figcaption]:font-mono
              [&_figcaption]:text-[9px]
              [&_figcaption]:uppercase
              [&_figcaption]:tracking-[0.12em]
              [&_figcaption]:opacity-45
            `}
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

          {/* END */}

          <div className="mt-32 border-t pt-12 text-center">
            <div
              className={`mx-auto mb-6 h-px w-12 ${
                isDark ? 'bg-white/25' : 'bg-black/25'
              }`}
            />

            <div
              className={`font-mono text-[9px] uppercase tracking-[0.24em] ${mutedClass}`}
            >
              End of manuscript
            </div>

            <div
              className={`mt-3 font-serif text-lg ${mutedClass}`}
            >
              Unframed
            </div>

            <Link
              href="/unframed"
              className={`mt-8 inline-flex items-center gap-2 font-mono text-[9px] uppercase tracking-[0.16em] ${mutedClass} hover:opacity-100`}
            >
              <ArrowLeft size={12} />
              Return to book page
            </Link>
          </div>
        </div>
      </article>

      {/* MOBILE FLOATING MENU */}

      <button
        type="button"
        onClick={() => {
          setShowToc((value) => !value);
          setShowSettings(false);
        }}
        className={`fixed bottom-5 right-5 z-30 flex h-12 w-12 items-center justify-center rounded-full border ${borderClass} ${
          isDark
            ? 'bg-[#151515] text-white'
            : 'bg-white text-black'
        } shadow-sm md:hidden`}
        aria-label="Open contents"
      >
        {showToc ? (
          <X size={17} strokeWidth={1.3} />
        ) : (
          <Menu size={17} strokeWidth={1.3} />
        )}
      </button>

      {/* FOOTER */}

      <footer
        className={`border-t ${borderClass} px-6 py-8`}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6">
          <div
            className={`font-mono text-[8px] uppercase tracking-[0.16em] ${mutedClass}`}
          >
            Anton Merkurov / Unframed
          </div>

          <div
            className={`font-mono text-[8px] uppercase tracking-[0.16em] ${mutedClass}`}
          >
            {Math.round(progress)}%
          </div>
        </div>
      </footer>
    </main>
  );
}