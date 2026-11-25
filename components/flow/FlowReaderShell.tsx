'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Focus, List, SlidersHorizontal, X } from 'lucide-react';

import FlowImageViewer, { type FlowViewerImage } from '@/components/flow/FlowImageViewer';
import FlowReaderDialog from '@/components/flow/FlowReaderDialog';
import FlowReaderSettings from '@/components/flow/FlowReaderSettings';
import FlowReaderToc from '@/components/flow/FlowReaderToc';
import { registerTelegramBackHandler } from '@/lib/telegram/backHandler';
import { hapticReader } from '@/lib/telegram/webApp';
import {
  computeReadingProgress,
  computeScrollTopForProgress,
  formatReadingProgress,
  shouldRestoreReadingProgress,
} from '@/lib/flow/readingProgress';
import {
  DEFAULT_FLOW_READER_PREFS,
  readFlowReaderPrefs,
  readFlowReaderState,
  safeLocalStorage,
  sanitizeFlowReaderPrefs,
  writeFlowLastRead,
  writeFlowReaderPrefs,
  writeFlowReadingProgress,
  type FlowReaderPrefs,
} from '@/lib/flow/readerState';
import type { TocItem } from '@/lib/reader/headings';

type Props = {
  slug: string;
  title: string;
  headings?: TocItem[];
};

type ViewerState = {
  images: FlowViewerImage[];
  index: number;
} | null;

type PanelState = 'toc' | 'settings' | null;

function collectImages(): FlowViewerImage[] {
  const nodes = Array.from(
    document.querySelectorAll<HTMLAnchorElement>('.flow-item a[data-flow-image]')
  );

  const images: FlowViewerImage[] = [];

  for (const node of nodes) {
    const src = node.dataset.flowImageSrc?.trim() ?? '';

    if (!src) continue;

    images.push({
      src,
      alt: node.dataset.flowImageAlt?.trim() ?? '',
      caption: node.dataset.flowImageCaption?.trim() ?? '',
    });
  }

  return images;
}

/**
 * Client half of the server-rendered Flow reader.
 *
 * The article, its typography and its metadata stay server rendered; this
 * component only adds the reading line, local continuity, the appearance and
 * contents controls, and the image viewer. That keeps the publication cheap to
 * render and easy to share while giving the website the same focused reading
 * surface as the Telegram Mini App.
 */
