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
    <main className="min-h-screen bg-white text-[#333]">
      <div className="max-w-[900px] mx-auto px-5 flex flex-col items-center">
        {/* Add whitespace between header and main block */}
        <div style={{ height: 100 }} />

        {/* NAVIGATION - THE THREE PILLARS */}
        <nav className="w-full flex flex-col gap-16 mb-32">
          <ul className="flex flex-col gap-16">
            {/* ART first */}
            <li>
              <a
                href="/heartandangel"
                className="block text-center no-underline hover:opacity-60 transition"
                style={{ textDecoration: 'none' }}
              >
                <span
                  className="block"
                  style={{
                    fontFamily: 'Cormorant Garamond, Playfair Display, serif',
                    fontSize: '4rem',
                    color: '#000',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.1,
                  }}
                >
                  [ ART ]
                </span>
                <div
                  className="mt-2"
                  style={{
                    fontFamily: 'Space Mono, Courier Prime, monospace',
                    color: '#000',
                    fontSize: 14,
                    letterSpacing: 1,
                  }}
                >
                  The digital ritual
                </div>
              </a>
            </li>
            {/* SELECTION second, link to /selection */}
            <li>
              <a
                href="/selection"
                className="block text-center no-underline hover:opacity-60 transition"
                style={{ textDecoration: 'none' }}
              >
                <span
                  className="block"
                  style={{
                    fontFamily: 'Cormorant Garamond, Playfair Display, serif',
                    fontSize: '4rem',
                    color: '#000',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.1,
                  }}
                >
                  [ SELECTION ]
                </span>
                <div
                  className="mt-2"
                  style={{
                    fontFamily: 'Space Mono, Courier Prime, monospace',
                    color: '#000',
                    fontSize: 14,
                    letterSpacing: 1,
                  }}
                >
                  Curated works. Buffet & Non-conformists.
                </div>
              </a>
            </li>
            {/* ADVISING third */}
            <li>
              <a
                href="/advising"
                className="block text-center no-underline hover:opacity-60 transition"
                style={{ textDecoration: 'none' }}
              >
                <span
                  className="block"
                  style={{
                    fontFamily: 'Cormorant Garamond, Playfair Display, serif',
                    fontSize: '4rem',
                    color: '#000',
                    letterSpacing: '-0.02em',
                    lineHeight: 1.1,
                  }}
                >
                  [ ADVISING ]
                </span>
                <div
                  className="mt-2"
                  style={{
                    fontFamily: 'Space Mono, Courier Prime, monospace',
                    color: '#000',
                    fontSize: 14,
                    letterSpacing: 1,
                  }}
                >
                  Private art acquisition
                </div>
              </a>
            </li>
          </ul>
        </nav>

        {/* MANIFESTO */}
        <section className="w-full" style={{ marginBottom: 120 }}>
          <div
            className="mx-auto"
            style={{
              maxWidth: 600,
              fontFamily: 'Space Mono, Courier Prime, monospace',
              color: '#222',
              fontSize: 14,
              lineHeight: 1.8,
              textAlign: 'center',
            }}
          >
            <p className="mb-6">
              <span style={{ textWrap: 'balance' }}>
                I spent 20 years building digital networks. Now I build human connections.
                <br />
                I traded complexity for truth. My art is a return to the fundamental source code of
                humanity. No politics, no borders, no social burden. Just the raw, unfiltered
                transmission of empathy.
                <br />
                Love is necessary. Love is never enough.
              </span>
            </p>
          </div>
        </section>

        {/* MINIMAL FOOTER */}
        <footer
          className="w-full text-center py-8 text-xs font-mono"
          style={{ fontFamily: 'Inter, Space Mono, monospace', color: '#333' }}
        >
          © 2025 Anton Merkurov. London — Nowhere.
        </footer>
      </div>
    </main>
  );
}
