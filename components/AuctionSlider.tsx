"use client";
import React from 'react';
import { Swiper, SwiperSlide } from 'swiper/react';
// import modules from Swiper v12 modules path
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

type Article = {
  id: string;
  title: string;
  slug: string;
  preview_image_url?: string | null;
  description?: string | null;
  published_at?: string | null;
};

export default function AuctionSlider({ articles }: { articles: Article[] }) {
  if (!Array.isArray(articles) || articles.length === 0) return null;

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
          <SwiperSlide key={a.id}>
            <a href={`/articles/${a.slug}`} className="block rounded-lg overflow-hidden shadow-sm bg-white dark:bg-neutral-900">
              {a.preview_image_url ? (
                <div className="h-48 w-full bg-gray-100 dark:bg-neutral-800">
                  <img src={a.preview_image_url} alt={a.title} className="object-cover w-full h-48" />
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
