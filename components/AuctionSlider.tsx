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
    <section
      className="relative w-full max-w-3xl mx-auto overflow-hidden bg-white box-border px-2 md:px-6 py-0"
      aria-label="Аукционные статьи"
      tabIndex={0}
      onKeyDown={onKeyDown}
    >
  <div className="relative w-full flex flex-col xl:flex-row items-center justify-center gap-0 xl:gap-8 min-h-[220px] max-h-[676px] overflow-x-hidden">
  <div className="relative flex-shrink-0 flex-grow-0 flex items-center justify-center aspect-[16/9] w-full h-auto mx-auto xl:min-w-[400px] xl:max-w-[800px]">
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={article.slug}
          className="absolute inset-0 flex flex-col w-full h-full"
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
          style={{ zIndex: 2 }}
        >
          {article.previewImage ? (
            <Link href={`/${article.slug}`} className="block w-full h-full" tabIndex={-1}>
              <Image
                src={article.previewImage}
                alt={article.title}
                fill
                sizes="(min-width:1280px) 33vw, 100vw"
                className="object-contain w-full h-full transition-transform duration-200 group-hover:scale-105 bg-white"
                priority
                draggable={false}
              />
            </Link>
          ) : (
            <Link href={`/${article.slug}`} className="w-full h-full bg-gradient-to-br from-blue-100 to-purple-100 flex items-center justify-center" tabIndex={-1}>
              <div className="text-4xl text-gray-300">📰</div>
            </Link>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
        {/* Controls (absolute, overlay) */}
        {articles.length > 1 && (
          <>
            <button
              onClick={() => { setDirection(-1); prev(); }}
              aria-label="Предыдущий"
              className="hidden md:flex absolute left-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-pink-600 text-white hover:bg-pink-700 items-center justify-center shadow-lg text-2xl font-bold z-30"
              tabIndex={0}
            >‹</button>
            <button
              onClick={() => { setDirection(1); next(); }}
              aria-label="Следующий"
              className="hidden md:flex absolute right-2 top-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-pink-600 text-white hover:bg-pink-700 items-center justify-center shadow-lg text-2xl font-bold z-30"
              tabIndex={0}
            >›</button>
            <div className="flex md:hidden w-full justify-between items-center absolute bottom-2 left-0 px-2 z-30">
              <button onClick={() => { setDirection(-1); prev(); }} aria-label="Предыдущий" className="w-11 h-11 rounded-full bg-pink-600 text-white flex items-center justify-center text-xl font-bold">‹</button>
              <button onClick={() => { setDirection(1); next(); }} aria-label="Следующий" className="w-11 h-11 rounded-full bg-pink-600 text-white flex items-center justify-center text-xl font-bold">›</button>
            </div>
          </>
        )}
      </div>
      {/* Content under image, always fixed height for no shift */}
      <div className="w-full px-4 py-4 sm:px-6 sm:py-6 flex flex-col items-center text-center min-h-[140px] max-h-[220px]">
        <Link href={`/${article.slug}`} className="block w-full">
          <h3 className="text-xl sm:text-2xl font-semibold text-gray-900 mb-2 w-full hover:text-pink-500 transition-colors cursor-pointer line-clamp-2">{article.title}</h3>
        </Link>
        <p className="text-gray-600 mb-3 line-clamp-3 w-full min-h-[2.5em]">{article.description || ''}</p>
      </div>
    </section>
  );
}
