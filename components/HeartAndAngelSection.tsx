'use client';

import React from 'react';
import Image from 'next/image';
import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Autoplay } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/navigation';
import 'swiper/css/pagination';

interface Props {
  images: string[];
  ctaHref?: string;
}

export default function HeartAndAngelSection({ images, ctaHref = '/heartandangel/NFT' }: Props) {
  return (
    <div>
      <div className="mb-8 text-center">
        <a
          href={ctaHref}
          className="inline-block bg-pink-600 hover:bg-pink-700 text-white font-semibold text-xl px-6 py-3 rounded-full shadow-lg transition-colors"
        >
          Необратимый выбор
        </a>
        <a
          href="/heartandangel/letitgo"
          className="ml-4 inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xl px-6 py-3 rounded-full shadow-lg transition-colors"
        >
          Отпусти Сердце
        </a>
      </div>

      <div className="mb-8">
        <Swiper
          modules={[Navigation, Pagination, Autoplay]}
          slidesPerView={1}
          navigation
          pagination={{ clickable: true }}
          autoplay={{ delay: 4500, disableOnInteraction: false }}
          loop
          className="rounded-lg overflow-hidden shadow-lg"
        >
          {images.map((src, i) => (
            <SwiperSlide key={i}>
              <div className="relative w-full h-[48vh] sm:h-[56vh] md:h-[44vh] lg:h-[36rem] flex items-center justify-center bg-white">
                <Image
                  src={src}
                  alt={`Heart and Angel ${i}`}
                  fill
                  className="object-contain object-center"
                />
              </div>
            </SwiperSlide>
          ))}
        </Swiper>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-10">
        <div className="prose max-w-none">
          <h2>Heart & Angel</h2>
          <p>
            Heart & Angel is a transmedia art practice exploring archetypal imagery through the lens
            of post-gender identity. The project deconstructs traditional representations of the
            dualism of good and evil, proposing an alternative model for the interaction of symbolic
            figures.
          </p>

          <h3>Conceptual Framework</h3>
          <p>
            The core of the work lies in a critical re-interpretation of the classical Angel and
            Demon archetypes, liberated from gender markers and binary oppositions. The third
            element—the Heart in multiple representations—functions as a mediator, creating a space
            for dialogue between the poles.
          </p>
          <p>
            The non-binary nature of the characters is not a decorative solution, but a conceptual
            gesture aimed at universalizing the human experience. The project investigates how
            archetypal images can function outside the patriarchal symbolic system, offering an
            inclusive mythology for the contemporary context.
          </p>

          <h3>Artistic Media</h3>
          <ul>
            <li>Traditional Painting: Works in ink, watercolor, and acrylic</li>
            <li>
              Digital Technologies: Augmented reality (AR), creating an interactive experience
            </li>
            <li>Editioned Prints: Prints for wide distribution</li>
            <li>Video Content: YouTube videos to reach the digital audience</li>
            <li>Other Multimedia Formats</li>
          </ul>
        </div>

        <div className="prose max-w-none">
          <h2>Heart &amp; Angel</h2>
          <p>
            Heart &amp; Angel — трансмедийная художественная практика, исследующая архетипические
            образы через призму постгендерной идентичности. Проект деконструирует традиционные
            представления о дуализме добра и зла, предлагая альтернативную модель взаимодействия
            символических фигур.
          </p>

          <h3>Концептуальная рамка</h3>
          <p>
            В основе работы лежит критическое переосмысление классических архетипов Ангела и Демона,
            освобождённых от гендерных маркеров и бинарных оппозиций. Третий элемент — Сердце в
            множественных репрезентациях — функционирует как медиатор, создающий пространство для
            диалога между полюсами.
          </p>
          <p>
            Небинарность персонажей не является декоративным решением, а представляет собой
            концептуальный жест, направленный на универсализацию человеческого опыта. Проект
            исследует, как архетипические образы могут функционировать вне патриархальной
            символической системы, предлагая инклюзивную мифологию для современного контекста.
          </p>

          <h3>Художественные медиа</h3>
          <ul>
            <li>Традиционная живопись: работы тушью, акварелью и акрилом</li>
            <li>Цифровые технологии: дополненная реальность, создающая интерактивный опыт</li>
            <li>Тиражная графика: принты для широкого распространения</li>
            <li>Видеоконтент: ролики на YouTube для охвата цифровой аудитории</li>
            <li>Другие мультимедийные форматы</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
