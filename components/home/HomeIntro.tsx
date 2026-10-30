import Link from 'next/link';
import { ANCESTOR_NAME, PERSON_NAME, SITE_NAME } from '@/lib/seo';

/**
 * Server-rendered introduction for the homepage. It is intentionally visible
 * and typographically consistent with the hero — not a visually hidden SEO
 * block — so the first HTML response contains a readable statement of who the
 * site belongs to and where the main archives live.
 */
export function HomeIntro() {
  return (
    <section
      aria-labelledby="home-about-heading"
      className="w-full bg-[#FAF8F5] px-5 pb-16 pt-4 sm:px-12 sm:pb-24"
    >
      <div className="mx-auto max-w-5xl border-t border-zinc-900/10 pt-8 sm:pt-10">
        <div className="grid gap-8 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] sm:gap-12">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-500">
              About
            </p>
            <h2
              id="home-about-heading"
              className="mt-3 font-serif text-2xl font-normal leading-tight tracking-tight text-[#111111] sm:text-3xl"
            >
              {PERSON_NAME}
            </h2>
            <p className="mt-2 font-serif text-sm italic text-zinc-600">
              Digital strategist, art dealer and heritage architect.
            </p>
          </div>

          <div className="space-y-4 font-serif text-base leading-relaxed text-zinc-700 sm:text-lg">
            <p>
              {SITE_NAME} works where technology, culture and capital meet: advising founders and
              collectors, caring for the legacy of his great-grandfather, sculptor {ANCESTOR_NAME},
              and publishing on art, media and digital sovereignty.
            </p>
            <p>
              Start with the{' '}
              <Link className="underline underline-offset-4 decoration-zinc-400 hover:decoration-black" href="/heritage">
                Heritage Archive
              </Link>
              , read the{' '}
              <Link className="underline underline-offset-4 decoration-zinc-400 hover:decoration-black" href="/journal">
                Journal
              </Link>
              , or browse the{' '}
              <Link className="underline underline-offset-4 decoration-zinc-400 hover:decoration-black" href="/media">
                Media Archive
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
