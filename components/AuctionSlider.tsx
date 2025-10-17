"use client";
import React, { useEffect } from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
// import modules from Swiper v12 modules path
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

type Article = {
  id?: string | number;
  title?: string;
  slug?: string;
  // support both shapes produced by normalizeArticle and other sources
  previewImage?: string | null;
  preview_image_url?: string | null;
  description?: string | null;
  publishedAt?: string | null;
};

export default function AuctionSlider({ articles }: { articles: Article[] }) {
  if (!Array.isArray(articles) || articles.length === 0) return null;

  useEffect(() => {
    try {
      // Mount-time diagnostic to help debug hydration / client init issues
      // Visible in browser console only when JS runs.
      // eslint-disable-next-line no-console
      console.debug('[AuctionSlider] mounted, articles count=', Array.isArray(articles) ? articles.length : 0);
    } catch (e) {
      // ignore
    }
  }, [articles]);

  const mapImg = (a: Article) => a.previewImage || a.preview_image_url || null;
  const mapSlug = (a: Article) => {
    const s = (a && a.slug) || (a && (a as any).urlSlug) || null;
    if (s && String(s).trim().length > 0) return String(s).trim();
    // fallback to id-based path when slug missing
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
          <SwiperSlide key={String(a.id || a.slug || Math.random())}>
            <a href={`/${mapSlug(a)}`} className="block rounded-lg overflow-hidden shadow-sm bg-white dark:bg-neutral-900">
              {mapImg(a) ? (
                <div className="h-48 w-full bg-gray-100 dark:bg-neutral-800">
                  <img src={String(mapImg(a))} alt={a.title || ''} className="object-cover w-full h-48" />
                </div>
              ) : (
                <div className="h-48 w-full bg-gradient-to-br from-pink-50 to-yellow-50 dark:from-neutral-800 dark:to-neutral-700 flex items-center justify-center">
                  <span className="text-sm text-neutral-500">No image</span>
                </div>
              )}
              <div className="p-3">
                <h3 className="text-base font-semibold text-neutral-900 dark:text-neutral-100">{a.title}</h3>
                {a.description ? <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{a.description}</p> : null}
              </div>
            </a>
          </SwiperSlide>
        ))}
      </Swiper>
    </div>
  );
}
