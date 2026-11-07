'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import SectionLanguageSwitcher from '@/components/i18n/SectionLanguageSwitcher';
import { localizedPath } from '@/lib/i18n/config';
import type { KrassItem, KrassLang } from '@/lib/heritage/krass-types';
import {
  KRASS_COPY,
  attributionSummary,
  confidenceLabel,
  dimensionsLabel,
  directorLabel,
  displayArtist,
  displayTitle,
  editionLabel,
  filmYearLabel,
  imageAlt,
  isDocument,
  noteFor,
  posterYearLabel,
  priceLabel,
  publisherLabel,
  techniqueLabel,
  typeLabel,
} from '@/lib/heritage/krass-copy';
import styles from './KrassExhibition.module.css';

type Props = {
  items: KrassItem[];
  opening: KrassItem;
  lang: KrassLang;
};

const GALLERY_SIZES = '(max-width: 700px) 100vw, (max-width: 1100px) 50vw, 33vw';
const VIEWER_SIZES = '(max-width: 1100px) 100vw, 60vw';

export default function KrassExhibition({ items, opening, lang }: Props) {
  const copy = KRASS_COPY[lang];
  const labels = copy.labels;

  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [zoom, setZoom] = useState<1 | 2>(1);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const openItem = useCallback((index: number) => {
    setZoom(1);
    setOpenIndex(index);
  }, []);

  const closeViewer = useCallback(() => {
    setOpenIndex(null);
    setZoom(1);
  }, []);

  const goPrev = useCallback(() => {
    setZoom(1);
    setOpenIndex((current) => {
      if (current === null) return current;
      return (current - 1 + items.length) % items.length;
    });
  }, [items.length]);

  const goNext = useCallback(() => {
    setZoom(1);
    setOpenIndex((current) => {
      if (current === null) return current;
      return (current + 1) % items.length;
    });
  }, [items.length]);

  const toggleZoom = useCallback(() => {
    setZoom((current) => (current === 1 ? 2 : 1));
  }, []);

  const isOpen = openIndex !== null;
  const item = isOpen ? items[openIndex] : null;

  useEffect(() => {
    if (!isOpen) return;

    lastFocusedRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const timer = window.setTimeout(() => {
      closeButtonRef.current?.focus();
    }, 0);

    return () => {
      window.clearTimeout(timer);
      document.body.style.overflow = previousOverflow;
      lastFocusedRef.current?.focus?.();
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeViewer();
        return;
      }

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goPrev();
        return;
      }

      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goNext();
        return;
      }

      if (event.key !== 'Tab') return;

      const dialog = dialogRef.current;
      if (!dialog) return;

      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null);

      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [closeViewer, goNext, goPrev, isOpen]);

  const handleTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    touchStartRef.current = { x: touch.clientX, y: touch.clientY };
  };

  const handleTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || zoom !== 1) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;

    if (Math.abs(dx) < 48 || Math.abs(dx) < Math.abs(dy)) return;

    if (dx < 0) goNext();
    else goPrev();
  };

  const cardClass = (entry: KrassItem, index: number) => {
    const wide = entry.scan.aspectRatio > 1.12;
    const doc = isDocument(entry);
    const offset = index % 5 === 2 || index % 7 === 4;

    return [
      styles.card,
      wide ? styles.cardWide : '',
      doc ? styles.cardDoc : '',
      offset ? styles.cardOffset : '',
    ]
      .filter(Boolean)
      .join(' ');
  };

  const captionMeta = (entry: KrassItem) => {
    const parts = [posterYearLabel(entry, lang), typeLabel(entry, lang)];
    if (entry.filmYear && entry.filmYear !== entry.posterYear) {
      parts.push(`${labels.film} ${entry.filmYear}`);
    }
    return parts.join(' · ');
  };

  const viewerRows = (entry: KrassItem) => {
    const rows: { label: string; value: React.ReactNode }[] = [
      {
        label: labels.artist,
        value: (
          <span>
            {displayArtist(entry, lang)}
            {entry.artistConfidence !== 'verified' ? (
              <span className={styles.badge}>{confidenceLabel(entry, lang)}</span>
            ) : null}
          </span>
        ),
      },
      { label: labels.filmYear, value: filmYearLabel(entry, lang) },
      { label: labels.posterYear, value: posterYearLabel(entry, lang) },
      { label: labels.director, value: directorLabel(entry, lang) },
      { label: labels.publisher, value: publisherLabel(entry, lang) },
      { label: labels.technique, value: techniqueLabel(entry, lang) },
      { label: labels.dimensions, value: dimensionsLabel(entry, lang) ?? labels.notRecorded },
      { label: labels.edition, value: editionLabel(entry) ?? labels.notRecorded },
    ];

    const price = priceLabel(entry);
    if (price) rows.push({ label: lang === 'ru' ? 'Цена' : 'Price', value: price });

    rows.push({ label: labels.source, value: attributionSummary(entry, lang) });
    return rows;
  };

  return (
    <div className={styles.page} lang={lang}>
      <div className={styles.topBar}>
        <div className={`${styles.shell} ${styles.topBarInner}`}>
          <Link href={localizedPath('heritage', lang)} className={styles.breadcrumb}>
            {lang === 'ru' ? 'Наследие / Krass' : 'Heritage / Krass'}
          </Link>
          <SectionLanguageSwitcher
            section="krass"
            currentLang={lang}
            showDetectionHint={false}
          />
        </div>
      </div>

      <header className={styles.shell}>
        <div className={styles.hero}>
          <div className={styles.heroCopy}>
            <p className={styles.eyebrow}>{copy.hero.eyebrow}</p>
            <h1 className={styles.heroTitle}>
              <span className={styles.heroTitleLine}>{copy.hero.titleTop}</span>
              <span className={styles.heroTitleLine}>{copy.hero.titleBottom}</span>
            </h1>
            <p className={styles.heroSubtitle}>{copy.hero.subtitle}</p>
            <p className={styles.heroIntro}>{copy.hero.intro}</p>
            <div className={styles.heroActions}>
              <a href="#collection" className={styles.buttonPrimary}>
                {copy.hero.cta}
              </a>
              <Link href={localizedPath('heritage', lang)} className={styles.buttonGhost}>
                {labels.backToHeritage}
              </Link>
            </div>
          </div>

          <figure className={styles.heroFigure}>
            <div className={styles.heroImageFrame}>
              <Image
                src={opening.imageUrl}
                alt={imageAlt(opening, lang)}
                width={opening.scan.width}
                height={opening.scan.height}
                className={styles.heroImage}
                sizes="(max-width: 1100px) 100vw, 50vw"
                quality={88}
                priority
              />
            </div>
            <figcaption className={styles.heroCaption}>
              <span>{copy.hero.imageCaption}</span>
              <span>{labels.collectionCount}</span>
            </figcaption>
          </figure>
        </div>
      </header>

      <section className={styles.shell}>
        <div className={styles.section}>
          <div className={styles.sectionTop}>
            <div>
              <p className={styles.eyebrow}>{copy.curatorial.eyebrow}</p>
              <h2 className={styles.sectionTitle}>{copy.curatorial.title}</h2>
            </div>
            <div className={styles.prose}>
              {copy.curatorial.paragraphs.map((paragraph, index) => (
                <p key={paragraph.slice(0, 24)} className={index === 0 ? styles.firstLetter : undefined}>
                  {paragraph}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.shell} id="collection">
        <div className={styles.section}>
          <div className={styles.sectionTop}>
            <div>
              <p className={styles.eyebrow}>{copy.gallery.eyebrow}</p>
              <h2 className={styles.sectionTitle}>{copy.gallery.title}</h2>
            </div>
            <div>
              <p className={styles.sectionIntro}>{copy.gallery.intro}</p>
            </div>
          </div>

          <ul className={styles.gallery}>
            {items.map((entry, index) => (
              <li key={entry.id} id={`work-${entry.id}`} className={cardClass(entry, index)}>
                <button
                  type="button"
                  className={styles.cardButton}
                  onClick={() => openItem(index)}
                  aria-label={`${labels.view}: ${displayTitle(entry, lang)}`}
                  aria-haspopup="dialog"
                >
                  <span
                    className={styles.imageFrame}
                    style={{ '--ratio': entry.scan.aspectRatio } as CSSProperties}
                  >
                    <Image
                      src={entry.imageUrl}
                      alt={imageAlt(entry, lang)}
                      width={entry.scan.width}
                      height={entry.scan.height}
                      className={styles.image}
                      sizes={GALLERY_SIZES}
                      quality={84}
                    />
                    <span className={styles.imageOverlay}>{labels.view}</span>
                  </span>
                  <span className={styles.caption}>
                    <span
                      className={styles.captionTitle}
                      role="heading"
                      aria-level={3}
                    >
                      {displayTitle(entry, lang)}
                    </span>
                    <span className={styles.captionMeta}>{captionMeta(entry)}</span>
                    <span className={styles.captionArtist}>{displayArtist(entry, lang)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>

          <div className={styles.galleryNote}>
            <p>{copy.gallery.note}</p>
            <p>{labels.collectionCount}</p>
          </div>
        </div>
      </section>

      <section className={styles.shell}>
        <div className={styles.section}>
          <div className={styles.sectionTop}>
            <div>
              <p className={styles.eyebrow}>{copy.context.eyebrow}</p>
              <h2 className={styles.sectionTitle}>{copy.context.title}</h2>
            </div>
            <div>
              <p className={styles.sectionIntro}>{copy.context.intro}</p>
            </div>
          </div>

          <div className={styles.contextGrid}>
            <article className={styles.contextBlock}>
              <h3 className={styles.contextTitle}>{copy.context.krasnopevtsev.title}</h3>
              {copy.context.krasnopevtsev.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
            </article>

            <article className={styles.contextBlock}>
              <h3 className={styles.contextTitle}>{copy.context.fedorov.title}</h3>
              {copy.context.fedorov.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
            </article>

            <article className={styles.contextBlock}>
              <h3 className={styles.contextTitle}>{copy.context.reklamafilm.title}</h3>
              {copy.context.reklamafilm.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
            </article>
          </div>

          <div className={styles.timeline}>
            {copy.context.timeline.map((entry) => (
              <div key={entry.year} className={styles.timelineItem}>
                <p className={styles.timelineYear}>{entry.year}</p>
                <p className={styles.timelineText}>{entry.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.shell}>
        <div className={styles.section}>
          <div className={styles.sectionTop}>
            <div>
              <p className={styles.eyebrow}>{copy.collection.eyebrow}</p>
              <h2 className={styles.sectionTitle}>{copy.collection.title}</h2>
            </div>
            <div className={styles.prose}>
              {copy.collection.paragraphs.map((paragraph) => (
                <p key={paragraph.slice(0, 24)}>{paragraph}</p>
              ))}
            </div>
          </div>

          <div className={styles.collectionBlock}>
            <p className={styles.collectionLead}>
              {lang === 'ru' ? (
                <>
                  Собрание <strong>Алексея Фёдорова-младшего</strong> (1970–2024)
                </>
              ) : (
                <>
                  The collection of <strong>Alexei Fedorov Jr.</strong> (1970–2024)
                </>
              )}
            </p>
            <div className={styles.prose}>
              <p>
                {lang === 'ru'
                  ? 'Цифровые копии были переданы Антону Меркурову. Оригиналы не изменялись; изображения в экспозиции даны в исходных пропорциях, без обрезки и фильтров.'
                  : 'Digital copies were transferred to Anton Merkurov. The originals were not altered; the images in this exhibition are shown in their original proportions, without cropping or filters.'}
              </p>
              <p>
                {lang === 'ru'
                  ? 'Это не полный каталог «Рекламфильма» и не собрание Алексея Алексеевича Фёдорова (1937–1994). Границы собрания важны так же, как его содержание.'
                  : 'This is not a complete Reklamfilm catalogue, nor the collection of Alexei Alekseevich Fedorov (1937–1994). The boundaries of the collection matter as much as its contents.'}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.shell}>
        <div className={styles.section}>
          <div className={styles.sectionTop}>
            <div>
              <p className={styles.eyebrow}>{copy.sources.eyebrow}</p>
              <h2 className={styles.sectionTitle}>{copy.sources.title}</h2>
            </div>
            <div>
              <p className={styles.sectionIntro}>{copy.sources.intro}</p>
            </div>
          </div>

          <div className={styles.sourcesGrid}>
            {copy.sources.links.map((source) => (
              <a
                key={source.href}
                className={styles.sourceLink}
                href={source.href}
                target="_blank"
                rel="noreferrer"
              >
                <span className={styles.sourceLabel}>{source.label}</span>
                <span className={styles.sourceNote}>{source.note}</span>
              </a>
            ))}
          </div>

          <p className={styles.galleryNote}>{labels.sourcesNote}</p>
        </div>
      </section>

      <div className={styles.shell}>
        <div className={styles.footerNote}>
          <p>{copy.footer.note}</p>
          <p>{copy.footer.credit}</p>
        </div>
      </div>

      {isOpen && item ? (
        <div
          className={styles.viewerBackdrop}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeViewer();
          }}
        >
          <div
            ref={dialogRef}
            className={styles.viewer}
            role="dialog"
            aria-modal="true"
            aria-labelledby="krass-viewer-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <button
              ref={closeButtonRef}
              type="button"
              className={styles.viewerClose}
              onClick={closeViewer}
              aria-label={labels.close}
            >
              ×
            </button>

            <div
              className={styles.viewerImagePane}
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
              onTouchCancel={() => {
                touchStartRef.current = null;
              }}
            >
              <div className={styles.viewerImageScroll}>
                <button
                  type="button"
                  className={`${styles.viewerImageButton} ${
                    zoom === 2 ? styles.viewerImageButtonZoomed : ''
                  }`}
                  onClick={toggleZoom}
                  aria-label={zoom === 1 ? labels.zoomIn : labels.zoomOut}
                >
                  <Image
                    src={item.imageUrl}
                    alt={imageAlt(item, lang)}
                    width={item.scan.width}
                    height={item.scan.height}
                    className={`${styles.viewerImage} ${
                      zoom === 2 ? styles.viewerImageZoomed : ''
                    }`}
                    style={zoom === 2 ? { width: '200%' } : undefined}
                    sizes={VIEWER_SIZES}
                    quality={92}
                  />
                </button>
              </div>
            </div>

            <div className={styles.viewerMeta}>
              <p className={styles.viewerType}>
                {typeLabel(item, lang)} · {confidenceLabel(item, lang)}
              </p>
              <h2 id="krass-viewer-title" className={styles.viewerTitle}>
                {displayTitle(item, lang)}
              </h2>
              <p className={styles.viewerSubtitle}>
                {labels.filmYear}: {filmYearLabel(item, lang)} · {labels.posterYear}:{' '}
                {posterYearLabel(item, lang)}
              </p>

              <dl className={styles.viewerDl}>
                {viewerRows(item).map((row) => (
                  <React.Fragment key={row.label}>
                    <dt>{row.label}</dt>
                    <dd>{row.value}</dd>
                  </React.Fragment>
                ))}
              </dl>

              <p className={styles.viewerNote}>{noteFor(item, lang)}</p>
              <p className={styles.viewerSource}>
                {labels.source}: {attributionSummary(item, lang)}
              </p>

              <div className={styles.viewerActions}>
                <button type="button" className={styles.viewerButton} onClick={toggleZoom}>
                  {zoom === 1 ? labels.zoomIn : labels.zoomOut}
                </button>
                {zoom === 2 ? (
                  <button
                    type="button"
                    className={styles.viewerButton}
                    onClick={() => setZoom(1)}
                  >
                    {labels.zoomReset}
                  </button>
                ) : null}
              </div>

              <div className={styles.viewerNav}>
                <button type="button" className={styles.viewerButton} onClick={goPrev}>
                  ← {labels.prev}
                </button>
                <button type="button" className={styles.viewerButton} onClick={goNext}>
                  {labels.next} →
                </button>
              </div>

              <p className={styles.viewerHint}>
                {labels.swipeHint} · {(openIndex ?? 0) + 1} / {items.length}
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
