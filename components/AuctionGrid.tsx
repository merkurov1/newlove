"use client";

import React from 'react';
import Link from 'next/link';
import SafeImage from '@/components/SafeImage';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Grid, Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/grid';
import 'swiper/css/pagination';

type Article = {
  id?: string | number;
  title?: string;
  slug?: string;
  preview_image?: string | null;
  excerpt?: string | null;
};

interface AuctionGridProps {
  articles: Article[];
}

const AuctionGrid: React.FC<AuctionGridProps> = ({ articles }) => {
  if (!Array.isArray(articles) || articles.length === 0) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-neutral-900 dark:via-black dark:to-neutral-900 py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-gray-900 dark:text-white mb-2">
            🎨 Auction
          </h1>
          <p className="text-lg text-gray-600 dark:text-gray-400">
            Произведения искусства на аукционе
          </p>
        </div>

        {/* Swiper Grid */}
        <Swiper
          modules={[Grid, Pagination, Autoplay]}
          spaceBetween={20}
          grid={{
            rows: 2,
            fill: 'row',
          }}
          pagination={{
            clickable: true,
            dynamicBullets: true,
          }}
          autoplay={{
            delay: 4000,
            disableOnInteraction: true,
          }}
          breakpoints={{
            320: {
              slidesPerView: 1,
              grid: { rows: 1 },
            },
            640: {
              slidesPerView: 2,
              grid: { rows: 2 },
            },
            1024: {
              slidesPerView: 3,
              grid: { rows: 2 },
            },
          }}
          className="auction-grid-swiper"
        >
          {articles.map((article) => (
            <SwiperSlide key={article.id || article.slug}>
              <Link 
                href={`/${article.slug}`}
                className="block group"
              >
                <article className="
                  relative overflow-hidden rounded-2xl 
                  bg-white dark:bg-neutral-800 
                  shadow-lg hover:shadow-2xl 
                  dark:shadow-black/20 dark:hover:shadow-black/40
                  transition-all duration-500
                  h-[320px] sm:h-[280px]
                ">
                  {/* Image */}
                  <div className="relative h-full">
                    {article.preview_image ? (
                      <SafeImage
                        src={article.preview_image}
                        alt={article.title || ''}
                        fill
                        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                        className="object-cover transition-transform duration-700 group-hover:scale-110"
                      />
                    ) : (
                      <div className="w-full h-full bg-gradient-to-br from-gray-100 to-gray-200 dark:from-neutral-700 dark:to-neutral-600 flex items-center justify-center">
                        <span className="text-6xl opacity-40">🎨</span>
                      </div>
                    )}
                    
                    {/* Overlay Gradient */}
                    <div className="
                      absolute inset-0 
                      bg-gradient-to-t 
                      from-black/90 via-black/50 to-transparent
                      dark:from-black/95 dark:via-black/60
                      opacity-80 group-hover:opacity-100
                      transition-opacity duration-300
                    " />
                    
                    {/* Content */}
                    <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
                      <h3 className="
                        text-xl sm:text-2xl font-bold 
                        text-white 
                        line-clamp-2 
                        drop-shadow-lg
                        mb-2
                      ">
                        {article.title}
                      </h3>
                      
                      {article.excerpt && (
                        <p className="
                          text-sm text-gray-200 dark:text-gray-300
                          line-clamp-2 
                          drop-shadow-md
                          opacity-0 translate-y-2
                          group-hover:opacity-100 group-hover:translate-y-0
                          transition-all duration-300
                        ">
                          {article.excerpt}
                        </p>
                      )}
                      
                      {/* Auction Badge */}
                      <div className="
                        mt-3 inline-flex items-center gap-2
                        px-3 py-1 rounded-full
                        bg-gradient-to-r from-amber-500 to-orange-600
                        text-white text-xs font-semibold
                        shadow-lg
                      ">
                        <span>🔨</span>
                        <span>На аукционе</span>
                      </div>
                    </div>
                  </div>
                </article>
              </Link>
            </SwiperSlide>
          ))}
        </Swiper>

        {/* Pagination Styles */}
        <style jsx global>{`
          .auction-grid-swiper {
            padding-bottom: 60px;
          }
          .auction-grid-swiper .swiper-pagination {
            bottom: 20px;
          }
          .auction-grid-swiper .swiper-pagination-bullet {
            width: 10px;
            height: 10px;
            background: #9ca3af;
            opacity: 0.5;
            transition: all 0.3s;
          }
          .auction-grid-swiper .swiper-pagination-bullet-active {
            background: linear-gradient(135deg, #f59e0b, #ea580c);
            opacity: 1;
            width: 30px;
            border-radius: 5px;
          }
          .dark .auction-grid-swiper .swiper-pagination-bullet {
            background: #6b7280;
          }
        `}</style>
      </div>
    </div>
  );
};

export default AuctionGrid;
