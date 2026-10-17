'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Newsreader, Manrope } from 'next/font/google';
import { Swiper, SwiperSlide } from 'swiper/react';
import { FreeMode, Mousewheel } from 'swiper/modules';
import 'swiper/css';
import 'swiper/css/free-mode';

const serif = Newsreader({
  subsets: ['latin'],
  weight: ['300', '400'],
  style: ['normal', 'italic'],
  display: 'swap',
});

const sans = Manrope({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

const STORAGE = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public';

const galleryImages = [
  'IMG_1508', 'IMG_1510', 'IMG_1511', 'IMG_1513', 'IMG_1514', 'IMG_1516', 'IMG_1517',
  'IMG_1519', 'IMG_1521', 'IMG_1522', 'IMG_1523', 'IMG_1524', 'IMG_1525',
].map((name) => `${STORAGE}/heartandangel/Gallery/${name}.JPG`);

const SOCIAL_LINKS = [
  { name: 'YouTube', href: 'https://www.youtube.com/watch?v=cfmUSH0rTno' },
  { name: 'Instagram', href: 'https://www.instagram.com/heart_and_angel' },
  { name: 'TikTok', href: 'https://www.tiktok.com/@merkurov' },
  { name: 'Facebook', href: 'https://www.facebook.com/heartandangel.love' },
  { name: 'Telegram', href: 'https://t.me/heartandangel' },
  { name: 'Patreon', href: 'https://www.patreon.com/c/heartandangel' },
];

const MEDIUM = [
  ['Ink & Paper', 'Grounding the spirit in the physical.'],
  ['Digital / AR', 'Living in the ether.'],
  ['Code', 'Empathy as a ritual.'],
];

const VIDEO_ID = 'cfmUSH0rTno';

const label = 'text-xs font-semibold uppercase tracking-[0.2em]';
const bodySerif = `${serif.className} font-light leading-[1.6]`;

export default function HeartAndAngelHub() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    if (!isModalOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsModalOpen(false);
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isModalOpen]);

  return (
    <main
      className={`${sans.className} relative min-h-screen overflow-x-hidden bg-[#FAF8F5] text-[#141210] selection:bg-black selection:text-white`}
    >
      {/* ───────── HERO ───────── */}
      <div className="relative w-full bg-[#EAF2F8] md:flex md:h-[100dvh] md:flex-col md:justify-between md:overflow-hidden md:bg-[#FAF8F5]">
        {/* Desktop background */}
        <div className="absolute inset-0 hidden md:block">
          <Image
            src={`${STORAGE}/heartandangel/World.png`}
            alt="Heart & Angel World"
            fill
            className="object-cover"
            priority
            draggable={false}
          />
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/40" />
        </div>

        {/* Mobile */}
        <div className="flex min-h-[calc(100vh-70px)] flex-col justify-between bg-[#EAF2F8] px-5 pb-6 pt-20 md:hidden">
          <div className="space-y-1.5 text-center">
            <h1 className={`${serif.className} text-2xl font-light tracking-wider text-zinc-900`}>
              Heart &amp; Angel
            </h1>
            <p className={`${serif.className} text-xs font-light leading-relaxed tracking-wide text-zinc-600`}>
              The universal mythology for a fragmented world.
            </p>
            <p className={`${serif.className} text-xs font-light italic leading-relaxed tracking-wide text-zinc-600`}>
              The Greatest Love Story Ever Told.
            </p>
          </div>

          <div className="relative my-2 h-44 w-full">
            <Image
              src={`${STORAGE}/heartandangel/World.png`}
              alt="Heart & Angel World"
              fill
              className="object-contain drop-shadow-md"
              priority
              draggable={false}
            />
          </div>

          <div className="space-y-3 text-center">
            <h2 className={`${serif.className} text-xl font-light tracking-wider text-zinc-900`}>
              Enter the Living World
            </h2>
            <p className={`${serif.className} mx-auto max-w-xs text-xs font-light leading-relaxed tracking-wide text-zinc-600`}>
              Step into the eternal landscape where time flows, angels and demons coexist, and ambient music fills the air.
            </p>
            <div>
              <Link
                href="/heartandangel/world"
                className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-zinc-900 py-3.5 text-xs font-medium uppercase tracking-widest text-white shadow-md transition-all duration-300 hover:bg-zinc-800"
              >
                <span>Explore World</span>
                <ArrowIcon className="h-3.5 w-3.5" />
              </Link>
              <Link
                href="/heartandangel/about"
                className="mt-3 inline-flex items-center justify-center py-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-600 transition hover:text-zinc-900"
              >
                About the World
              </Link>
            </div>
          </div>
        </div>

        {/* Desktop */}
        <div className="relative z-10 hidden h-full flex-col justify-between md:flex">
          <div className="mx-auto flex w-full max-w-7xl justify-end px-10 pt-36">
            <div className="max-w-lg space-y-3 text-right text-white drop-shadow-lg">
              <h1 className={`${serif.className} text-6xl font-light tracking-wider`}>Heart &amp; Angel</h1>
              <p className={`${serif.className} text-lg font-light leading-relaxed tracking-wide text-stone-100`}>
                The universal mythology for a fragmented world.
              </p>
              <p className={`${serif.className} pt-0.5 text-lg font-light italic leading-relaxed tracking-wide text-stone-100`}>
                The Greatest Love Story Ever Told.
              </p>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-7xl flex-col items-start px-10 pb-28">
            <div className="max-w-xl space-y-3 drop-shadow-lg">
              <h2 className={`${serif.className} text-6xl font-light tracking-wider text-white`}>
                Enter the Living World
              </h2>
              <p className={`${serif.className} max-w-md text-lg font-light leading-relaxed tracking-wide text-stone-100`}>
                Step into the eternal landscape where time flows, angels and demons coexist, and ambient music fills the air.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <Link
                  href="/heartandangel/world"
                  className="inline-flex items-center gap-3 rounded-full bg-white px-8 py-4 text-sm font-medium uppercase tracking-widest text-stone-900 shadow-2xl transition-all duration-300 hover:bg-stone-100"
                >
                  <span>Explore World</span>
                  <ArrowIcon className="h-4 w-4" />
                </Link>
                <Link
                  href="/heartandangel/about"
                  className="inline-flex items-center rounded-full border border-white/60 px-6 py-3.5 text-sm uppercase tracking-widest text-white transition hover:bg-white/15"
                >
                  About the World
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ───────── I. ИДЕЯ ───────── */}
      <section className="px-6 py-24 md:py-40">
        <div className={`${bodySerif} mx-auto max-w-[680px] space-y-7 text-xl text-[#2A2622] md:text-2xl`}>
          <p>
            Heart &amp; Angel is an ongoing multidisciplinary art project exploring the Angel, the Devil and the heart
            through painting, digital graphics, augmented reality and code.
          </p>
          <p>
            In an era dominated by noise, algorithmic fragmentation, and cynicism, the project seeks to reintroduce
            universal symbols that bypass intellectual defense mechanisms and speak directly to human intuition.
          </p>
        </div>

        <blockquote
          className={`${serif.className} mx-auto my-16 max-w-5xl text-center text-4xl font-light italic leading-[1.15] md:my-24 md:text-6xl`}
        >
          “Simplicity is the ultimate sophistication of survival.”
        </blockquote>

        <div className={`${bodySerif} mx-auto max-w-[680px] space-y-7 text-xl text-[#2A2622] md:text-2xl`}>
          <p>
            Each piece serves as both a physical artifact and a digital token—anchoring emotional capital onto
            decentralized ledgers to ensure permanence across mediums.
          </p>
          <p>
            Heart &amp; Angel is a transmedia art project about choice, identity and the ways we learn to care. Each
            image is a digital artifact. We do not stretch them to fit screens; we build the space around them to
            honor their scale.
          </p>
          <p className="text-lg text-[#5B544C] md:text-xl">
            This project explores love not as a romantic category, but as the only viable strategy for survival. It is
            an investigation into the physics of empathy in a broken world.
          </p>
        </div>

        <dl className="mx-auto mt-16 max-w-[680px] border-t border-[#D9D2C7] md:mt-20">
          {MEDIUM.map(([term, desc]) => (
            <div
              key={term}
              className={`${serif.className} grid grid-cols-1 gap-1 border-b border-[#D9D2C7] py-5 text-lg sm:grid-cols-[180px_1fr] sm:gap-6 md:text-xl`}
            >
              <dt className="font-normal">{term}</dt>
              <dd className="font-light text-[#5B544C]">{desc}</dd>
            </div>
          ))}
        </dl>

        <p
          className={`${serif.className} mx-auto mt-20 max-w-3xl text-center text-2xl font-light italic md:mt-28 md:text-4xl`}
        >
          “Love is necessary. Love is never enough.”
        </p>
      </section>

      {/* ───────── II. РАБОТЫ ───────── */}
      <section className="overflow-hidden bg-[#141210] py-16 md:py-32">
        {/* Видео: постер, плеер открывается по клику */}
        <div className="mx-auto max-w-[1280px] px-4 sm:px-8">
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            aria-label="Open Heart and Angel film"
            className="group relative block aspect-video w-full overflow-hidden bg-[#2B2723]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`https://i.ytimg.com/vi/${VIDEO_ID}/maxresdefault.jpg`}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover opacity-90 transition duration-500 group-hover:scale-[1.02] group-hover:opacity-100"
            />
            <span className="absolute inset-0 flex items-center justify-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#FAF8F5] text-[#141210] transition-transform duration-300 group-hover:scale-110 md:h-24 md:w-24">
                <svg className="h-6 w-6 md:h-7 md:w-7" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M7 4l13 8-13 8z" fill="currentColor" />
                </svg>
              </span>
            </span>
          </button>
        </div>

        {/* Галерея: на всю ширину, без подписей */}
        <div className="mt-12 md:mt-24">
          <Swiper
            modules={[FreeMode, Mousewheel]}
            spaceBetween={24}
            slidesPerView="auto"
            slidesOffsetBefore={24}
            slidesOffsetAfter={24}
            freeMode
            mousewheel={{ forceToAxis: true }}
            grabCursor
            className="w-full"
          >
            {galleryImages.map((src, idx) => (
              <SwiperSlide key={src} className="!w-[82vw] sm:!w-[640px]">
                <div className="relative aspect-[4/3] w-full bg-[#1F1C19]">
                  <Image
                    src={src}
                    alt={`Heart & Angel artwork ${idx + 1}`}
                    fill
                    className="object-contain p-3"
                    sizes="(max-width: 640px) 82vw, 640px"
                  />
                </div>
              </SwiperSlide>
            ))}
          </Swiper>
        </div>
      </section>

      {/* ───────── III. ПРИЗНАНИЕ ───────── */}
      <section className="px-6 py-24 md:py-36">
        <figure className="mx-auto grid max-w-[1200px] items-center gap-10 md:grid-cols-[1.15fr_1fr] md:gap-20">
          <div className="relative w-full overflow-hidden bg-[#E7E1D7]">
            <Image
              src={`${STORAGE}/media/1759056368546-IMG_0512.jpeg`}
              alt="Magazine spread featuring Angel’s Heart by Anton Merkurov"
              width={1600}
              height={1100}
              unoptimized
              className="block h-auto w-full object-contain"
              sizes="(max-width: 768px) 100vw, 640px"
            />
          </div>

          <figcaption>
            <p className={`${label} mb-7 text-[#8A8176]`}>In the Press</p>
            <blockquote>
              <p className={`${serif.className} text-xl font-light leading-[1.5] md:text-[28px]`}>
                I spent a long time looking for words to write in this issue, but I found something that, I hope, will
                speak better than words. This is the work of the artist Anton Merkurov (@merkurov.art). His “Angel’s
                Heart” speaks better. And may love give us strength, hope and support.
              </p>
            </blockquote>
            <p className={`${serif.className} mt-9 text-xl`}>Anna Burashova</p>
            <p className="mt-1.5 text-[13px] tracking-[0.08em] text-[#8A8176]">
              Editor in Chief, Marie Claire Russia
            </p>
          </figcaption>
        </figure>
      </section>

      {/* ───────── IV. ОТКРЫТКА ───────── */}
      <section className="bg-[#A8402C] text-[#FAF8F5]">
        <div className="mx-auto grid max-w-[1440px] md:min-h-[600px] md:grid-cols-2">
          <Link
            href="/heartandangel/card"
            aria-label="Discover Heart & Angel postcards"
            className="group relative block min-h-[340px] overflow-hidden bg-[#C4573F] sm:min-h-[460px]"
          >
            <Image
              src={`${STORAGE}/artifacts/Postcard/IMG_0425.gif`}
              alt="An angel sending a Heart & Angel postcard"
              fill
              unoptimized
              sizes="(max-width: 768px) 100vw, 50vw"
              className="object-contain p-6 transition-transform duration-700 group-hover:scale-[1.025] sm:p-10"
            />
          </Link>

          <div className="flex flex-col items-start justify-center px-7 py-14 sm:px-12 md:px-20 md:py-24">
            <p className={`${label} opacity-85`}>A small thing that travels far</p>

            <h2 className={`${serif.className} mt-5 text-5xl font-light leading-[1.05] md:text-7xl`}>
              Send a little love.
            </h2>

            <p className={`${serif.className} mt-6 max-w-md text-lg font-light leading-[1.5] md:text-[22px]`}>
              An original Heart &amp; Angel artwork, made into a physical postcard. Add a message and send it directly
              to someone you care about.
            </p>

            <p className="mt-7 text-sm font-medium tracking-[0.08em]">£29 · postage included</p>

            <Link
              href="/heartandangel/card"
              className="mt-9 inline-flex items-center gap-3 rounded-full bg-[#FAF8F5] px-9 py-5 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#141210] transition hover:bg-white"
            >
              Discover the postcard <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </div>
      </section>

      {/* ───────── V. ВЫХОД ───────── */}
      <footer className="bg-[#141210] px-6 pb-16 pt-20 text-center text-[#FAF8F5] md:pt-24">
        <h3 className={`${serif.className} text-3xl font-light md:text-[40px]`}>About the World</h3>

        <p className={`${serif.className} mx-auto mt-4 max-w-xl text-lg font-light leading-[1.5] opacity-80 md:text-xl`}>
          Meet the Angel and the Devil, follow the heart, and enter a living mythology built from play, attention and
          love.
        </p>

        <Link
          href="/heartandangel/about"
          className="mt-7 inline-block border-b border-[#FAF8F5] pb-1 text-[13px] font-semibold uppercase tracking-[0.14em] transition hover:opacity-70"
        >
          Read the story
        </Link>

        <nav
          aria-label="Social links"
          className="mx-auto mt-16 flex max-w-3xl flex-wrap justify-center gap-x-9 gap-y-3 border-t border-[#FAF8F5]/20 pt-8 text-[13px] uppercase tracking-[0.12em] md:mt-20"
        >
          {SOCIAL_LINKS.map((social) => (
            <a
              key={social.name}
              href={social.href}
              target="_blank"
              rel="noopener noreferrer"
              className="opacity-85 transition hover:opacity-100"
            >
              {social.name}
            </a>
          ))}
        </nav>
      </footer>

      {/* ───────── Модальное окно видео ───────── */}
      {isModalOpen && (
        <div
          onClick={() => setIsModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Heart and Angel film"
          className="animate-fadeIn fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4 backdrop-blur-xl sm:p-8"
        >
          <div
            onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
            className="relative aspect-video w-full max-w-5xl overflow-hidden rounded-3xl border border-white/10 bg-black shadow-2xl"
          >
            <button
              type="button"
              onClick={() => setIsModalOpen(false)}
              aria-label="Close film"
              className="absolute right-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-white/20 text-white backdrop-blur-md transition-colors hover:bg-white/40"
            >
              ✕
            </button>

            <iframe
              src={`https://www.youtube-nocookie.com/embed/${VIDEO_ID}?autoplay=1&controls=1&modestbranding=1`}
              title="Heart & Angel Archive Full"
              className="h-full w-full border-0"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}
    </main>
  );
}

function ArrowIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" />
    </svg>
  );
}
