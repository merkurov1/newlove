// app/page.js
import { Suspense } from 'react';
import Link from 'next/link';
import nextDynamic from 'next/dynamic';
import { safeData } from '@/lib/safeSerialize';

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

function extractFirstImage(content: any) {
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

async function getArticlesByTag(supabase: any, tagSlug: string, limit = 50) {
  try {
    // Prefer tolerant helper which handles various DB shapes and junctions
    const { getArticlesByTag } = await import('@/lib/tagHelpers');
    const articles = await getArticlesByTag(supabase, tagSlug, limit);
    return (articles || []).map((article: any) => ({
      ...article,
      // normalize preview image key to preview_image expected by components
      preview_image:
        article.previewImage || article.preview_image || extractFirstImage(article.content),
    }));
  } catch (e) {
    console.error(`Ошибка при получении статей с тегом "${tagSlug}" через helper:`, e);
    return [];
  }
}

export default function Home() {
  return (
    <main className="min-h-screen flex flex-col justify-center items-center bg-white text-black">
      {/* HERO SECTION */}
      <section className="flex flex-col items-center justify-center flex-1 w-full">
        <div className="flex flex-col items-center justify-center">
          {/* Heart Symbol */}
          <span
            aria-label="Heart Symbol"
            className="text-[7rem] md:text-[10rem] select-none"
            style={{ fontFamily: 'serif', lineHeight: 1 }}
          >
            ❤️
          </span>
          {/* Tagline */}
          <h1
            className="mt-6 text-center text-3xl md:text-5xl font-serif font-bold tracking-wide leading-tight"
            style={{
              fontFamily: 'Playfair Display, Times New Roman, serif',
              letterSpacing: '0.04em',
            }}
          >
            Love is a key for all.
          </h1>
          {/* Subtext */}
          <div
            className="mt-2 text-center text-xs md:text-sm font-mono text-gray-500 tracking-widest uppercase"
            style={{ fontFamily: 'Roboto Mono, Courier New, monospace', letterSpacing: '0.12em' }}
          >
            Unframed by Merkurov
          </div>
        </div>
      </section>

      {/* MANIFESTO */}
      <section className="w-full max-w-2xl mx-auto mt-10 mb-8 px-4">
        <div
          className="text-center md:text-justify text-base md:text-lg font-mono text-gray-800 leading-loose tracking-wide"
          style={{ fontFamily: 'Roboto Mono, Courier New, monospace', letterSpacing: '0.04em' }}
        >
          <p className="mb-6">
            I spent 20 years building digital networks. Now I build human connections.
            <br />
            I traded complexity for truth. My art is a return to the fundamental source code of
            humanity. No politics, no borders, no social burden. Just the raw, unfiltered
            transmission of empathy.
            <br />
            Love is necessary. Love is never enough.
          </p>
        </div>
      </section>

      {/* NAVIGATION - THE THREE PILLARS */}
      <nav className="w-full max-w-2xl mx-auto flex flex-col gap-8 mb-16 px-4">
        <ul className="flex flex-col gap-8">
          <li>
            <a href="/heartandangel" className="block text-center">
              <span
                className="text-2xl md:text-4xl font-serif font-bold tracking-wide leading-tight border-b-2 border-black pb-1 hover:opacity-80 transition"
                style={{
                  fontFamily: 'Playfair Display, Times New Roman, serif',
                  letterSpacing: '0.04em',
                }}
              >
                [ ART ]
              </span>
              <div
                className="mt-2 text-sm md:text-base font-mono text-gray-600 tracking-widest"
                style={{
                  fontFamily: 'Roboto Mono, Courier New, monospace',
                  letterSpacing: '0.08em',
                }}
              >
                Heart & Angel. The digital ritual.
              </div>
            </a>
          </li>
          <li>
            <a href="/advising" className="block text-center">
              <span
                className="text-2xl md:text-4xl font-serif font-bold tracking-wide leading-tight border-b-2 border-black pb-1 hover:opacity-80 transition"
                style={{
                  fontFamily: 'Playfair Display, Times New Roman, serif',
                  letterSpacing: '0.04em',
                }}
              >
                [ ADVISING ]
              </span>
              <div
                className="mt-2 text-sm md:text-base font-mono text-gray-600 tracking-widest"
                style={{
                  fontFamily: 'Roboto Mono, Courier New, monospace',
                  letterSpacing: '0.08em',
                }}
              >
                Silence & Clarity. Private art acquisition.
              </div>
            </a>
          </li>
          <li>
            <a href="/articles" className="block text-center">
              <span
                className="text-2xl md:text-4xl font-serif font-bold tracking-wide leading-tight border-b-2 border-black pb-1 hover:opacity-80 transition"
                style={{
                  fontFamily: 'Playfair Display, Times New Roman, serif',
                  letterSpacing: '0.04em',
                }}
              >
                [ SELECTION ]
              </span>
              <div
                className="mt-2 text-sm md:text-base font-mono text-gray-600 tracking-widest"
                style={{
                  fontFamily: 'Roboto Mono, Courier New, monospace',
                  letterSpacing: '0.08em',
                }}
              >
                Curated works. Buffet & Non-conformists.
              </div>
            </a>
          </li>
        </ul>
      </nav>

      {/* MINIMAL FOOTER */}
      <footer
        className="w-full text-center py-8 text-xs text-gray-500 font-mono tracking-widest border-t border-gray-200"
        style={{ fontFamily: 'Roboto Mono, Courier New, monospace', letterSpacing: '0.08em' }}
      >
        © 2025 Anton Merkurov
      </footer>
    </main>
  );
}
