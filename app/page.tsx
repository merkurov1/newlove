// app/page.js
import { Suspense } from 'react';
import Link from 'next/link';
import nextDynamic from 'next/dynamic';
// import { safeData } from '@/lib/safeSerialize'; // Убедись, что этот импорт нужен, если нет - удали

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

const AuctionSkeleton = () => (
  <div className="aspect-[2/1] w-full animate-pulse rounded-xl bg-gray-300 dark:bg-neutral-800"></div>
);

function extractFirstImage(content: any): string | null {
  if (!content || typeof content !== 'string') return null;
  try {
    const contentArray = JSON.parse(content);
    if (Array.isArray(contentArray)) {
      for (const block of contentArray) {
        const html = block?.data?.html;
        if (html && typeof html === 'string') {
          const match = html.match(/<img[^>]+src="([^"]+)"/);
          if (match && match[1]) {
            return match[1].replace(/([^:]\/)\/+/g, '$1');
          }
        }
      }
    }
  } catch (e) {
    /* Игнорируем ошибку */
  }
  const fallbackMatch = content.match(/<img[^>]+src="([^"]+)"/);
  if (fallbackMatch && fallbackMatch[1]) {
    return fallbackMatch[1].replace(/([^:]\/)\/+/g, '$1');
  }
  return null;
}

// ... helper function getArticlesByTag removed/collapsed for brevity if not used in this view directly 
// ... or keep it if you use it for fetching data below

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-[#333]">

      {/* DECORATIVE BORDER TOP */}
      <div className="h-1 w-full bg-black fixed top-0 z-50"></div>

      <div className="max-w-3xl mx-auto px-6 pt-6 pb-12 md:pt-8 md:pb-16">
        <div className="flex flex-col items-center w-full">

          {/* Header Section (styling only; removed empty spacer per request) */}

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
          <nav className="w-full flex flex-col gap-8 sm:gap-12 md:gap-16 mb-12 sm:mb-24 md:mb-32">
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
          <section className="w-full mb-12 sm:mb-16 md:mb-24">
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

        </div>
      </div>

    </main>
  );
}