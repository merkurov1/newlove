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
          Irreversible Choice
        </a>
        <a
          href="/heartandangel/letitgo"
          className="ml-4 inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xl px-6 py-3 rounded-full shadow-lg transition-colors"
        >
          Let the Heart Go
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

      <div className="mb-10 flex justify-center">
        <div className="prose max-w-2xl w-full">
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
      </div>
    </div>
  );
}
