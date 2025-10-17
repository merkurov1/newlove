"use client";
import React, { useEffect } from 'react';
import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
// Глобальные стили Swiper импортируются в layout.js

type Article = {
  id?: string | number;
  title?: string;
  slug?: string;
  previewImage?: string | null;
  preview_image?: string | null;
  description?: string | null;
  publishedAt?: string | null;
};

export default function AuctionSlider({ articles }: { articles: Article[] }) {
  useEffect(() => {
    try {
      console.debug('[AuctionSlider] mounted, articles count=', Array.isArray(articles) ? articles.length : 0);
    } catch (e) {}
  }, [articles]);

  if (!Array.isArray(articles) || articles.length === 0) return null;

  // Функция теперь корректно ищет поля previewImage или preview_image
  const mapImg = (a: Article) => a.previewImage || a.preview_image || null;
  
  const mapSlug = (a: Article) => {
    const s = (a && a.slug) || null;
    if (s && String(s).trim().length > 0) return String(s).trim();
    if (a && a.id) return String(a.id);
    return '';
  };

  return (
    <div className="auction-slider">
      <Swiper
        modules={[Navigation, Pagination, Autoplay]}
        navigation
        pagination={{ clickable: true }}
        autoplay={{ delay: 4500, pauseOnMouseEnter: true }}
        spaceBetween={12}
        slidesPerView={1}
        breakpoints={{
          640: { slidesPerView: 1 },
          768: { slidesPerView: 2 },
          1024: { slidesPerView: 3 },
        }}
        className="py-4"
      >
        {articles.map((a) => (
          <SwiperSlide key={String(a.id || a.slug || a.title || Math.random())}>
            <a href={`/${mapSlug(a)}`} className="block rounded-lg overflow-hidden shadow-sm bg-white dark:bg-neutral-900">
              {mapImg(a) ? (
                <div className="h-48 w-full bg-gray-100 dark:bg-neutral-800 relative">
                  <Image src={String(mapImg(a))} alt={a.title || ''} fill sizes="(max-width: 768px) 100vw, 33vw" className="object-cover" draggable={false} />
                </div>
              ) : (
                <div className="h-48 w-full bg-gradient-to-br from-pink-50 to-yellow-50 dark:from-neutral-800 dark:to-neutral-700 flex items-center justify-center">
                  <span className="text-sm text-neutral-500">No image</span>
                </div>
              )}
              <div className="p-3">
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{a.title}</h3>
                {a.description ? <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300 line-clamp-2">{a.description}</p> : null}
              </div>
            </a>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
