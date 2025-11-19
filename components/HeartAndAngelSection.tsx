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
    <section className="w-full flex flex-col items-center">
      <div className="text-center mb-6 px-3">
        <div className="text-base sm:text-lg md:text-xl text-neutral-700 font-serif italic">A universal mythology for a fragmented world.</div>
      </div>

      {/* Gallery */}
      <div className="w-full max-w-3xl mb-6 px-2 sm:px-0">
        <Swiper
          modules={[Navigation, Pagination, Autoplay]}
          slidesPerView={1}
          navigation={{ enabled: true }}
          pagination={{ clickable: true, dynamicBullets: true }}
          autoplay={{ delay: 4500, disableOnInteraction: false }}
          loop
          spaceBetween={0}
          className="rounded-lg sm:rounded-xl overflow-hidden shadow-xl border border-neutral-200"
        >
          {images.map((src, i) => (
            <SwiperSlide key={i}>
              <div className="relative w-full h-[44vh] sm:h-[56vh] md:h-[44vh] lg:h-[32rem] flex items-center justify-center bg-white">
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

      {/* Buttons */}
      <div className="mb-8 flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-4 w-full max-w-lg">
        <a
          href={ctaHref}
          className="inline-block bg-pink-600 hover:bg-pink-700 text-white font-semibold text-base sm:text-lg px-6 sm:px-7 py-2.5 sm:py-3 rounded-full shadow-lg transition-colors text-center"
        >
          Irreversible Choice
        </a>
        <a
          href="/heartandangel/letitgo"
          className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-semibold text-base sm:text-lg px-6 sm:px-7 py-2.5 sm:py-3 rounded-full shadow-lg transition-colors text-center"
        >
          Let the Heart Go
        </a>
      </div>

      {/* Concept Section */}
      <div className="max-w-2xl w-full mb-6 px-4 text-left font-serif text-[0.95rem] sm:text-[1.05rem] md:text-[1.15rem] leading-[1.6] sm:leading-[1.7] text-neutral-900">
        <h3 className="text-lg sm:text-xl font-bold mb-2 text-black">The Concept</h3>
        <p className="mb-4">
          We live in an era of broken connections. We are divided by borders, algorithms, and definitions.<br/>
          <span className="font-bold">"Heart & Angel"</span> is an attempt to bypass the mind and speak directly to the spirit. It creates a space where the duality of the world — good and evil, digital and physical — dissolves into a third element: <span className="font-bold">The Heart</span>.
        </p>
        <p className="mb-4">
          This is not a critique of the old world. It is a proposal for a new emotional literacy.<br/>
          The figures of the Angel and the Heart are stripped of religious dogma and gender markers not to make a political statement, but to reach the Universal Human.
        </p>
      </div>

      {/* Medium Section */}
      <div className="max-w-2xl w-full mb-6 px-4 text-left font-serif text-[0.95rem] sm:text-[1.05rem] md:text-[1.15rem] leading-[1.6] sm:leading-[1.7] text-neutral-900">
        <h3 className="text-lg sm:text-xl font-bold mb-2 text-black">The Medium</h3>
        <ul className="list-disc pl-6 mb-4">
          <li><span className="font-bold">Ink & Paper:</span> To ground the spirit in the physical moment.</li>
          <li><span className="font-bold">Digital & AR:</span> To let the symbol live in the ether.</li>
          <li><span className="font-bold">Code:</span> To turn empathy into a ritual.</li>
        </ul>
      </div>

      {/* Mission Section */}
      <div className="max-w-2xl w-full mb-6 px-4 text-left font-serif text-[0.95rem] sm:text-[1.05rem] md:text-[1.15rem] leading-[1.6] sm:leading-[1.7] text-neutral-900">
        <h3 className="text-lg sm:text-xl font-bold mb-2 text-black">The Mission</h3>
        <p className="mb-4">
          Can a simple symbol heal a complex trauma?<br/>
          This project explores love not as a romantic category, but as the only viable strategy for survival. It is an investigation into the physics of empathy.<br/>
          I do not aim to teach. I aim to remind.
        </p>
        <p className="italic text-neutral-700">Love is necessary. Love is never enough.</p>
      </div>
    </section>
  );
}
