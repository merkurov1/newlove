import { Suspense } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import nextDynamic from 'next/dynamic';

const CloseableHero = nextDynamic(() => import('@/components/CloseableHero'), { ssr: false });
const AuctionSlider = nextDynamic(() => import('@/components/AuctionSlider'), { ssr: false });

export const metadata = {
  title: 'Anton Merkurov | Digital Temple',
  description: 'A conceptual portal by Anton Merkurov. Art, advising, and curated selection.',
};

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-[#333] selection:bg-black selection:text-white">

      {/* DECORATIVE BORDER TOP */}
      <div className="h-1 w-full bg-black fixed top-0 z-50"></div>

      <div className="max-w-3xl mx-auto px-6 pt-6 pb-24 md:pt-8 md:pb-32">
        <div className="flex flex-col items-center w-full">

          {/* SYSTEM ACCESS BUTTON */}
          <div className="h-12 sm:h-20 flex items-end justify-center mb-12 sm:mb-16 w-full">
            <div className="flex justify-center">
              <Link
                href="/lobby"
                className="group flex items-center gap-3 px-6 py-2.5 rounded-full border border-neutral-200 bg-white hover:bg-black hover:border-black transition-all duration-300"
              >
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <span className="font-mono text-[10px] sm:text-xs uppercase tracking-widest text-neutral-500 group-hover:text-white transition-colors">
                  System Access
                </span>
              </Link>
            </div>
          </div>

          {/* NAVIGATION - THE THREE PILLARS */}
          <nav className="w-full flex flex-col gap-10 sm:gap-16 mb-20 sm:mb-28">
            <ul className="flex flex-col gap-10 sm:gap-16">
              <li>
                <a href="/heartandangel" className="block text-center no-underline hover:opacity-60 transition" style={{ textDecoration: 'none' }}>
                  <span className="block text-4xl sm:text-6xl md:text-7xl" style={{ fontFamily: 'Cormorant Garamond, Playfair Display, serif', color: '#000', letterSpacing: '-0.02em', lineHeight: 1.1 }}>[ ART ]</span>
                  <div className="mt-2 text-xs sm:text-sm" style={{ fontFamily: 'Space Mono, Courier Prime, monospace', color: '#666', letterSpacing: '1px' }}>
                    The digital ritual
                  </div>
                </a>
              </li>
              <li>
                <a href="/selection" className="block text-center no-underline hover:opacity-60 transition" style={{ textDecoration: 'none' }}>
                  <span className="block text-3xl sm:text-5xl md:text-6xl" style={{ fontFamily: 'Cormorant Garamond, Playfair Display, serif', color: '#000', letterSpacing: '-0.02em', lineHeight: 1.1 }}>[ SELECTION ]</span>
                  <div className="mt-2 text-xs sm:text-sm" style={{ fontFamily: 'Space Mono, Courier Prime, monospace', color: '#666', letterSpacing: '1px' }}>
                    Curated works. Buffet & Non-conformists.
                  </div>
                </a>
              </li>
              <li>
                <a href="/advising" className="block text-center no-underline hover:opacity-60 transition" style={{ textDecoration: 'none' }}>
                  <span className="block text-3xl sm:text-5xl md:text-6xl" style={{ fontFamily: 'Cormorant Garamond, Playfair Display, serif', color: '#000', letterSpacing: '-0.02em', lineHeight: 1.1 }}>[ ADVISING ]</span>
                  <div className="mt-2 text-xs sm:text-sm" style={{ fontFamily: 'Space Mono, Courier Prime, monospace', color: '#666', letterSpacing: '1px' }}>
                    Heritage Architecture & Art Advisory
                  </div>
                </a>
              </li>
            </ul>
          </nav>

          {/* CURATORIAL CASE STUDIES (WHITE CUBE STYLE) */}
          <section className="w-full pt-12 border-t border-neutral-200">
            <div className="text-center mb-12">
              <span className="font-mono text-[10px] tracking-[0.3em] uppercase text-neutral-400 block mb-2">
                [ MONOGRAPHS & CASE STUDIES ]
              </span>
              <h2 className="text-2xl sm:text-3xl font-serif text-neutral-900">
                Curatorial Dossiers
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-8">
              
              {/* Case Study 1: Pivovarov */}
              <Link href="/case-study/pivovarov" className="group block">
                <div className="p-6 sm:p-8 bg-neutral-50/50 hover:bg-neutral-50 transition-all duration-300 rounded-3xl border border-neutral-100 hover:border-neutral-300">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
                      // MOSCOW CONCEPTUALISM
                    </span>
                    <span className="font-mono text-[10px] text-neutral-900 group-hover:translate-x-1 transition-transform">
                      Read Dossier →
                    </span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-serif text-neutral-900 mb-2 group-hover:text-red-700 transition-colors">
                    Ilya Pivovarov: Total Loneliness
                  </h3>
                  <p className="font-serif italic text-neutral-600 text-sm sm:text-base leading-relaxed">
                    A canonical artifact of Moscow Conceptualism. Quiet, inward-facing, formal rigour and intellectual refusal of spectacle.
                  </p>
                </div>
              </Link>

              {/* Case Study 2: Fontana */}
              <Link href="/case-study/fontana" className="group block">
                <div className="p-6 sm:p-8 bg-neutral-50/50 hover:bg-neutral-50 transition-all duration-300 rounded-3xl border border-neutral-100 hover:border-neutral-300">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
                      // SPATIALISM
                    </span>
                    <span className="font-mono text-[10px] text-neutral-900 group-hover:translate-x-1 transition-transform">
                      Read Dossier →
                    </span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-serif text-neutral-900 mb-2 group-hover:text-red-700 transition-colors">
                    Lucio Fontana: The Gesture of Void
                  </h3>
                  <p className="font-serif italic text-neutral-600 text-sm sm:text-base leading-relaxed">
                    Cutting through the canvas to reach the dimension beyond. Spatial concepts, infinite space, and the purity of gesture.
                  </p>
                </div>
              </Link>

              {/* Case Study 3: Garcia */}
              <Link href="/case-study/garcia" className="group block">
                <div className="p-6 sm:p-8 bg-neutral-50/50 hover:bg-neutral-50 transition-all duration-300 rounded-3xl border border-neutral-100 hover:border-neutral-300">
                  <div className="flex justify-between items-center mb-3">
                    <span className="font-mono text-[9px] uppercase tracking-widest text-neutral-400">
                      // ARCHIVAL STUDY
                    </span>
                    <span className="font-mono text-[10px] text-neutral-900 group-hover:translate-x-1 transition-transform">
                      Read Dossier →
                    </span>
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-serif text-neutral-900 mb-2 group-hover:text-red-700 transition-colors">
                    Emil Garcia: Poetics of Silence
                  </h3>
                  <p className="font-serif italic text-neutral-600 text-sm sm:text-base leading-relaxed">
                    An examination of form, restraint, and the quiet dignity of non-conformist heritage.
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
