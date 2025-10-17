"use client";
import React, from 'react';
import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay, EffectFade } from 'swiper/modules';
import 'swiper/css/effect-fade';

// Helper function to reliably fix any double slashes in the URL
const normalizeImageUrl = (url: string | null | undefined): string | null => {
  if (!url) return null;
  // This command replaces http://...//... with http://.../... anywhere in the string
  return url.replace(/([^:]\/)\/+/g, "$1");
};

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

const AuctionSlider: React.FC<AuctionSliderProps> = ({ articles }) => {
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
        {articles.map((a) => {
          const imageUrl = normalizeImageUrl(a.preview_image);

          return (
            <SwiperSlide key={String(a.id || a.slug)}>
              {/* --- VISUAL DEBUG BLOCK --- */}
              <div style={{
                position: 'absolute', top: 0, left: 0, zIndex: 100,
                background: 'rgba(255, 0, 0, 0.8)', color: 'white',
                padding: '5px', fontSize: '10px', width: '100%',
                wordBreak: 'break-all'
              }}>
                <p><strong>Raw URL:</strong> {a.preview_image || 'EMPTY'}</p>
                <p><strong>Fixed URL:</strong> {imageUrl || 'EMPTY'}</p>
              </div>
              {/* --- END DEBUG BLOCK --- */}

              <a href={`/${mapSlug(a)}`} className="block rounded-lg overflow-hidden shadow-lg bg-white dark:bg-neutral-900 group">
                <div className="w-full bg-gray-100 dark:bg-neutral-800 relative aspect-video sm:aspect-[2/1] lg:aspect-[2.5/1]">
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={a.title || ''}
                      fill
                      sizes="(max-width: 768px) 100vw, 80vw"
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      draggable={false}
                      priority={true}
                    />
                  ) : (
                    <div className="h-full w-full bg-gradient-to-br from-pink-50 to-yellow-50 dark:from-neutral-800 dark:to-neutral-700 flex items-center justify-center">
                      <span className="text-lg text-neutral-500">No Image</span>
                    </div>
                  )}
                  <div className="absolute bottom-0 left-0 w-full h-1/2 bg-gradient-to-t from-black/70 to-transparent p-4 sm:p-6 flex flex-col justify-end">
                    <h3 className="text-xl sm:text-2xl font-bold text-white drop-shadow-md">{a.title}</h3>
                    {a.excerpt && <p className="mt-1 text-sm sm:text-base text-gray-200 drop-shadow-sm line-clamp-2">{a.excerpt}</p>}
                  </div>
                </div>
              </a>
            </SwiperSlide>
          );
        })}
      </Swiper>
    </div>
  );
};

export default AuctionSlider;
