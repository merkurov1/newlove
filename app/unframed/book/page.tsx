'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Paywall from './Paywall';
import ReaderPanel from './ReaderPanel';
import { extractHeadings, headingIdsByLine } from './readerDocument';
import {
  DEFAULT_PREFS,
  loadPrefs,
  loadReadingPosition,
  sanitizePrefs,
  savePrefs,
  saveReadingPosition,
  type FontFamily,
  type ReaderPrefs,
  type Theme,
} from './readerStorage';
import { ArrowLeft, Check, List, Menu, Minus, Plus, Settings, X } from 'lucide-react';

type ReaderStatus = 'loading' | 'locked' | 'ready' | 'error';

const CONTENT_ENDPOINT = '/api/unframed/content';

async function readApiMessage(response: Response, fallback: string): Promise<string> {
  try {
    const data = (await response.json()) as { error?: unknown };
    if (typeof data?.error === 'string' && data.error.trim()) return data.error;
  } catch {
    // The response was not JSON.
  }

  return fallback;
}

export default function BookReaderPage() {
  const [isMounted, setIsMounted] = useState(false);
  const [status, setStatus] = useState<ReaderStatus>('loading');
  const [content, setContent] = useState('');
  const [manuscriptVersion, setManuscriptVersion] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [prefs, setPrefs] = useState<ReaderPrefs>(DEFAULT_PREFS);
  const [showToc, setShowToc] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [progress, setProgress] = useState(0);

  const saveTimerRef = useRef<number | null>(null);
  const restoredVersionRef = useRef<string | null>(null);

  const toc = useMemo(() => extractHeadings(content), [content]);
  const headingIds = useMemo(() => headingIdsByLine(toc), [toc]);

  const loadManuscript = useCallback(async (showLoading = true): Promise<ReaderStatus> => {
    if (showLoading) setStatus('loading');
    setError(null);

    try {
      const response = await fetch(CONTENT_ENDPOINT, {
        cache: 'no-store',
        headers: { accept: 'application/json' },
      });

      if (response.status === 401) {
        setContent('');
        setManuscriptVersion('');
        setStatus('locked');
        return 'locked';
      }

      if (!response.ok) {
        const message = await readApiMessage(response, 'Manuscript temporarily unavailable.');
        throw new Error(message);
      }

      const data = (await response.json()) as { content?: unknown; version?: unknown };

      if (typeof data.content !== 'string' || !data.content.trim()) {
        throw new Error('The manuscript response was empty.');
      }

      setContent(data.content);
      setManuscriptVersion(typeof data.version === 'string' ? data.version : '');
      setNotice(null);
      setStatus('ready');
      return 'ready';
    } catch (loadError) {
      console.error('UNFRAMED reader: manuscript load failed', loadError);
      setStatus('error');
      setError(
        'The manuscript is temporarily unavailable. Your access has not been changed. Please retry in a moment.'
      );
      return 'error';
    }
  }, []);

  useEffect(() => {
    // The reader is a focused mode with its own toolbar. The global fixed
    // header otherwise overlaps the Back / Contents / Settings controls.
    const siteHeader = document.querySelector<HTMLElement>('header.site-header');
    if (!siteHeader) return;

    const previousDisplay = siteHeader.style.display;
    siteHeader.style.display = 'none';

    return () => {
      siteHeader.style.display = previousDisplay;
    };
  }, []);

  useEffect(() => {
    setIsMounted(true);
    setPrefs(loadPrefs());

    let active = true;

    const initialize = async () => {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('session_id');
      const cancelled = params.get('checkout') === 'cancelled';

      if (cancelled) {
        setNotice('Payment was cancelled. No charge was made by this reader.');
      }

      let verificationUnavailable = false;
      let verificationConfirmed = false;

      if (sessionId) {
        try {
          const response = await fetch(
            `/api/unframed/verify?session_id=${encodeURIComponent(sessionId)}`,
            { cache: 'no-store' }
          );

          if (response.ok) {
            verificationConfirmed = true;
          } else if (response.status >= 500) {
            verificationUnavailable = true;
          } else {
            setNotice(
              'This payment could not be confirmed. If you completed checkout, reopen the confirmation link or contact support.'
            );
          }
        } catch {
          verificationUnavailable = true;
        }

        // Never leave a consumed or invalid session id in the address bar.
        params.delete('session_id');
        params.delete('checkout');
        const query = params.toString();
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
        );
      } else if (cancelled) {
        params.delete('checkout');
        const query = params.toString();
        window.history.replaceState(
          {},
          '',
          `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`
        );
      }

      if (!active) return;

      const result = await loadManuscript();

      if (!active) return;

      if (result === 'locked' && verificationUnavailable) {
        setStatus('error');
        setError(
          'We could not confirm your payment because the verification service is unavailable. Please retry in a moment.'
        );
      } else if (result === 'locked' && verificationConfirmed) {
        setNotice(
          'Payment was confirmed, but this browser did not receive access. Reload the page; if the problem persists, contact support.'
        );
      }
    };

    void initialize();

    return () => {
      active = false;
    };
  }, [loadManuscript]);

  const updatePrefs = useCallback((patch: Partial<ReaderPrefs>) => {
    setPrefs((current) => {
      const next = sanitizePrefs({ ...current, ...patch });
      savePrefs(next);
      return next;
    });
  }, []);

  const closeToc = useCallback(() => setShowToc(false), []);
  const closeSettings = useCallback(() => setShowSettings(false), []);

  const handleUnlock = useCallback(async (): Promise<boolean> => {
    const result = await loadManuscript(false);

    if (result === 'locked') {
      setNotice(
        'Administrative clearance was accepted, but the access cookie was not applied. Please retry.'
      );
      return false;
    }

    return result === 'ready';
  }, [loadManuscript]);

  const handleRetry = useCallback(async () => {
    const result = await loadManuscript();

    if (result === 'locked') {
      setNotice('Access could not be confirmed. Purchase access or sign in again.');
    }
  }, [loadManuscript]);

  const currentProgress = useCallback((): number => {
    const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
    if (documentHeight <= 0) return 0;
    return Math.min(1, Math.max(0, window.scrollY / documentHeight));
  }, []);

  useEffect(() => {
    if (status !== 'ready') return;

    let frame = 0;

    const updateProgress = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const value = currentProgress();
        setProgress(value * 100);

        if (!manuscriptVersion) return;
        if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = window.setTimeout(() => {
          saveReadingPosition(manuscriptVersion, value);
        }, 400);
      });
    };

    const persistNow = () => {
      if (!manuscriptVersion) return;
      saveReadingPosition(manuscriptVersion, currentProgress());
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') persistNow();
    };

    updateProgress();
    window.addEventListener('scroll', updateProgress, { passive: true });
    window.addEventListener('resize', updateProgress);
    window.addEventListener('pagehide', persistNow);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelAnimationFrame(frame);
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      window.removeEventListener('scroll', updateProgress);
      window.removeEventListener('resize', updateProgress);
      window.removeEventListener('pagehide', persistNow);
      document.removeEventListener('visibilitychange', handleVisibility);
      persistNow();
    };
  }, [status, manuscriptVersion, currentProgress]);

  useEffect(() => {
    if (status !== 'ready' || !manuscriptVersion) return;
    if (restoredVersionRef.current === manuscriptVersion) return;

    restoredVersionRef.current = manuscriptVersion;

    // An explicit anchor wins over a remembered position.
    if (window.location.hash) return;

    const saved = loadReadingPosition(manuscriptVersion);
    if (saved === null || saved <= 0.005) return;

    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const documentHeight = document.documentElement.scrollHeight - window.innerHeight;
        if (documentHeight > 0) {
          window.scrollTo({ top: Math.round(saved * documentHeight), behavior: 'auto' });
        }
      });
    });

    return () => {
      cancelAnimationFrame(firstFrame);
      cancelAnimationFrame(secondFrame);
    };
  }, [status, manuscriptVersion]);

  const scrollToSection = useCallback((id: string) => {
    const element = document.getElementById(id);
    if (!element) return;

    element.setAttribute('tabindex', '-1');
    element.focus({ preventScroll: true });
    element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    window.history.replaceState(null, '', `#${id}`);
    setShowToc(false);
  }, []);

  const handleTocKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;

    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>('[data-toc-item]')
    );
    if (buttons.length === 0) return;

    const activeElement = document.activeElement;
    const currentIndex = buttons.indexOf(activeElement as HTMLButtonElement);
    let nextIndex = currentIndex;

    if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = buttons.length - 1;
    } else if (event.key === 'ArrowDown') {
      nextIndex = currentIndex < 0 ? 0 : Math.min(currentIndex + 1, buttons.length - 1);
    } else {
      nextIndex = currentIndex < 0 ? buttons.length - 1 : Math.max(currentIndex - 1, 0);
    }

    event.preventDefault();
    buttons[nextIndex]?.focus();
  };

  const markdownComponents: Components = useMemo(() => {
    const headingId = (line: number | undefined) => (line ? headingIds.get(line) : undefined);

    return {
      h1: ({ children, node }) => (
        <h1
          id={headingId(node?.position?.start.line)}
          tabIndex={-1}
          className="scroll-mt-36 mt-28 mb-10 font-serif text-3xl md:text-4xl tracking-tight font-normal border-b border-current/10 pb-4 focus:outline-none"
        >
          {children}
        </h1>
      ),
      h2: ({ children, node }) => (
        <h2
          id={headingId(node?.position?.start.line)}
          tabIndex={-1}
          className="scroll-mt-36 mt-20 mb-6 font-serif text-2xl md:text-3xl tracking-tight font-normal focus:outline-none"
        >
          {children}
        </h2>
      ),
      h3: ({ children, node }) => (
        <h3
          id={headingId(node?.position?.start.line)}
          tabIndex={-1}
          className="scroll-mt-36 mt-14 mb-4 font-serif text-xl md:text-2xl font-normal focus:outline-none"
        >
          {children}
        </h3>
      ),
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
          rel={href?.startsWith('http') ? 'noopener noreferrer' : undefined}
        >
          {children}
        </a>
      ),
      strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      em: ({ children }) => <em>{children}</em>,
      code: ({ children, className }) => {
        const isBlock = Boolean(className?.includes('language-'));
        if (isBlock) {
          return (
            <code
              className={`${className ?? ''} text-[13px] leading-6 block overflow-x-auto p-4 bg-current/5 rounded`}
            >
              {children}
            </code>
          );
        }
        return (
          <code className="rounded bg-current/10 px-1.5 py-0.5 font-mono text-[0.85em]">
            {children}
          </code>
        );
      },
      pre: ({ children }) => (
        <pre className="my-8 overflow-x-auto rounded-xl border border-current/10 bg-current/[0.03] p-5">
          {children}
        </pre>
      ),
    };
  }, [headingIds]);

  const themeClasses = {
    light: 'bg-[#faf9f5] text-[#1c1c1c]',
    sepia: 'bg-[#f4ecd8] text-[#3c2f2f]',
    dark: 'bg-[#121212] text-[#e0e0e0]',
  };

  const currentThemeClass = themeClasses[prefs.theme];
  const mutedClass =
    prefs.theme === 'dark'
      ? 'text-white/45'
      : prefs.theme === 'sepia'
        ? 'text-[#3c2f2f]/60'
        : 'text-black/50';
  const borderClass =
    prefs.theme === 'dark'
      ? 'border-white/10'
      : prefs.theme === 'sepia'
        ? 'border-[#3c2f2f]/15'
        : 'border-black/10';
  const panelBackground =
    prefs.theme === 'dark' ? 'bg-[#181818]' : prefs.theme === 'sepia' ? 'bg-[#efe5ce]' : 'bg-white';
  const readerFont = prefs.fontFamily === 'serif' ? 'font-serif' : 'font-sans';

  if (!isMounted || status === 'loading') {
    return (
      <div className="min-h-screen bg-[#faf9f5] flex items-center justify-center px-6">
        <div
          role="status"
          aria-live="polite"
          className="font-mono text-[10px] uppercase tracking-[0.25em] text-black/50"
        >
          Loading manuscript...
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className={`min-h-screen ${currentThemeClass} flex flex-col`}>
        <div className="flex-1 flex items-center justify-center px-5 pt-24 pb-16 sm:px-6">
          <div className="max-w-md w-full text-center space-y-5">
            <div className={`font-mono text-[10px] uppercase tracking-[0.25em] ${mutedClass}`}>
              Reader error
            </div>
            <p className="text-sm font-serif leading-relaxed">{error}</p>
            <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
              <button
                type="button"
                onClick={() => void handleRetry()}
                className="inline-flex min-h-11 items-center justify-center border border-current px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em] cursor-pointer"
              >
                Retry
              </button>
              <Link
                href="/unframed"
                className="inline-flex min-h-11 items-center justify-center gap-2 border border-current/30 px-5 py-3 font-mono text-[10px] uppercase tracking-[0.18em]"
              >
                <ArrowLeft size={13} />
                Back
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (status === 'locked') {
    return <Paywall onUnlock={handleUnlock} notice={notice} />;
  }

  return (
    <div className={`min-h-screen ${currentThemeClass} transition-colors duration-300 relative`}>
      <div
        className={`sticky top-0 z-40 border-b ${borderClass} ${
          prefs.theme === 'dark'
            ? 'bg-[#121212]/95'
            : prefs.theme === 'sepia'
              ? 'bg-[#f4ecd8]/95'
              : 'bg-[#faf9f5]/95'
        } backdrop-blur-md`}
      >
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <Link
              href="/unframed"
              aria-label="Back to UNFRAMED"
              className={`flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.15em] ${mutedClass} hover:opacity-100 transition-opacity`}
            >
              <ArrowLeft size={13} />
              <span className="hidden sm:inline">Back</span>
            </Link>
            <span className={`hidden h-3 w-px sm:block ${borderClass}`} />
            <span
              className={`hidden truncate font-mono text-[10px] uppercase tracking-[0.15em] sm:inline ${mutedClass} max-w-[160px] md:max-w-md`}
            >
              Unframed / Anton Merkurov
            </span>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <span
              className={`font-mono text-[10px] hidden sm:inline ${mutedClass}`}
              aria-label={`Reading progress ${Math.round(progress)} percent`}
            >
              {Math.round(progress)}%
            </span>

            <button
              type="button"
              onClick={() => {
                setShowToc((value) => !value);
                setShowSettings(false);
              }}
              aria-label={showToc ? 'Close contents' : 'Open contents'}
              aria-expanded={showToc}
              aria-controls="reader-toc-panel"
              aria-haspopup="dialog"
              className={`flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors hover:bg-current/5 sm:px-3.5 ${borderClass}`}
            >
              <List size={13} />
              <span className="hidden md:inline">Contents</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowSettings((value) => !value);
                setShowToc(false);
              }}
              aria-label={showSettings ? 'Close settings' : 'Open settings'}
              aria-expanded={showSettings}
              aria-controls="reader-settings-panel"
              aria-haspopup="dialog"
              className={`flex min-h-11 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-[0.12em] transition-colors hover:bg-current/5 sm:px-3.5 ${borderClass}`}
            >
              <Settings size={13} />
              <span className="hidden md:inline">Settings</span>
            </button>
          </div>
        </div>

        <div className="h-[2px] w-full bg-current/10">
          <div
            role="progressbar"
            aria-label="Reading progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(progress)}
            className="h-full bg-current transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <ReaderPanel
        open={showToc}
        onClose={closeToc}
        side="left"
        labelledBy="reader-toc-title"
        className={`${borderClass} ${panelBackground}`}
      >
        <div id="reader-toc-panel">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-current/10 bg-inherit px-6 pb-5 pt-6 backdrop-blur-md">
            <span id="reader-toc-title" className="font-mono text-xs uppercase tracking-[0.2em]">
              Contents
            </span>
            <button
              type="button"
              onClick={closeToc}
              aria-label="Close contents"
              className={`${mutedClass} cursor-pointer`}
            >
              <X size={18} />
            </button>
          </div>

          <nav
            aria-label="Table of contents"
            onKeyDown={handleTocKeyDown}
            className="space-y-2 px-6 py-6"
          >
            {toc.length === 0 ? (
              <p className={`font-mono text-[10px] uppercase tracking-[0.18em] ${mutedClass}`}>
                No headings found.
              </p>
            ) : (
              toc.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  data-toc-item
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
              ))
            )}
          </nav>
        </div>
      </ReaderPanel>

      <ReaderPanel
        open={showSettings}
        onClose={closeSettings}
        side="right"
        labelledBy="reader-settings-title"
        className={`${borderClass} ${panelBackground}`}
      >
        <div id="reader-settings-panel">
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-current/10 bg-inherit px-6 pb-5 pt-6 backdrop-blur-md">
            <span
              id="reader-settings-title"
              className="font-mono text-xs uppercase tracking-[0.2em]"
            >
              Reader Settings
            </span>
            <button
              type="button"
              onClick={closeSettings}
              aria-label="Close settings"
              className={`${mutedClass} cursor-pointer`}
            >
              <X size={18} />
            </button>
          </div>

          <div className="space-y-8 px-6 py-6">
            <fieldset className="space-y-3">
              <legend className={`font-mono text-[10px] uppercase tracking-[0.15em] ${mutedClass}`}>
                Theme
              </legend>
              <div className="grid grid-cols-3 gap-2">
                {(['light', 'sepia', 'dark'] as Theme[]).map((theme) => (
                  <button
                    key={theme}
                    type="button"
                    onClick={() => updatePrefs({ theme })}
                    aria-pressed={prefs.theme === theme}
                    className={`py-2.5 font-mono text-[9px] uppercase tracking-[0.12em] border rounded-lg flex items-center justify-center gap-1 cursor-pointer ${
                      prefs.theme === theme
                        ? `border-current bg-current font-medium ${
                            prefs.theme === 'dark' ? 'text-black' : 'text-white'
                          }`
                        : borderClass
                    }`}
                  >
                    {prefs.theme === theme && <Check size={11} />}
                    {theme}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="space-y-3">
              <legend className={`font-mono text-[10px] uppercase tracking-[0.15em] ${mutedClass}`}>
                Typeface
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {(['serif', 'sans'] as FontFamily[]).map((fontFamily) => (
                  <button
                    key={fontFamily}
                    type="button"
                    onClick={() => updatePrefs({ fontFamily })}
                    aria-pressed={prefs.fontFamily === fontFamily}
                    className={`py-2.5 text-sm rounded-lg border cursor-pointer ${
                      fontFamily === 'serif' ? 'font-serif' : 'font-sans'
                    } ${
                      prefs.fontFamily === fontFamily
                        ? `border-current bg-current font-medium ${
                            prefs.theme === 'dark' ? 'text-black' : 'text-white'
                          }`
                        : borderClass
                    }`}
                  >
                    {fontFamily === 'serif' ? 'Serif' : 'Sans'}
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className={`font-mono text-[10px] uppercase tracking-[0.15em] ${mutedClass}`}>
                  Font Size
                </span>
                <span className="font-mono text-xs">{prefs.fontSize}px</span>
              </div>
              <div className="flex items-center border border-current/25 rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => updatePrefs({ fontSize: prefs.fontSize - 1 })}
                  aria-label="Decrease font size"
                  className="flex-1 py-2.5 flex items-center justify-center hover:bg-current/5 cursor-pointer"
                >
                  <Minus size={14} />
                </button>
                <div className="w-px h-6 bg-current/20" />
                <button
                  type="button"
                  onClick={() => updatePrefs({ fontSize: prefs.fontSize + 1 })}
                  aria-label="Increase font size"
                  className="flex-1 py-2.5 flex items-center justify-center hover:bg-current/5 cursor-pointer"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <label
                  htmlFor="reader-line-height"
                  className={`font-mono text-[10px] uppercase tracking-[0.15em] ${mutedClass}`}
                >
                  Line Spacing
                </label>
                <span className="font-mono text-xs">{prefs.lineHeight.toFixed(2)}</span>
              </div>
              <input
                id="reader-line-height"
                type="range"
                min="1.5"
                max="2.2"
                step="0.05"
                value={prefs.lineHeight}
                onChange={(e) => updatePrefs({ lineHeight: Number(e.target.value) })}
                className="w-full accent-current cursor-pointer"
              />
            </div>
          </div>
        </div>
      </ReaderPanel>

      <article className="mx-auto max-w-2xl px-4 pb-24 pt-24 sm:px-6 sm:pt-28">
        <header className="mb-20 text-center border-b border-current/15 pb-14">
          <div className={`font-mono text-[10px] uppercase tracking-[0.3em] ${mutedClass} mb-4`}>
            Private Memoir Edition
          </div>
          <h1 className="font-serif text-4xl sm:text-5xl md:text-6xl tracking-tight mb-4 font-normal">
            Unframed
          </h1>
          <div className={`font-mono text-xs uppercase tracking-[0.25em] ${mutedClass}`}>
            Anton Merkurov
          </div>
        </header>

        <div
          className={`${readerFont} break-words text-left sm:text-justify`}
          style={{
            fontSize: `${prefs.fontSize}px`,
            lineHeight: prefs.lineHeight,
          }}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
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

      <button
        type="button"
        onClick={() => {
          setShowToc((value) => !value);
          setShowSettings(false);
        }}
        aria-label={showToc ? 'Close contents' : 'Open contents'}
        aria-expanded={showToc}
        aria-controls="reader-toc-panel"
        aria-haspopup="dialog"
        className={`fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full border ${borderClass} ${
          prefs.theme === 'dark'
            ? 'bg-[#181818] text-white'
            : prefs.theme === 'sepia'
              ? 'bg-[#efe5ce] text-[#3c2f2f]'
              : 'bg-white text-black'
        } shadow-xl md:hidden cursor-pointer`}
      >
        {showToc ? <X size={18} /> : <Menu size={18} />}
      </button>
    </div>
  );
}
