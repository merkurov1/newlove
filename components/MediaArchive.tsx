// components/MediaArchive.tsx
'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  MEDIA_ARCHIVE, 
  CATEGORY_LABELS, 
  MediaCategory, 
  MediaItem 
} from '../data/mediaArchive';

const ITEMS_PER_CHUNK = 15;

export default function MediaArchive() {
  const [selectedCategory, setSelectedCategory] = useState<MediaCategory | 'all'>('all');
  const [directOnly, setDirectOnly] = useState(false);
  const [visibleCount, setVisibleCount] = useState(ITEMS_PER_CHUNK);
  const [activeYear, setActiveYear] = useState<number | null>(null);

  const loaderRef = useRef<HTMLDivElement | null>(null);

  // Filter dataset by category & direct links toggle (strictly no search field)
  const filteredItems = useMemo(() => {
    return MEDIA_ARCHIVE.filter((item) => {
      const matchCategory = selectedCategory === 'all' || item.category === selectedCategory;
      const matchDirect = !directOnly || item.isDirect;
      return matchCategory && matchDirect;
    });
  }, [selectedCategory, directOnly]);

  // Unique sorted years
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(filteredItems.map((i) => i.year)));
    return years.sort((a, b) => b - a);
  }, [filteredItems]);

  // Reset pagination on category change
  useEffect(() => {
    setVisibleCount(ITEMS_PER_CHUNK);
  }, [selectedCategory, directOnly]);

  // Infinite Scroll Trigger
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + ITEMS_PER_CHUNK, filteredItems.length));
        }
      },
      { threshold: 0.1 }
    );

    if (loaderRef.current) {
      observer.observe(loaderRef.current);
    }

    return () => observer.disconnect();
  }, [filteredItems.length]);

  const displayedItems = useMemo(() => {
    return filteredItems.slice(0, visibleCount);
  }, [filteredItems, visibleCount]);

  // Group items by year
  const groupedItems = useMemo(() => {
    const map = new Map<number, MediaItem[]>();
    displayedItems.forEach((item) => {
      if (!map.has(item.year)) {
        map.set(item.year, []);
      }
      map.get(item.year)!.push(item);
    });
    return map;
  }, [displayedItems]);

  // Scrollspy observer for Year Index rail
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const year = Number(entry.target.id.replace('year-group-', ''));
            if (!isNaN(year)) {
              setActiveYear(year);
            }
          }
        });
      },
      { rootMargin: '-20% 0px -60% 0px' }
    );

    availableYears.forEach((year) => {
      const el = document.getElementById(`year-group-${year}`);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [availableYears, displayedItems]);

  const scrollToYear = (year: number) => {
    setActiveYear(year);
    const element = document.getElementById(`year-group-${year}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="min-h-screen bg-[#FFFFFF] text-[#111111] font-sans antialiased selection:bg-[#111111] selection:text-[#FFFFFF]">
      {/* White Cube Gallery Header */}
      <header className="border-b border-[#E5E7EB] pt-20 pb-16 px-6 sm:px-12 lg:px-20 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div>
            <span className="text-[11px] uppercase tracking-[0.3em] text-[#6B7280] font-mono block mb-4">
              MONUMENTAL ARCHIVE & ESSAYS
            </span>
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-extralight tracking-tight text-[#111111] uppercase leading-none">
              ANTON MERKUROV
            </h1>
          </div>
          <div className="text-left md:text-right font-mono text-xs text-[#6B7280] leading-relaxed">
            <div>EXHIBITS: {MEDIA_ARCHIVE.length} RECORDS</div>
            <div>TIMELINE: 2015 — 2026</div>
            <div>FORMAT: WHITE CUBE / MONUMENT</div>
          </div>
        </div>
      </header>

      {/* Sticky Top Navigation */}
      <nav className="sticky top-0 z-40 bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#E5E7EB] px-6 sm:px-12 lg:px-20 py-4 max-w-7xl mx-auto">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase transition-all ${
                selectedCategory === 'all'
                  ? 'bg-[#111111] text-[#FFFFFF]'
                  : 'bg-[#F9FAFB] text-[#4B5563] hover:bg-[#E5E7EB] hover:text-[#111111]'
              }`}
            >
              [ ALL ]
            </button>
            {(Object.keys(CATEGORY_LABELS) as MediaCategory[]).map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3 py-1.5 text-xs font-mono tracking-wider uppercase transition-all ${
                  selectedCategory === cat
                    ? 'bg-[#111111] text-[#FFFFFF]'
                    : 'bg-[#F9FAFB] text-[#4B5563] hover:bg-[#E5E7EB] hover:text-[#111111]'
                }`}
              >
                {CATEGORY_LABELS[cat]}
              </button>
            ))}
          </div>

          <div className="flex items-center">
            <label className="flex items-center gap-2 text-xs font-mono text-[#374151] cursor-pointer whitespace-nowrap select-none">
              <input
                type="checkbox"
                checked={directOnly}
                onChange={(e) => setDirectOnly(e.target.checked)}
                className="rounded-none border-[#D1D5DB] text-[#111111] focus:ring-0 cursor-pointer"
              />
              <span className="tracking-wider">DIRECT LINKS ONLY</span>
            </label>
          </div>
        </div>
      </nav>

      {/* Main Container: Year Rail + Feed */}
      <main className="max-w-7xl mx-auto px-6 sm:px-12 lg:px-20 py-16 flex gap-16">
        {/* Year Rail (Sticky Left) */}
        <aside className="hidden md:block w-28 shrink-0">
          <div className="sticky top-28 flex flex-col gap-1.5 font-mono text-xs">
            <span className="text-[#9CA3AF] tracking-widest text-[10px] uppercase mb-3 block">
              CHRONOLOGY
            </span>
            {availableYears.map((year) => (
              <button
                key={year}
                onClick={() => scrollToYear(year)}
                className={`text-left py-1 transition-all border-l-2 pl-3 ${
                  activeYear === year
                    ? 'border-[#111111] text-[#111111] font-bold'
                    : 'border-[#F3F4F6] text-[#9CA3AF] hover:text-[#111111] hover:border-[#D1D5DB]'
                }`}
              >
                {year}
              </button>
            ))}
          </div>
        </aside>

        {/* Feed Section */}
        <section className="flex-1 space-y-20">
          {filteredItems.length === 0 ? (
            <div className="py-24 text-center border border-dashed border-[#D1D5DB]">
              <p className="font-mono text-xs uppercase text-[#6B7280]">
                NO ARCHIVAL RECORDS MATCH THE CURRENT FILTERS.
              </p>
            </div>
          ) : (
            Array.from(groupedItems.entries()).map(([year, items]) => (
              <div id={`year-group-${year}`} key={year} className="space-y-8 scroll-mt-32">
                <div className="flex items-baseline gap-4 border-b border-[#111111] pb-3">
                  <h2 className="text-3xl font-mono font-light text-[#111111]">
                    {year}
                  </h2>
                  <span className="text-xs font-mono text-[#6B7280]">
                    / {items.length} {items.length === 1 ? 'EXHIBIT' : 'EXHIBITS'}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-8">
                  {items.map((item) => (
                    <article
                      key={item.id}
                      className="group border border-[#E5E7EB] bg-[#FFFFFF] hover:border-[#111111] p-8 transition-all duration-200 relative"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-[#6B7280] uppercase tracking-wider mb-4">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#111111]">
                            {item.outlet}
                          </span>
                          <span>·</span>
                          <span>{item.type}</span>
                          <span>·</span>
                          <span>{item.language}</span>
                        </div>
                        <div>
                          {item.isDirect ? (
                            <span className="text-[#059669] border border-[#A7F3D0] bg-[#ECFDF5] px-2 py-0.5">
                              DIRECT URL
                            </span>
                          ) : (
                            <span className="text-[#6B7280] border border-[#E5E7EB] bg-[#F9FAFB] px-2 py-0.5">
                              ARCHIVAL RECORD
                            </span>
                          )}
                        </div>
                      </div>

                      <h3 className="text-xl sm:text-2xl font-light text-[#111111] leading-snug tracking-tight mb-4 group-hover:underline underline-offset-4">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-baseline justify-between gap-4"
                        >
                          <span>{item.title}</span>
                          <span className="text-base font-mono text-[#9CA3AF] group-hover:text-[#111111] transition-colors shrink-0">
                            ↗
                          </span>
                        </a>
                      </h3>

                      {item.quote && (
                        <blockquote className="mt-6 pt-4 border-t border-[#F3F4F6]">
                          <p className="text-sm sm:text-base text-[#374151] font-serif italic leading-relaxed">
                            {item.quote}
                          </p>
                        </blockquote>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            ))
          )}

          {visibleCount < filteredItems.length && (
            <div ref={loaderRef} className="py-16 text-center border-t border-[#E5E7EB]">
              <span className="font-mono text-xs uppercase text-[#9CA3AF] tracking-[0.2em] animate-pulse">
                LOADING ARCHIVAL RECORDS...
              </span>
            </div>
          )}
        </section>
      </main>

      <footer className="border-t border-[#E5E7EB] mt-32 py-16 px-6 sm:px-12 lg:px-20 max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-6 text-xs font-mono text-[#9CA3AF]">
        <div>ANTON MERKUROV — MEDIA ARCHIVE</div>
        <div>WHITE CUBE ARCHITECTURE</div>
      </footer>
    </div>
  );
}
