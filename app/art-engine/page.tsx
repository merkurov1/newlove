import { Suspense } from 'react';
import Link from 'next/link';
import nextDynamic from 'next/dynamic';

const CloseableHero = nextDynamic(() => import('@/components/CloseableHero'), { ssr: false });
const AuctionSlider = nextDynamic(() => import('@/components/AuctionSlider'), { ssr: false });
const BentoArticlesFeed = nextDynamic(() => import('@/components/BentoArticlesFeed'), {
  ssr: false,
});
const FlowFeed = nextDynamic(() => import('@/components/FlowFeed'), { ssr: false });
const BackgroundShapes = nextDynamic(() => import('@/components/BackgroundShapes'), { ssr: false });

export const metadata = {
  title: 'Anton Merkurov | Digital Temple',
  description: 'A conceptual portal by Anton Merkurov. Art, advising, and curated selection.',
};

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-[#333]">

      {/* DECORATIVE BORDER TOP */}
      <div className="h-1 w-full bg-black fixed top-0 z-50"></div>

      <div className="max-w-3xl mx-auto px-6 pt-6 pb-16 md:pt-8 md:pb-24">
        <div className="flex flex-col items-center w-full">

          {/* SPACER + SYSTEM ACCESS BUTTON */}
          <div className="h-12 sm:h-20 flex items-end justify-center mb-8 sm:mb-12 w-full">
            <div className="flex justify-center">
              <Link
                href="/lobby"
                className="group flex items-center gap-3 px-5 py-2 rounded-full border border-gray-200 bg-white hover:bg-black hover:border-black transition-all duration-300"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <span className="font-mono text-[10px] sm:text-xs uppercase tracking-widest text-gray-500 group-hover:text-white transition-colors">
                  System Access
                </span>
              </Link>
            </div>
          </div>

          {/* NAVIGATION - THE THREE PILLARS */}
          <nav className="w-full flex flex-col gap-8 sm:gap-12 md:gap-16 mb-12 sm:mb-20 md:mb-24">
            <ul className="flex flex-col gap-8 sm:gap-12 md:gap-16">
              <li>
                <a href="/heartandangel" className="block text-center no-underline hover:opacity-60 transition" style={{ textDecoration: 'none' }}>
                  <span className="block text-4xl sm:text-6xl md:text-7xl" style={{ fontFamily: 'Cormorant Garamond, Playfair Display, serif', color: '#000', letterSpacing: '-0.02em', lineHeight: 1.1 }}>[ ART ]</span>
                  <div className="mt-2 text-xs sm:text-sm" style={{ fontFamily: 'Space Mono, Courier Prime, monospace', color: '#000', letterSpacing: 1 }}>
                    The digital ritual
                  </div>
                </a>
              </li>
              <li>
                <a href="/selection" className="block text-center no-underline hover:opacity-60 transition" style={{ textDecoration: 'none' }}>
                  <span className="block text-3xl sm:text-5xl md:text-6xl" style={{ fontFamily: 'Cormorant Garamond, Playfair Display, serif', color: '#000', letterSpacing: '-0.02em', lineHeight: 1.1 }}>[ SELECTION ]</span>
                  <div className="mt-2 text-xs sm:text-sm" style={{ fontFamily: 'Space Mono, Courier Prime, monospace', color: '#000', letterSpacing: 1 }}>
                    Curated works. Buffet & Non-conformists.
                  </div>
                </a>
              </li>
              <li>
                <a href="/advising" className="block text-center no-underline hover:opacity-60 transition" style={{ textDecoration: 'none' }}>
                  <span className="block text-3xl sm:text-5xl md:text-6xl" style={{ fontFamily: 'Cormorant Garamond, Playfair Display, serif', color: '#000', letterSpacing: '-0.02em', lineHeight: 1.1 }}>[ ADVISING ]</span>
                  <div className="mt-2 text-xs sm:text-sm" style={{ fontFamily: 'Space Mono, Courier Prime, monospace', color: '#000', letterSpacing: 1 }}>
                    Private art acquisition
                  </div>
                </a>
              </li>
            </ul>
          </nav>

          {/* MANIFESTO */}
          <section className="w-full mb-16 sm:mb-20">
            <div className="mx-auto px-3" style={{ maxWidth: 600, fontFamily: 'Space Mono, Courier Prime, monospace', color: '#222', fontSize: 'clamp(13px, 3vw, 14px)', lineHeight: 1.8, textAlign: 'center' }}>
              <p className="mb-6">
                <span style={{ textWrap: 'balance' }}>
                  I spent 20 years building digital networks. Now I build human connections.
                  <br />
                  I traded complexity for truth. My art is a return to the fundamental source code of humanity. No politics, no borders, no social burden. Just the raw, unfiltered transmission of empathy.
                  <br />
                  Love is necessary. Love is never enough.
                </span>
              </p>
            </div>
          </section>

          {/* CURATOR ENGINE — CASE STUDIES (WHITE CUBE STYLE) */}
          <section className="w-full pt-12 border-t border-gray-200">
            <div className="text-center mb-12">
              <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-gray-400 block mb-2">
                [ CURATOR ENGINE — AI ANALYSIS ]
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif text-gray-900">
                Institutional Case Studies
              </h2>
            </div>

            <div className="space-y-12">
              
              {/* Case 1: Fontana (Financial Analysis / Valuation & Arbitrage) */}
              <Link href="/case-study/fontana" className="block group text-center sm:text-left">
                <div className="border-b border-gray-100 pb-10 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 font-mono text-[10px] uppercase tracking-wider text-red-700 font-bold">
                    <span>Asset: Lucio Fontana (1968) // Valuation & Arbitrage</span>
                    <span className="text-gray-400 group-hover:text-black transition-colors mt-1 sm:mt-0">Analyze →</span>
                  </div>
                  <h3 className="font-serif text-2xl sm:text-3xl text-gray-900 group-hover:text-red-700 transition-colors mb-3">
                    CASE STUDY: THE WHITE ABSOLUTE
                  </h3>
                  <p className="font-serif italic text-gray-600 text-sm sm:text-base leading-relaxed max-w-2xl">
                    See how the Curator Engine analyzes liquidity, risk, and market arbitrage for institutional-grade assets. This is the level of depth I bring to every acquisition.
                  </p>
                </div>
              </Link>

              {/* Case 2: Garcia (Packaging & Curation) */}
              <Link href="/case-study/garcia" className="block group text-center sm:text-left">
                <div className="border-b border-gray-100 pb-10 transition-colors">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 font-mono text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                    <span>Asset: Emil Garcia // Curation & Packaging</span>
                    <span className="text-gray-400 group-hover:text-black transition-colors mt-1 sm:mt-0">Examine →</span>
                  </div>
                  <h3 className="font-serif text-2xl sm:text-3xl text-gray-900 group-hover:text-red-700 transition-colors mb-3">
                    CASE STUDY: POETICS OF SILENCE
                  </h3>
                  <p className="font-serif italic text-gray-600 text-sm sm:text-base leading-relaxed max-w-2xl">
                    Examine how AI-assisted provenance and structural framing transform non-conformist heritage into sovereign cultural capital.
                  </p>
                </div>
              </Link>

              {/* Case 3: Pivovarov (Conceptual Dossier) */}
              <Link href="/case-study/pivovarov" className="block group text-center sm:text-left">
                <div className="pb-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center mb-2 font-mono text-[10px] uppercase tracking-wider text-gray-500 font-bold">
                    <span>Asset: Ilya Pivovarov // Conceptual Dossier</span>
                    <span className="text-gray-400 group-hover:text-black transition-colors mt-1 sm:mt-0">Read Dossier →</span>
                  </div>
                  <h3 className="font-serif text-2xl sm:text-3xl text-gray-900 group-hover:text-red-700 transition-colors mb-3">
                    CASE STUDY: TOTAL LONELINESS
                  </h3>
                  <p className="font-serif italic text-gray-600 text-sm sm:text-base leading-relaxed max-w-2xl">
                    A foundational case study in Moscow Conceptualism, exploring inward-facing rigour, total solitude, and institutional endurance.
                  </p>
                </div>
              </Link>

            </div>
          </section>

        </div>
      </div>
    </main>
  );
}
