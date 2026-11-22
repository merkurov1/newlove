'use client';

import React from 'react';
import { ArrowRight } from 'lucide-react';
import SectionLanguageSwitcher from '@/components/i18n/SectionLanguageSwitcher';
import { ADVISING_COPY, type AdvisingLanguage } from '@/lib/i18n/advising';
import { getDirection } from '@/lib/i18n/config';

type Props = {
  lang?: AdvisingLanguage;
};

export default function AdvisingClient({ lang = 'en' }: Props) {
  const copy = ADVISING_COPY[lang];
  const dir = getDirection(lang);

  return (
    <div
      lang={lang}
      dir={dir}
      className="light-gallery min-h-screen bg-[#F5F2EB] text-[#1D1B18] font-sans selection:bg-[#1D1B18] selection:text-[#F5F2EB] antialiased relative overflow-x-hidden"
    >
      {/* Subtle Paper Grain Texture */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="max-w-4xl mx-auto px-6 md:px-12 pt-32 md:pt-40 pb-32 relative z-20 space-y-20">
        <div className="flex justify-end rtl:justify-start">
          <SectionLanguageSwitcher section="advising" currentLang={lang} />
        </div>

        {/* HERO & PORTRAIT */}
        <header className="space-y-10 border-b border-[#1D1B18]/12 pb-16">
          <div className="space-y-6">
            <h1 className="lg-display text-balance text-4xl sm:text-5xl lg:text-6xl font-serif font-normal tracking-tight text-[#1D1B18] leading-[1.08] break-words">
              {copy.hero.title}
            </h1>

            <p className="text-xl md:text-2xl text-[#6F6A60] font-serif leading-relaxed">
              {copy.hero.subtitle}
            </p>
          </div>

          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-2xl border border-[#1D1B18]/15 bg-[#E4DFD5] shadow-[0_24px_60px_rgba(58,46,30,0.12)]">
            <img
              src="https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Advising/IMG_1526.jpeg"
              alt={copy.hero.imageAlt}
              className="w-full h-full object-cover grayscale contrast-105"
            />
          </div>
        </header>

        {/* MANIFESTO */}
        <section className="space-y-8 font-serif text-xl md:text-2xl leading-relaxed text-[#3E3A34]">
          <p className="text-[#1D1B18] font-normal leading-snug">{copy.manifesto.lead}</p>
          <p className="text-[#6F6A60] text-lg md:text-xl leading-relaxed">{copy.manifesto.body}</p>
        </section>

        {/* THREE PILLARS OF CAPABILITY */}
        <section className="space-y-12 pt-12 border-t border-[#1D1B18]/12">
          <div className="space-y-2">
            <h2 className="text-3xl md:text-4xl font-serif text-[#1D1B18]">
              {copy.capability.title}
            </h2>
            <p className="text-sm font-serif text-[#6F6A60]">{copy.capability.subtitle}</p>
          </div>

          <div className="space-y-12">
            {copy.capability.pillars.map((pillar) => (
              <div key={pillar.number} className="space-y-3">
                <span
                  dir="ltr"
                  className="text-xs font-mono text-[#847E73] uppercase tracking-widest"
                >
                  {pillar.number}
                </span>
                <h3 className="text-2xl font-serif text-[#1D1B18]">{pillar.title}</h3>
                <p className="text-[#6F6A60] font-serif text-base md:text-lg leading-relaxed">
                  {pillar.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* WHO I WORK WITH */}
        <section className="space-y-8 pt-12 border-t border-[#1D1B18]/12">
          <h2 className="text-3xl md:text-4xl font-serif text-[#1D1B18]">
            {copy.environments.title}
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 pt-4">
            {copy.environments.items.map((item) => (
              <div key={item.title} className="space-y-2">
                <h3 className="font-serif text-xl font-medium text-[#1D1B18]">{item.title}</h3>
                <p className="text-base font-serif text-[#6F6A60] leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* OPERATING PRINCIPLES */}
        <section className="space-y-10 pt-12 border-t border-[#1D1B18]/12">
          <h2 className="text-3xl md:text-4xl font-serif text-[#1D1B18]">
            {copy.principles.title}
          </h2>

          <div className="space-y-8">
            {copy.principles.items.map((principle) => (
              <div key={principle.number} className="space-y-2">
                <h3 className="text-xl font-serif text-[#1D1B18] font-medium flex items-center gap-3">
                  <span dir="ltr" className="font-mono text-xs text-[#847E73]">
                    {principle.number}
                  </span>
                  {principle.title}
                </h3>
                <p className="text-[#6F6A60] font-serif text-base md:text-lg leading-relaxed ps-7">
                  {principle.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ENGAGEMENT FORMATS */}
        <section className="space-y-8 pt-12 border-t border-[#1D1B18]/12">
          <h2 className="text-3xl font-serif text-[#1D1B18]">{copy.formats.title}</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {copy.formats.items.map((format) => (
              <div key={format.kicker} className="space-y-2">
                <span className="text-xs font-mono uppercase tracking-widest text-[#847E73]">
                  {format.kicker}
                </span>
                <h3 className="font-serif text-xl text-[#1D1B18]">{format.title}</h3>
                <p className="text-base font-serif text-[#6F6A60] leading-relaxed">{format.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FOOTER & CALL TO ACTION */}
        <footer className="pt-16 border-t border-[#1D1B18]/12 flex flex-col md:flex-row md:items-center justify-between gap-8">
          <div className="space-y-2">
            <h3 className="text-2xl font-serif text-[#1D1B18]">{copy.footer.title}</h3>
            <p className="text-sm font-serif text-[#6F6A60]">{copy.footer.body}</p>
          </div>

          <a
            href="https://wa.me/16467270865"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-4 self-start rounded-full border border-[#1D1B18]/15 bg-white/55 px-6 py-3 shadow-[0_18px_50px_rgba(58,46,30,0.08)] backdrop-blur-md transition-all duration-300 hover:border-[#1D1B18]/40 hover:bg-white/70 md:self-auto"
          >
            <span className="font-mono text-xs uppercase tracking-[0.25em] font-semibold text-[#1D1B18] group-hover:text-[#6F6A60] transition-colors">
              {copy.footer.cta}
            </span>
            <ArrowRight
              size={16}
              className="rtl:-scale-x-100 group-hover:translate-x-1.5 rtl:group-hover:-translate-x-1.5 transition-transform duration-300 text-[#1D1B18] group-hover:text-[#6F6A60]"
            />
          </a>
        </footer>
      </div>
    </div>
  );
}
