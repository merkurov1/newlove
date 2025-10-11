"use client";
import Image from "next/image";
import Link from "next/link";
import { useState, useRef } from "react";

type Article = {
  title: string;
  slug: string;
  previewImage?: string;
  description?: string;
};

interface AuctionSliderProps {
  articles: Article[];
}

export default function AuctionSlider({ articles }: AuctionSliderProps) {
  const [current, setCurrent] = useState(0);
  if (!articles || articles.length === 0) return null;

  const touchStartX = useRef<number | null>(null);
  const touchEndX = useRef<number | null>(null);
  const [touching, setTouching] = useState(false);

  const next = () => setCurrent((c) => (c + 1) % articles.length);
  const prev = () => setCurrent((c) => (c - 1 + articles.length) % articles.length);

  // Pointer/touch events for mobile swipe — use pointer to handle both mouse and touch consistently
  const onPointerDown = (e: React.PointerEvent) => {
    setTouching(true);
    touchStartX.current = e.clientX;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!touching) return;
    touchEndX.current = e.clientX;
  };
  const onPointerUp = () => {
    if (touchStartX.current === null || touchEndX.current === null) {
      setTouching(false);
      return;
    }
    const dx = touchEndX.current - touchStartX.current;
    const threshold = 40;
    if (dx > threshold) prev();
    else if (dx < -threshold) next();
    touchStartX.current = null;
    touchEndX.current = null;
    setTouching(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
  };

  const article = articles[current];
  return (
    <div
      className="relative w-full mx-auto rounded-2xl overflow-hidden bg-white/90 border border-blue-100 shadow-lg min-h-[320px]"
      role="region"
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
    >
      {/* Image - full width, matches hero section width when used inside same container */}
      {article.previewImage ? (
        <div className="w-full relative">
          <Image src={article.previewImage} alt={article.title} width={1200} height={700} className="w-full h-56 sm:h-72 md:h-80 lg:h-96 object-cover" />
        </div>
      ) : (
        <div className="w-full h-56 sm:h-72 md:h-80 lg:h-96 bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
          <div className="text-4xl text-gray-300">📰</div>
        </div>
      )}

      {/* Content under image */}
      <div className="px-4 py-4 sm:px-6 sm:py-6">
        <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2">{article.title}</h3>
        <p className="text-gray-600 mb-3 line-clamp-3">{article.description || ''}</p>
        <div className="flex items-center gap-3">
          <Link href={`/${article.slug}`} className="inline-block px-4 py-2 border border-gray-200 text-gray-700 rounded-md text-sm hover:bg-gray-50 transition">Подробнее</Link>
          <div className="text-sm text-gray-400">{articles.length > 1 ? `${current + 1} / ${articles.length}` : null}</div>
        </div>
      </div>

      {/* Navigation controls: desktop overlay arrows, mobile small controls below image to avoid overlap */}
      {articles.length > 1 && (
        <>
          {/* Desktop overlay arrows on sides */}
          <div className="hidden md:flex absolute inset-y-0 left-0 items-center px-4 z-20">
            <button onClick={prev} aria-label="Previous" className="w-10 h-10 rounded-full bg-white/80 text-gray-700 hover:bg-white flex items-center justify-center shadow">‹</button>
          </div>
          <div className="hidden md:flex absolute inset-y-0 right-0 items-center pr-4 z-20">
            <button onClick={next} aria-label="Next" className="w-10 h-10 rounded-full bg-white/80 text-gray-700 hover:bg-white flex items-center justify-center shadow">›</button>
          </div>

          {/* Mobile controls below */}
          <div className="flex md:hidden w-full justify-center gap-3 py-3 bg-white/90">
            <button onClick={prev} aria-label="Previous" className="w-9 h-9 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center">‹</button>
            <button onClick={next} aria-label="Next" className="w-9 h-9 rounded-full bg-gray-100 text-gray-700 flex items-center justify-center">›</button>
          </div>
        </>
      )}
    </div>
  );
}
