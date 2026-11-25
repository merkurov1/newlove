'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import FlowImageViewer, { type FlowViewerImage } from '@/components/flow/FlowImageViewer';
import { registerTelegramBackHandler } from '@/lib/telegram/backHandler';
import { hapticReader } from '@/lib/telegram/webApp';
import { computeReadingProgress } from '@/lib/flow/readingProgress';
import {
  safeLocalStorage,
  writeFlowLastRead,
  writeFlowReadingProgress,
} from '@/lib/flow/readerState';

type Props = {
  slug: string;
  title: string;
};

type ViewerState = {
  images: FlowViewerImage[];
  index: number;
} | null;

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
 * component only adds the reading line, local continuity and the image viewer.
 * That keeps the publication cheap to render and easy to share.
 */
export default function FlowReaderShell({ slug, title }: Props) {
  const [progress, setProgress] = useState(0);
  const [viewer, setViewer] = useState<ViewerState>(null);
  const barRef = useRef<HTMLSpanElement>(null);
  const lastWriteRef = useRef({ at: 0, progress: 0 });
  const progressRef = useRef(0);

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

  useEffect(() => {
    document.body.classList.add('flow-reading');
    writeFlowLastRead(safeLocalStorage(), { slug, title });

    let frame = 0;
    const schedule = () => {
      if (frame) return;

      frame = window.requestAnimationFrame(() => {
        frame = 0;
        syncProgress();
      });
    };

    const flush = () => {
      if (progressRef.current <= 0.005) return;

      writeFlowReadingProgress(safeLocalStorage(), slug, progressRef.current);
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'hidden') flush();
    };

    schedule();
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', schedule);
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

      observer?.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', schedule);
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

  return (
    <>
      <div
        className="flow-reader-progress"
        role="progressbar"
        aria-label="Reading progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        data-testid="flow-reader-progress"
      >
        <span ref={barRef} className="flow-reader-progress__bar" />
      </div>

      {viewer && (
        <FlowImageViewer
          images={viewer.images}
          index={viewer.index}
          onClose={closeViewer}
          onIndexChange={(index) => setViewer((current) => (current ? { ...current, index } : current))}
        />
      )}
    </>
  );
}
