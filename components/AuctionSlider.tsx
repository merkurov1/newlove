"use client";
import Image from "next/image";
import Link from "next/link";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from 'framer-motion';

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

  // track direction for animation (1 = next, -1 = prev)
  const [direction, setDirection] = useState(0);

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
    if (dx > threshold) {
      setDirection(-1);
      prev();
    }
    else if (dx < -threshold) {
      setDirection(1);
      next();
    }
    touchStartX.current = null;
    touchEndX.current = null;
    setTouching(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowRight') next();
    if (e.key === 'ArrowLeft') prev();
  };

  const article = articles[current];

  const variants = {
    enter: (dir: number) => ({ x: dir > 0 ? 300 : -300, opacity: 0, scale: 0.95 }),
    center: { x: 0, opacity: 1, scale: 1 },
    exit: (dir: number) => ({ x: dir < 0 ? 300 : -300, opacity: 0, scale: 0.95 }),
  };

  return (
  <div className="relative w-full min-h-[320px] overflow-visible bg-white">
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={article.slug}
          className="relative overflow-hidden bg-white"
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ x: { type: 'spring', stiffness: 300, damping: 30 }, opacity: { duration: 0.2 } }}
          drag="x"
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={(e, info) => {
            const velocity = info.velocity.x;
            const offset = info.offset.x;
            const swipe = Math.abs(offset) > 100 || Math.abs(velocity) > 500;
            if (!swipe) return;
            if (offset < 0) {
              setDirection(1);
              next();
            } else {
              setDirection(-1);
              prev();
            }
          }}
        >
          {/* Image - full width */}
          {article.previewImage ? (
            <div className="w-full relative" style={{background:'#fff'}}>
              <Image src={article.previewImage} alt={article.title} width={1600} height={900} className="w-full h-[38vw] min-h-[220px] max-h-[520px] object-contain" style={{background:'#fff'}} />
            </div>
          ) : (
            <div className="w-full h-[38vw] min-h-[220px] max-h-[520px] bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center">
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
        </motion.div>
      </AnimatePresence>

      {/* Navigation controls */}
      {articles.length > 1 && (
        <>
          <div className="hidden md:flex absolute inset-y-0 left-0 items-center px-4 z-20">
            <button onClick={() => { setDirection(-1); prev(); }} aria-label="Previous" className="w-12 h-12 rounded-full bg-pink-600 text-white hover:bg-pink-700 flex items-center justify-center shadow-lg text-2xl font-bold">‹</button>
          </div>
          <div className="hidden md:flex absolute inset-y-0 right-0 items-center pr-4 z-20">
            <button onClick={() => { setDirection(1); next(); }} aria-label="Next" className="w-12 h-12 rounded-full bg-pink-600 text-white hover:bg-pink-700 flex items-center justify-center shadow-lg text-2xl font-bold">›</button>
          </div>

          <div className="flex md:hidden w-full justify-center gap-3 py-3 bg-white/90">
            <button onClick={() => { setDirection(-1); prev(); }} aria-label="Previous" className="w-11 h-11 rounded-full bg-pink-600 text-white flex items-center justify-center text-xl font-bold">‹</button>
            <button onClick={() => { setDirection(1); next(); }} aria-label="Next" className="w-11 h-11 rounded-full bg-pink-600 text-white flex items-center justify-center text-xl font-bold">›</button>
          </div>
        </>
      )}
    </div>
  );
}
