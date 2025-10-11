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

  const next = () => setCurrent((c) => (c + 1) % articles.length);
  const prev = () => setCurrent((c) => (c - 1 + articles.length) % articles.length);

  const onPointerDown = (e: React.PointerEvent) => {
    touchStartX.current = e.clientX;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    touchEndX.current = e.clientX;
    if (touchStartX.current === null || touchEndX.current === null) return;
    const dx = touchEndX.current - touchStartX.current;
    const threshold = 40; // pixels
    if (dx > threshold) prev();
    else if (dx < -threshold) next();
    touchStartX.current = null;
    touchEndX.current = null;
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
  };

  const article = articles[current];
  return (
    <div
      className="relative w-full max-w-5xl mx-auto rounded-3xl overflow-hidden bg-white/90 border border-blue-100 shadow-lg min-h-[340px] flex flex-col justify-center"
      role="region"
      aria-roledescription="carousel"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
    >
      <div className="flex flex-col md:flex-row items-center gap-8 p-8">
        {article.previewImage && (
          <div className="w-full md:w-1/2 flex-shrink-0">
            <Image src={article.previewImage} alt={article.title} width={600} height={340} className="rounded-2xl object-cover w-full h-64 md:h-80" />
          </div>
        )}
        <div className="flex-1 flex flex-col justify-center">
          <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">{article.title}</h3>
          <p className="text-gray-600 mb-4 line-clamp-4">{article.description || ''}</p>
          <Link href={`/${article.slug}`} className="inline-block mt-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition">Подробнее</Link>
        </div>
      </div>
      {articles.length > 1 && (
        <div className="absolute inset-x-0 bottom-4 flex justify-center gap-4">
          <button onClick={prev} aria-label="Previous" className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 flex items-center justify-center font-bold text-xl">←</button>
          <button onClick={next} aria-label="Next" className="w-10 h-10 rounded-full bg-blue-100 text-blue-600 hover:bg-blue-200 flex items-center justify-center font-bold text-xl">→</button>
        </div>
      )}
    </div>
  );
}