export default function FlowReaderShell({ slug, title, headings = [] }: Props) {
  const [progress, setProgress] = useState(0);
  const [viewer, setViewer] = useState<ViewerState>(null);
  const [panel, setPanel] = useState<PanelState>(null);
  const [prefs, setPrefs] = useState<FlowReaderPrefs>(DEFAULT_FLOW_READER_PREFS);
  const barRef = useRef<HTMLSpanElement>(null);
  const lastWriteRef = useRef({ at: 0, progress: 0 });
  const progressRef = useRef(0);
  const resumeRef = useRef<{ progress: number; until: number } | null>(null);

  const syncProgress = useCallback(() => {
    const article = document.querySelector<HTMLElement>('.flow-item');

    if (!article) return;

    const rect = article.getBoundingClientRect();
    const value = computeReadingProgress({
      scrollTop: window.scrollY,
      viewportHeight: window.innerHeight,
      contentTop: rect.top + window.scrollY,
      contentHeight: rect.height,
    });

    progressRef.current = value;

    if (barRef.current) {
      barRef.current.style.transform = `scaleX(${value})`;
    }

    setProgress((previous) => (Math.abs(previous - value) >= 0.01 ? value : previous));

    const now = Date.now();
    const previousWrite = lastWriteRef.current;

    // Do not overwrite a stored position with 0 before the reader has actually
    // moved; `writeFlowLastRead` preserves the previous progress on reopen.
    if (value <= 0.005) return;

    if (now - previousWrite.at >= 1_200 || Math.abs(value - previousWrite.progress) >= 0.1) {
      lastWriteRef.current = { at: now, progress: value };
      writeFlowReadingProgress(safeLocalStorage(), slug, value, now);
    }
  }, [slug]);

  // Load appearance preferences after hydration so the server markup stays
  // deterministic even when storage is blocked.
  useEffect(() => {
    setPrefs(readFlowReaderPrefs(safeLocalStorage()));
  }, []);

  // Apply appearance to the existing reader surface only. Root data attributes
  // keep the rest of the website untouched and the progress markup unchanged.
  useEffect(() => {
    const root = document.documentElement;
    const previousTheme = root.dataset.flowReaderTheme;
    const previousScale = root.style.getPropertyValue('--flow-reader-font-scale');
    const previousLineHeight = root.style.getPropertyValue('--flow-reader-line-height');
    const previousFocus = document.body.classList.contains('flow-reader-focus');

    root.dataset.flowReaderTheme = prefs.theme;
    root.style.setProperty('--flow-reader-font-scale', prefs.fontScale.toFixed(2));
    root.style.setProperty('--flow-reader-line-height', prefs.lineHeight.toFixed(2));
    document.body.classList.toggle('flow-reader-focus', prefs.focusMode);

    return () => {
      if (previousTheme === undefined) {
        delete root.dataset.flowReaderTheme;
      } else {
        root.dataset.flowReaderTheme = previousTheme;
      }

      if (previousScale) {
        root.style.setProperty('--flow-reader-font-scale', previousScale);
      } else {
        root.style.removeProperty('--flow-reader-font-scale');
      }

      if (previousLineHeight) {
        root.style.setProperty('--flow-reader-line-height', previousLineHeight);
      } else {
        root.style.removeProperty('--flow-reader-line-height');
      }

      document.body.classList.toggle('flow-reader-focus', previousFocus);
    };
  }, [prefs.fontScale, prefs.lineHeight, prefs.theme, prefs.focusMode]);

  useEffect(() => {
    document.body.classList.add('flow-reading');
    writeFlowLastRead(safeLocalStorage(), { slug, title });

    const stored = readFlowReaderState(safeLocalStorage()).lastRead;
    const resumableProgress = stored?.slug === slug ? stored.progress : 0;
    const shouldResume = shouldRestoreReadingProgress(resumableProgress) && !window.location.hash;

    resumeRef.current = shouldResume
      ? { progress: resumableProgress, until: Date.now() + 1_600 }
      : null;

    let frame = 0;
    let restoreFrame = 0;
    let secondRestoreFrame = 0;
    const restoreTimers: number[] = [];

    const schedule = () => {
      if (frame) return;

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        syncProgress();
      });
    };

    const syncResumeTarget = () => {
      const resume = resumeRef.current;

      if (!resume || Date.now() > resume.until) return;

      const article = document.querySelector<HTMLElement>('.flow-item');

      if (!article) return;

      const rect = article.getBoundingClientRect();
      const top = computeScrollTopForProgress({
        progress: resume.progress,
        viewportHeight: window.innerHeight,
        contentTop: rect.top + window.scrollY,
        contentHeight: rect.height,
      });

      if (top > 0 && Math.abs(window.scrollY - top) > 2) {
        window.scrollTo({ top, behavior: 'auto' });
      }
    };

    const scheduleResume = () => {
      if (!resumeRef.current || restoreFrame) return;

      restoreFrame = window.requestAnimationFrame(() => {
        restoreFrame = 0;
        syncResumeTarget();
      });
    };

    const stopResume = () => {
      resumeRef.current = null;
    };

    const flush = () => {
      if (progressRef.current <= 0.005) return;

      writeFlowReadingProgress(safeLocalStorage(), slug, progressRef.current);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    const handleResize = () => {
      schedule();
      scheduleResume();
    };

    schedule();

    if (resumeRef.current) {
      // Two frames let fonts and image boxes settle. The timed retries cover
      // late media and a Telegram viewport resize without ever fighting an
      // intentional reader gesture.
      secondRestoreFrame = window.requestAnimationFrame(() => {
        secondRestoreFrame = window.requestAnimationFrame(syncResumeTarget);
      });
      restoreTimers.push(
        window.setTimeout(syncResumeTarget, 180),
        window.setTimeout(syncResumeTarget, 520),
        window.setTimeout(syncResumeTarget, 1_100)
      );
    }

    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', handleResize);
    window.addEventListener('orientationchange', handleResize);
    window.addEventListener('wheel', stopResume, { passive: true });
    window.addEventListener('touchstart', stopResume, { passive: true });
    window.addEventListener('pointerdown', stopResume);
    window.addEventListener('keydown', stopResume);
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('pagehide', flush);

    const article = document.querySelector<HTMLElement>('.flow-item');
    let observer: ResizeObserver | null = null;

    if (article && typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(schedule);
      observer.observe(article);
    }

    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      if (restoreFrame) window.cancelAnimationFrame(restoreFrame);
      if (secondRestoreFrame) window.cancelAnimationFrame(secondRestoreFrame);

      for (const timer of restoreTimers) window.clearTimeout(timer);

      observer?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('orientationchange', handleResize);
      window.removeEventListener('wheel', stopResume);
      window.removeEventListener('touchstart', stopResume);
      window.removeEventListener('pointerdown', stopResume);
      window.removeEventListener('keydown', stopResume);
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('pagehide', flush);
      document.body.classList.remove('flow-reading');
      flush();
    };
  }, [slug, syncProgress, title]);

  // Event delegation lets the server-rendered figures open the client viewer
  // without turning the whole article into a client component.
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

      const target = event.target;

      if (!(target instanceof Element)) return;

      const anchor = target.closest<HTMLAnchorElement>('a[data-flow-image]');

      if (!anchor || !anchor.closest('.flow-item')) return;

      const anchors = Array.from(
        document.querySelectorAll<HTMLAnchorElement>('.flow-item a[data-flow-image]')
      );
      const images = collectImages();
      const index = anchors.indexOf(anchor);

      if (images.length === 0 || index < 0) return;

      event.preventDefault();
      hapticReader('open');
      setViewer({ images, index });
    };

    document.addEventListener('click', handleClick);

    return () => document.removeEventListener('click', handleClick);
  }, []);

  // Telegram's native BackButton closes the viewer before it touches routing.
  useEffect(() => {
    if (!viewer) return;

    const handler = () => {
      setViewer(null);
      return true;
    };

    return registerTelegramBackHandler(handler);
  }, [viewer]);

  const closeViewer = useCallback(() => {
    hapticReader('close');
    setViewer(null);
  }, []);

  const updatePrefs = useCallback((patch: Partial<Omit<FlowReaderPrefs, 'version'>>) => {
    setPrefs((current) => {
      const next = sanitizeFlowReaderPrefs({ ...current, ...patch });
      writeFlowReaderPrefs(safeLocalStorage(), next);
      return next;
    });
  }, []);

  const togglePanel = useCallback((next: Exclude<PanelState, null>) => {
    setPanel((current) => (current === next ? null : next));
  }, []);

  const closePanel = useCallback(() => setPanel(null), []);

  const selectHeading = useCallback((id: string) => {
    setPanel(null);

    const heading = document.getElementById(id);

    if (!heading) return;

    heading.setAttribute('tabindex', '-1');

    const reduceMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    try {
      heading.scrollIntoView?.({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
      window.history.replaceState(null, '', `#${id}`);
    } catch {
      /* Scrolling and history are best-effort enhancements. */
    }

    // Runs after the dialog cleanup restores focus to the Contents trigger.
    window.requestAnimationFrame(() => heading.focus({ preventScroll: true }));
  }, []);

  const hasHeadings = headings.length > 0;

  return (
    <>
      <div
        className="flow-reader-progress"
        role="progressbar"
        aria-label="Reading progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        aria-valuetext={formatReadingProgress(progress)}
        data-testid="flow-reader-progress"
      >
        <span ref={barRef} className="flow-reader-progress__bar" />
      </div>

      <div className="flow-reader__controls" role="group" aria-label="Reader controls">
        <span className="flow-reader__percent" aria-hidden="true">
          {Math.round(progress * 100)}%
        </span>

        {hasHeadings && (
          <button
            type="button"
            className="flow-reader__control"
            onClick={() => togglePanel('toc')}
            aria-label="Contents"
            aria-expanded={panel === 'toc'}
            aria-controls="flow-reader-toc-panel"
            aria-haspopup="dialog"
          >
            <List size={15} aria-hidden="true" />
            <span>Contents</span>
          </button>
        )}

        <button
          type="button"
          className="flow-reader__control"
          onClick={() => togglePanel('settings')}
          aria-label="Appearance settings"
          aria-expanded={panel === 'settings'}
          aria-controls="flow-reader-settings-panel"
          aria-haspopup="dialog"
        >
          <SlidersHorizontal size={15} aria-hidden="true" />
          <span>Appearance</span>
        </button>

        <button
          type="button"
          className="flow-reader__control"
          onClick={() => updatePrefs({ focusMode: !prefs.focusMode })}
          aria-label="Focus mode"
          aria-pressed={prefs.focusMode}
        >
          <Focus size={15} aria-hidden="true" />
          <span>Focus</span>
        </button>
      </div>

      {panel === 'toc' && (
        <FlowReaderDialog
          onClose={closePanel}
          side="left"
          labelledBy="flow-reader-toc-title"
          testId="flow-reader-toc-panel"
        >
          <div id="flow-reader-toc-panel">
            <div className="flow-reader-dialog__head">
              <h2 id="flow-reader-toc-title" className="flow-reader-dialog__title">
                Contents
              </h2>

              <button
                type="button"
                className="flow-reader-dialog__close"
                onClick={closePanel}
                aria-label="Close contents"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <FlowReaderToc headings={headings} onSelect={selectHeading} />
          </div>
        </FlowReaderDialog>
      )}

      {panel === 'settings' && (
        <FlowReaderDialog
          onClose={closePanel}
          side="right"
          labelledBy="flow-reader-settings-title"
          testId="flow-reader-settings-panel"
        >
          <div id="flow-reader-settings-panel">
            <div className="flow-reader-dialog__head">
              <h2 id="flow-reader-settings-title" className="flow-reader-dialog__title">
                Appearance
              </h2>

              <button
                type="button"
                className="flow-reader-dialog__close"
                onClick={closePanel}
                aria-label="Close appearance settings"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <FlowReaderSettings prefs={prefs} onChange={updatePrefs} />
          </div>
        </FlowReaderDialog>
      )}

      {viewer && (
        <FlowImageViewer
          images={viewer.images}
          index={viewer.index}
          onClose={closeViewer}
          onIndexChange={(index) =>
            setViewer((current) => (current ? { ...current, index } : current))
          }
        />
      )}
    </>
  );
}
