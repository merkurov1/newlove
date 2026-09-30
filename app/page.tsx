'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import Header from '@/components/Header';

export default function Home() {
  return (
    <>
      <Header />

      <main className="min-h-screen w-full bg-[#FAF8F5] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FAF8F5] flex flex-col justify-between px-6 sm:px-12 pt-36 md:pt-44 pb-12 antialiased relative overflow-x-hidden">
        
        {/* Subtle Paper Grain Overlay */}
        <div
          className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25'filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
          }}
        />

        {/* MERKUROV ARCHIVE & PILLARS */}
        <div className="w-full max-w-5xl mx-auto flex flex-col items-center justify-center my-auto text-center z-20 space-y-12 py-10">
          <div className="w-full">
            <p className="font-serif italic text-zinc-600 text-base sm:text-lg md:text-xl mb-8 sm:mb-10 tracking-wide font-normal max-w-lg mx-auto px-4">
              “Structure is the antidote to chaos.”
            </p>

            <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-serif font-normal tracking-tight leading-[1.05] sm:leading-[0.98] text-[#111111] mb-12 sm:mb-16 px-2 break-words">
              Context Architecture <br className="hidden sm:inline" />
              <span className="text-zinc-500 italic font-serif">&amp; Cultural Capital</span>
            </h1>

            <nav className="flex flex-wrap justify-center gap-4 sm:gap-8 md:gap-12 items-center font-mono text-xs sm:text-sm md:text-base uppercase tracking-[0.2em] mb-12 px-4">
              {[
                { label: 'Art', href: '/heartandangel' },
                { label: 'Selection', href: '/selection' },
                { label: 'Advising', href: '/advising' },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="group inline-flex items-center gap-2 py-2 text-[#111111] hover:text-zinc-600 transition-colors"
                >
                  <span className="text-zinc-400 group-hover:text-zinc-700 transition-colors">[</span>
                  <span className="font-medium tracking-[0.2em] underline underline-offset-8 decoration-zinc-300 group-hover:decoration-black transition-colors">
                    {item.label}
                  </span>
                  <span className="text-zinc-400 group-hover:text-zinc-700 transition-colors">]</span>
                </Link>
              ))}
            </nav>
          </div>

          {/* Lobby Portal Anchor */}
          <div>
            <Link
              href="/lobby"
              className="group inline-flex items-center gap-3 border border-zinc-900/20 bg-white/80 hover:bg-[#111111] text-[#111111] hover:text-[#FAF8F5] px-8 py-4 transition-all duration-300 ease-out backdrop-blur-sm shadow-sm rounded-full"
            >
              <span className="font-serif text-base sm:text-lg italic font-normal tracking-wide px-1">
                Enter The Lobby
              </span>
              <ArrowUpRight
                size={18}
                className="text-zinc-600 group-hover:text-[#FAF8F5] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300"
              />
            </Link>
          </div>
        </div>

        {/* --- FOOTER DIRECTORY --- */}
        <footer className="w-full max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4 pt-6 border-t border-zinc-300/80 shrink-0 font-mono text-[11px] sm:text-xs text-zinc-500 uppercase tracking-[0.25em] mt-16 z-20 text-center sm:text-left">
          <span>Merkurov Private Office</span>
          <span>Digital Heritage Architecture</span>
        </footer>

      </main>
    </>
  );
}
