"use client";
import React, { FC } from 'react';
import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay, EffectFade } from 'swiper/modules';
import 'swiper/css/effect-fade';

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
    <div className="auction-slider-single w-full h-full">
      <Swiper
        modules={[Navigation, Pagination, Autoplay, EffectFade]}
        navigation
        pagination={{ clickable: true }}
        autoplay={{ delay: 5000, pauseOnMouseEnter: true }}
        slidesPerView={1}
        spaceBetween={0}
        effect="fade"
        loop={true}
        className="w-full h-full"
      >
        {articles.map((a) => (
            <SwiperSlide key={String(a.id || a.slug)} className="w-full h-full">
              <a href={`/${mapSlug(a)}`} className="block w-full h-full bg-black group">
                {/* Полноэкранное изображение */}
                <div className="w-full h-full relative">
                  {a.preview_image ? (
                    <Image
                      src={a.preview_image}
                      alt={a.title || ''}
                      fill
                      sizes="100vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      draggable={false}
                      priority={true}
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-pink-50 to-yellow-50 dark:from-neutral-800 dark:to-neutral-700 flex items-center justify-center">
                      <span className="text-lg text-neutral-500">Нет изображения</span>
                    </div>
                  )}
                  {/* Градиент и текст поверх изображения */}
                  <div className="absolute bottom-0 left-0 w-full h-2/3 bg-gradient-to-t from-black/90 via-black/60 to-transparent p-6 sm:p-12 md:p-16 flex flex-col justify-end">
                    <h3 className="text-2xl sm:text-4xl md:text-6xl font-bold text-white drop-shadow-2xl mb-4">{a.title}</h3>
                    {a.excerpt && <p className="mt-2 text-base sm:text-xl md:text-2xl text-gray-200 drop-shadow-lg line-clamp-3 max-w-4xl">{a.excerpt}</p>}
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
