'use client';

import React from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import PierrotSectionLink from '@/components/pierrot/PierrotSectionLink';
import SectionLanguageSwitcher from '@/components/i18n/SectionLanguageSwitcher';
import { LOBBY_COPY, type LobbyLanguage } from '@/lib/i18n/lobby';

type Props = {
  lang?: LobbyLanguage;
};

export default function LobbyClient({ lang = 'en' }: Props) {
  const copy = LOBBY_COPY[lang];

  return (
    <div
      lang={lang}
      dir="ltr"
      className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FAF8F5] antialiased relative overflow-x-hidden"
    >
      {/* Subtle Paper Grain Texture */}
      <div
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* HERO & PROOF BAR */}
      <section className="min-h-screen flex flex-col justify-between px-6 sm:px-8 md:px-16 pt-36 md:pt-44 pb-12 border-b border-zinc-200/60 relative z-20">
        <div className="w-full max-w-5xl mx-auto flex justify-end pb-8">
          <SectionLanguageSwitcher section="lobby" currentLang={lang} />
        </div>

        <div className="max-w-5xl mx-auto w-full text-center my-auto">
          <h1 className="text-4xl sm:text-6xl md:text-8xl lg:text-9xl font-serif font-normal tracking-tight leading-[0.98] sm:leading-[0.92] mb-10 text-[#111111] break-words">
            {copy.hero.line1}
            <br />
            <span className="text-zinc-500 italic hover:text-[#111111] transition-colors duration-700 cursor-default">
              {copy.hero.line2}
            </span>
          </h1>

          <div className="mx-auto max-w-2xl">
            <p className="text-xl md:text-2xl text-zinc-700 leading-relaxed font-serif mb-12 font-normal">
              {copy.hero.subtitle}
            </p>

            <PierrotSectionLink
              href="/advising"
              sectionId="advising"
              className="group inline-flex items-center gap-4 border-b-2 border-zinc-900 pb-1.5 hover:border-zinc-500 transition-all duration-300"
            >
              <span className="font-mono text-xs uppercase tracking-[0.25em] font-semibold text-[#111111] group-hover:text-zinc-600 transition-colors">
                {copy.hero.cta}
              </span>
              <ArrowRight
                size={16}
                className="group-hover:translate-x-1.5 transition-transform duration-300 text-[#111111] group-hover:text-zinc-600"
              />
            </PierrotSectionLink>
          </div>
        </div>

        {/* Institutional Proof Bar */}
        <div className="w-full max-w-6xl mx-auto pt-12 border-t border-zinc-300/60 grid grid-cols-2 md:grid-cols-4 gap-6 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          <Link href="/isakeyforall" className="group block hover:text-zinc-700 transition-colors">
            <span className="block text-[#111111] font-semibold mb-1 group-hover:underline underline-offset-4 decoration-zinc-400">
              {copy.proof.yearsValue}
            </span>
            {copy.proof.yearsLabel}
          </Link>

          <PierrotSectionLink
            href="/heritage"
            sectionId="heritage"
            className="group block hover:text-zinc-700 transition-colors"
          >
            <span className="block text-zinc-700 font-semibold mb-1 group-hover:text-[#111111] transition-colors">
              {copy.proof.heritageValue}
            </span>
            {copy.proof.heritageLabel}
          </PierrotSectionLink>

          <PierrotSectionLink
            href="/media"
            sectionId="media"
            className="group block hover:text-zinc-700 transition-colors"
          >
            <span className="block text-[#111111] font-semibold mb-1 group-hover:underline underline-offset-4 decoration-zinc-400">
              {copy.proof.publicistValue}
            </span>
            {copy.proof.publicistLabel}
          </PierrotSectionLink>

          <Link href="/art-engine" className="group block hover:text-zinc-700 transition-colors">
            <span className="block text-[#111111] font-semibold mb-1 group-hover:underline underline-offset-4 decoration-zinc-400">
              {copy.proof.artValue}
            </span>
            {copy.proof.artLabel}
          </Link>
        </div>
      </section>

      {/* TRACK RECORD */}
      <section className="py-28 md:py-36 px-6 sm:px-8 md:px-16 border-b border-zinc-200/60 relative z-20">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-32">
          <div>
            <Link
              href="/research"
              className="group mb-8 inline-flex items-start gap-3 text-[#111111]"
              aria-label={copy.track.ariaLabel}
            >
              <h2 className="text-4xl md:text-6xl font-serif font-normal leading-[1.1] underline decoration-transparent underline-offset-8 transition-colors duration-300 group-hover:decoration-zinc-400">
                {copy.track.title}
              </h2>

              <ArrowUpRight
                size={20}
                className="mt-2 shrink-0 text-zinc-400 transition-all duration-300 group-hover:-translate-y-1 group-hover:translate-x-1 group-hover:text-[#111111]"
              />
            </Link>

            <p className="text-lg md:text-xl text-zinc-600 leading-relaxed max-w-md font-serif mb-10">
              {copy.track.body}
            </p>

            <div className="pt-8 border-t border-zinc-200/80 font-mono text-xs text-zinc-500 space-y-3 leading-relaxed">
              <div>
                <strong className="text-zinc-800 uppercase tracking-wider">
                  {copy.track.lecturesLabel}
                </strong>{' '}
                {copy.track.lecturesValue}
              </div>

              <div>
                <strong className="text-zinc-800 uppercase tracking-wider">
                  {copy.track.expertLabel}
                </strong>{' '}
                {copy.track.expertValue}
              </div>
            </div>
          </div>

          {/* Timeline */}
          <div className="space-y-16 border-l border-zinc-300 pl-8 md:pl-12 py-2">
            {copy.track.timeline.map((item) => (
              <div key={item.period} className="relative group cursor-default">
                <span
                  className={`absolute -left-[37px] md:-left-[53px] top-2.5 w-2.5 h-2.5 rounded-full transition-all duration-500 ${
                    item.current ? 'bg-[#111111]' : 'bg-zinc-400 group-hover:bg-[#111111]'
                  }`}
                />

                <div
                  className={`font-mono text-xs mb-2 uppercase tracking-[0.25em] ${
                    item.current ? 'text-[#111111] font-semibold' : 'text-zinc-500 font-medium'
                  }`}
                >
                  {item.period}
                </div>

                <h3 className="text-2xl font-serif font-normal text-[#111111] mb-2">
                  {item.title}
                </h3>

                <p className="text-sm text-zinc-600 font-serif leading-relaxed">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* EDITORIAL PRESS CLIPPINGS */}
      <section className="py-24 px-6 sm:px-8 md:px-16 bg-[#F4F1EA]/80 border-b border-zinc-200/60 relative z-20">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 mb-14">
            <div>
              <span className="block font-mono text-xs font-medium uppercase tracking-[0.3em] text-zinc-500 mb-5">
                {copy.press.eyebrow}
              </span>

              <h2 className="max-w-3xl text-4xl md:text-6xl font-serif font-normal leading-[1.05] tracking-tight text-[#111111]">
                {copy.press.title}
              </h2>

              <p className="mt-5 max-w-2xl text-base md:text-lg text-zinc-600 font-serif leading-relaxed">
                {copy.press.body}
              </p>
            </div>

            <PierrotSectionLink
              href="/media"
              sectionId="media"
              className="group inline-flex w-fit shrink-0 items-center gap-4 border-b border-zinc-900 pb-3 text-[#111111] transition-colors hover:border-[#8D3D2E] hover:text-[#8D3D2E]"
            >
              <span className="font-mono text-xs uppercase tracking-[0.16em]">
                {copy.press.archiveCta}
              </span>
              <ArrowUpRight
                size={17}
                className="transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1"
              />
            </PierrotSectionLink>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12 font-serif">
            {copy.press.quotes.map((quote) => (
              <article key={quote.outlet} className="flex flex-col border-t border-zinc-300 pt-6">
                <div className="font-mono text-xs text-zinc-500 uppercase tracking-[0.2em] mb-5">
                  {quote.outlet}
                </div>

                <blockquote className="text-xl md:text-2xl text-[#111111] leading-snug">
                  {quote.quote}
                </blockquote>

                <div className="mt-auto pt-8 font-mono text-[10px] text-zinc-500 uppercase tracking-[0.15em]">
                  {quote.label}
                </div>
              </article>
            ))}
          </div>

          <div className="mt-14 pt-6 border-t border-zinc-300/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="max-w-xl text-sm text-zinc-500 font-serif leading-relaxed">
              {copy.press.archiveNote}
            </p>

            <PierrotSectionLink
              href="/media"
              sectionId="media"
              className="group inline-flex items-center gap-3 text-sm text-[#111111] hover:text-[#8D3D2E] transition-colors"
            >
              <span className="underline underline-offset-4 decoration-zinc-400 group-hover:decoration-[#8D3D2E]">
                {copy.press.browseCta}
              </span>
              <ArrowRight
                size={15}
                className="transition-transform duration-300 group-hover:translate-x-1"
              />
            </PierrotSectionLink>
          </div>
        </div>
      </section>

      {/* DUAL ROOTS */}
      <section className="py-28 md:py-36 px-6 sm:px-8 md:px-16 relative z-20">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20">
            {/* GRANITE */}
            <div className="p-10 md:p-14 border border-zinc-300 bg-white/50 rounded-3xl flex flex-col justify-between hover:border-zinc-900 hover:shadow-lg transition-all duration-300">
              <div>
                <span className="block font-mono text-zinc-500 text-xs uppercase tracking-[0.3em] mb-6 font-medium">
                  {copy.roots.granite.eyebrow}
                </span>

                <p className="text-2xl md:text-3xl leading-relaxed font-serif text-zinc-900 font-normal">
                  {copy.roots.granite.body}
                </p>
              </div>

              <div className="mt-10 pt-6 border-t border-zinc-200/80 flex flex-wrap items-center justify-between gap-4">
                <div className="font-mono text-xs text-zinc-500 uppercase tracking-[0.25em]">
                  {copy.roots.granite.name}
                </div>

                <PierrotSectionLink
                  href="/heritage"
                  sectionId="heritage"
                  className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-zinc-300 bg-transparent text-zinc-700 hover:border-zinc-500 hover:text-zinc-900 transition-colors font-mono text-[11px] uppercase tracking-[0.2em] font-semibold"
                >
                  <span>{copy.roots.granite.cta}</span>
                  <ArrowUpRight
                    size={14}
                    className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
                  />
                </PierrotSectionLink>
              </div>
            </div>

            {/* ETHER */}
            <div className="p-10 md:p-14 border border-zinc-900/30 bg-white/90 shadow-sm rounded-3xl flex flex-col justify-between hover:border-zinc-900 hover:shadow-lg transition-all duration-300">
              <div>
                <span className="block font-mono text-zinc-700 text-xs uppercase tracking-[0.3em] mb-6 font-medium">
                  {copy.roots.ether.eyebrow}
                </span>

                <p className="text-2xl md:text-3xl leading-relaxed font-serif text-[#111111] font-normal">
                  {copy.roots.ether.body}
                </p>
              </div>

              <div className="mt-10 pt-6 border-t border-zinc-200/80 flex flex-wrap items-center justify-between gap-4">
                <div className="font-mono text-xs text-zinc-500 uppercase tracking-[0.25em]">
                  {copy.roots.ether.name}
                </div>

                <Link
                  href="/heartandangel"
                  className="group inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-zinc-300 bg-white text-zinc-900 hover:border-zinc-900 transition-colors font-mono text-[11px] uppercase tracking-[0.2em] font-semibold"
                >
                  <span>{copy.roots.ether.cta}</span>
                  <ArrowUpRight
                    size={14}
                    className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"
                  />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* UNFRAMED — BOOK FEATURE */}
      <section className="relative z-20 bg-[#050505] text-white border-t border-zinc-900 overflow-hidden">
        <Link
          href="/unframed"
          aria-label={copy.unframed.ariaLabel}
          className="group block relative px-6 sm:px-8 md:px-16 py-24 md:py-36"
        >
          <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
              <span className="h-[2px] w-10 bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.7)]" />
              <span className="font-mono text-[10px] md:text-xs uppercase tracking-[0.3em] text-red-500">
                {copy.unframed.eyebrow}
              </span>
            </div>

            <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-10">
              <div>
                <h2 className="text-[16vw] md:text-[11vw] font-black uppercase tracking-tighter leading-[0.78] text-white transition-colors duration-500 group-hover:text-zinc-300">
                  {copy.unframed.title}
                </h2>

                <p className="mt-8 max-w-xl font-serif text-lg md:text-2xl leading-relaxed text-zinc-400">
                  {copy.unframed.body}
                </p>
              </div>

              <div className="flex shrink-0 items-center gap-4 border-b border-zinc-700 pb-3 font-mono text-xs uppercase tracking-[0.2em] text-white transition-colors group-hover:border-red-600 group-hover:text-red-500">
                <span>{copy.unframed.cta}</span>
                <ArrowUpRight
                  size={18}
                  className="transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1"
                />
              </div>
            </div>
          </div>

          <div className="absolute right-[-3rem] top-[-4rem] select-none pointer-events-none font-black text-[32rem] leading-none text-white/[0.025]">
            U
          </div>
        </Link>
      </section>
    </div>
  );
}
