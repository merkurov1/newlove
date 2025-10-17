"use client";
import React, { FC } from 'react';
import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay, EffectFade } from 'swiper/modules';
import 'swiper/css/effect-fade';

// Вспомогательные функции больше не нужны

type Article = {
  id?: string | number;
  title?: string;
  slug?: string;
  preview_image?: string | null;
  excerpt?: string | null;
};

interface AuctionSliderProps {
  articles: Article[];
}

const AuctionSlider: FC<AuctionSliderProps> = ({ articles }) => {
  if (!Array.isArray(articles) || articles.length === 0) return null;

  const mapSlug = (a: Article) => (a?.slug || a?.id || '').toString();

  return (
    <div className="auction-slider-single">
      <Swiper
        modules={[Navigation, Pagination, Autoplay, EffectFade]}
        navigation
        pagination={{ clickable: true }}
        autoplay={{ delay: 5000, pauseOnMouseEnter: true }}
        slidesPerView={1}
        spaceBetween={0}
        effect="fade"
        loop={true}
        className="py-1"
      >
        {articles.map((a) => (
            <SwiperSlide key={String(a.id || a.slug)}>
              <a href={`/${mapSlug(a)}`} className="block rounded-lg overflow-hidden shadow-lg bg-white dark:bg-neutral-900 group">
                <div className="w-full bg-gray-100 dark:bg-neutral-800 relative aspect-video sm:aspect-[2/1] lg:aspect-[2.5/1]">
                  {a.preview_image ? (
                    <Image
                      src={a.preview_image} // Просто используем поле, которое подготовил сервер
                      alt={a.title || ''}
                      fill
                      sizes="(max-width: 768px) 100vw, 80vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      draggable={false}
                      priority={true}
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-pink-50 to-yellow-50 dark:from-neutral-800 dark:to-neutral-700 flex items-center justify-center">
                      <span className="text-lg text-neutral-500">Нет изображения</span>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/70 to-transparent p-4 sm:p-6 flex flex-col justify-end">
                    <h3 className="text-xl sm:text-2xl font-bold text-white drop-shadow-md">{a.title}</h3>
                    {a.excerpt && <p className="mt-1 text-sm sm:text-base text-gray-200 drop-shadow-sm line-clamp-2">{a.excerpt}</p>}
                  </div>
                </div>
              </a>
            </SwiperSlide>
          ))}
      </Swiper>
    </div>
  );
};

export default AuctionSlider;
