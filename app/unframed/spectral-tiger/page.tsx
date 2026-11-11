import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, BookOpen, Play } from 'lucide-react';
import { Inter, Playfair_Display, Space_Mono } from 'next/font/google';

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
});

const serif = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
});

const mono = Space_Mono({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-mono',
});

const APPLE_BOOKS_URL = 'https://books.apple.com/gb/book/unframed/id6792809614';

const TIGER_ARTWORK =
  'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Prompt_a_translucent_202512051450.jpeg';

/**
 * The Spectral Tiger passage is published from the manuscript source at
 * app/unframed/Unframed.markdown (Chapter 14: The London Shuttle, 2008).
 * Wording is intentionally verbatim; do not rewrite or expand it.
 */
const CHAPTER_PARAGRAPHS = [
  '2008 was the year the world cracked. The subprime mortgage bubble burst, banks collapsed, and the global economy became a live autopsy. At RBC, the mood was grim. We were cutting budgets, firing staff, and writing reports about the end of capitalism. I had an escape route. Every evening, I would take off my suit, turn off the news, and log into a better jurisdiction: World of Warcraft.',
  "Azeroth wasn't just a game. It was a perfect behavioral model. In the real world, the rules were messy. You could work hard and still get fired. The logic was broken. In WoW, the logic was absolute. If you wanted routine, you did daily quests. For teamwork and politics, you went on a Raid. For pure capitalism, you played the market at the Auction House. It was a clean system: effort equaled reward. For a mind tired of corporate schizophrenia, it was therapy.",
  "Then I found the ultimate asset: The Spectral Tiger. It came from a loot code in a physical card game. It was rare and expensive. Crucially, the Tiger gave you no actual advantage. It wasn't faster than a standard horse. It didn't add stamina or strength. Its utility was exactly zero. Its only function was Status.",
  'I bought it on eBay for $500. In 2008, spending five hundred dollars on a digital cat was considered insanity. You could buy a used car or a lot of vodka for that money. I made the transaction without hesitation.',
  "I did it to stand in Ironforge, the main hub for the Alliance. I would summon the Tiger and just park in the center of the main square. I stood there doing absolutely nothing. Other players would run past, stop, and look. They knew the price and they knew the rarity. It was the digital equivalent of parking a yellow Ferrari on Red Square. You don't drive it to get groceries; you drive it to show that you can.",
  "While the real economy was burning outside my window, I sat on my glowing ghost tiger, radiating success. That account likely still exists on Blizzard's servers. The password is lost and the email is forgotten, but the Tiger is still there in the code. Eternal, useless, and beautiful. It was my first real lesson in the modern economy: Utility is for the poor. The real markup is always on the Air.",
  "The account with the Spectral Tiger is likely still alive somewhere in the database. Of course, since it's no longer tied to a physical card, its market value has dropped. But as an asset, it served its purpose. It taught me that in a collapsing economy, a digital ghost can be more stable than a bank account. It was a proof of concept for everything that would happen ten years later.",
] as const;

const sectionLabel = 'font-mono text-[10px] uppercase tracking-[0.32em] text-zinc-500';

export default function SpectralTigerPage() {
  return (
    <div
      className={`min-h-screen bg-[#050505] text-white selection:bg-sky-300 selection:text-black ${sans.variable} ${mono.variable} ${serif.variable}`}
    >
      {/* GLOBAL GRAIN — same treatment as the UNFRAMED landing page. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage: 'url("https://grainy-gradients.vercel.app/noise.svg")',
        }}
      />

      <article className="relative">
        {/* =====================================================
            MASTHEAD
        ===================================================== */}
        <header className="px-5 pb-14 pt-28 sm:px-8 md:pb-20 md:pt-36 lg:px-12">
          <div className="mx-auto max-w-7xl">
            <div className="flex flex-col gap-3 border-b border-zinc-800 pb-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-mono text-[10px] uppercase tracking-[0.32em] text-sky-300">
                UNFRAMED // Episode 0
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-600">
                A proposed six-part docuseries
              </p>
            </div>

            <h1 className="mt-10">
              <span className="block text-[clamp(3.5rem,13vw,11.5rem)] font-black uppercase leading-[0.78] tracking-[-0.07em] text-zinc-100">
                Unframed
              </span>
              <span className="mt-6 block font-mono text-[10px] uppercase tracking-[0.42em] text-sky-300 sm:text-xs">
                // Episode 0
              </span>
              <span className="mt-3 block max-w-5xl text-[clamp(2.15rem,6.4vw,6rem)] font-black uppercase leading-[0.88] tracking-[-0.045em] text-white">
                The Spectral Tiger
              </span>
            </h1>

            <div className="mt-10 flex max-w-2xl flex-col gap-4 border-l-2 border-sky-400/70 pl-5 sm:pl-6">
              <p className="font-serif text-lg leading-relaxed text-zinc-400 sm:text-xl">
                A cinematic teaser and a chapter from the memoir by Anton Merkurov.
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-600">
                2008 / World of Warcraft / $500
              </p>
            </div>
          </div>
        </header>

        {/* =====================================================
            01 — THE SIGNAL
        ===================================================== */}
        <section aria-labelledby="signal-heading" className="px-0 sm:px-8 lg:px-12">
          <div className="mx-auto max-w-[1600px]">
            <div className="flex items-center justify-between gap-4 px-5 pb-4 sm:px-0">
              <h2 id="signal-heading" className={sectionLabel}>
                01 / The Signal
              </h2>
              <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-600">
                <Play size={10} aria-hidden="true" />
                Official teaser
              </p>
            </div>

            <div className="relative aspect-video w-full overflow-hidden bg-black">
              <iframe
                className="absolute inset-0 h-full w-full"
                src="https://www.youtube.com/embed/VojUgJmk5I0?rel=0&playsinline=1"
                title="UNFRAMED // Episode 0: The Spectral Tiger — official teaser"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>
        </section>

        {/* =====================================================
            02 — THE STATEMENT
        ===================================================== */}
        <section
          aria-labelledby="statement-heading"
          className="px-5 py-24 sm:px-8 md:py-36 lg:px-12"
        >
          <div className="mx-auto max-w-6xl border-y border-zinc-800 py-14 md:py-20">
            <h2 id="statement-heading" className={sectionLabel}>
              02 / The Statement
            </h2>

            <p className="mt-10 max-w-5xl font-serif text-[clamp(2rem,4.7vw,4.4rem)] leading-[1.08] tracking-[-0.015em] text-zinc-100">
              Episode 0 is a short teaser for UNFRAMED — an upcoming 6-part docuseries on digital
              status, virtual sovereignty, and the illusion of physical boundaries.
            </p>

            <p className="mt-10 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-600">
              Proposed series · Not yet commissioned
            </p>
          </div>
        </section>

        {/* =====================================================
            03 — THE CASE
        ===================================================== */}
        <section aria-labelledby="case-heading" className="px-5 pb-24 sm:px-8 md:pb-36 lg:px-12">
          <div className="mx-auto grid max-w-7xl gap-12 border-t border-zinc-800 pt-10 md:pt-14 lg:grid-cols-12">
            <aside className="lg:col-span-3 lg:sticky lg:top-28 lg:self-start">
              <h2 className={sectionLabel}>03 / The Case</h2>

              <dl className="mt-8 space-y-5 font-mono text-[10px] uppercase leading-relaxed tracking-[0.22em] text-zinc-600">
                <div>
                  <dt className="text-zinc-700">Source</dt>
                  <dd className="mt-1 text-zinc-400">UNFRAMED</dd>
                </div>
                <div>
                  <dt className="text-zinc-700">Chapter</dt>
                  <dd className="mt-1 text-zinc-400">14 — The London Shuttle</dd>
                </div>
                <div>
                  <dt className="text-zinc-700">Year</dt>
                  <dd className="mt-1 text-zinc-400">2008</dd>
                </div>
                <div>
                  <dt className="text-zinc-700">Object</dt>
                  <dd className="mt-1 text-zinc-400">Spectral Tiger</dd>
                </div>
              </dl>

              <div aria-hidden="true" className="mt-10 h-px w-16 bg-sky-400/70" />
            </aside>

            <div className="lg:col-span-9 lg:pl-4">
              <div className="max-w-[70ch]">
                <h3
                  id="case-heading"
                  className="text-[clamp(2.9rem,7.6vw,6.8rem)] font-black uppercase leading-[0.84] tracking-[-0.055em] text-white"
                >
                  The Spectral
                  <br />
                  Tiger
                </h3>

                <blockquote className="mt-10 border-l-2 border-sky-400/70 pl-5 sm:mt-12 sm:pl-6">
                  <p className="font-serif text-[clamp(1.35rem,2.5vw,2rem)] italic leading-[1.45] text-sky-100">
                    “Utility is for the poor. The highest markup on the market is always reserved
                    for the air.”
                  </p>
                </blockquote>

                <div className="mt-14 space-y-7 font-serif text-[1.08rem] leading-[1.78] text-zinc-300 sm:text-[1.18rem] md:text-[1.24rem]">
                  {CHAPTER_PARAGRAPHS.map((paragraph, index) => (
                    <p key={index} className={index === 0 ? 'text-zinc-200' : undefined}>
                      {paragraph}
                    </p>
                  ))}
                </div>

                <p className="mt-14 border-t border-zinc-800 pt-6 font-mono text-[10px] uppercase leading-relaxed tracking-[0.22em] text-zinc-600">
                  Excerpted from UNFRAMED, Chapter 14: The London Shuttle. © Anton Merkurov.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* =====================================================
            04 — THE BOOK
        ===================================================== */}
        <section aria-labelledby="book-heading" className="px-5 pb-24 sm:px-8 md:pb-36 lg:px-12">
          <div className="mx-auto grid max-w-7xl gap-12 border-t border-zinc-800 pt-10 md:gap-16 md:pt-14 lg:grid-cols-12">
            <div className="flex flex-col justify-between lg:col-span-7">
              <div>
                <p className={sectionLabel}>04 / The Book</p>

                <h2
                  id="book-heading"
                  className="mt-10 text-[clamp(2.6rem,7vw,6.6rem)] font-black uppercase leading-[0.84] tracking-[-0.055em] text-white"
                >
                  Read the
                  <br />
                  full book
                </h2>

                <p className="mt-8 font-serif text-2xl leading-relaxed text-zinc-400 sm:text-3xl">
                  Available on Apple Books.
                </p>
              </div>

              <div className="mt-12 md:mt-16">
                <a
                  href={APPLE_BOOKS_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex min-h-14 items-center justify-between gap-8 border border-zinc-700 px-6 py-4 font-mono text-[10px] uppercase tracking-[0.26em] text-zinc-200 transition-colors duration-300 hover:border-sky-300 hover:text-white sm:px-8"
                >
                  <span className="flex items-center gap-3">
                    <BookOpen size={15} aria-hidden="true" />
                    Buy on Apple Books
                  </span>
                  <ArrowUpRight
                    size={16}
                    aria-hidden="true"
                    className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </a>

                <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-600">
                  £3.99 · English · 215 pages
                </p>
              </div>
            </div>

            <div className="lg:col-span-5">
              <a
                href={APPLE_BOOKS_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Buy UNFRAMED on Apple Books"
                className="group relative block aspect-[9/16] w-full max-w-sm overflow-hidden border border-zinc-800 bg-zinc-950 lg:ml-auto"
              >
                <Image
                  src={TIGER_ARTWORK}
                  alt="UNFRAMED — cover artwork"
                  fill
                  sizes="(max-width: 1024px) 100vw, 33vw"
                  className="object-cover grayscale-[45%] contrast-[1.05] transition-all duration-700 group-hover:scale-[1.015] group-hover:grayscale-0"
                />
                <div
                  aria-hidden="true"
                  className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/5 to-transparent"
                />
                <div className="absolute inset-x-0 bottom-0 p-5 sm:p-6">
                  <p className="font-mono text-[9px] uppercase tracking-[0.3em] text-sky-300">
                    Digital edition
                  </p>
                  <p className="mt-2 font-serif text-2xl leading-none text-white">UNFRAMED</p>
                  <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-400">
                    A memoir by Anton Merkurov
                  </p>
                </div>
              </a>
            </div>
          </div>
        </section>

        {/* =====================================================
            05 — THE SERIES
        ===================================================== */}
        <section aria-labelledby="series-heading" className="px-5 pb-20 sm:px-8 md:pb-28 lg:px-12">
          <div className="mx-auto grid max-w-7xl gap-10 border-t border-zinc-800 pt-10 md:pt-14 lg:grid-cols-12">
            <p className={`${sectionLabel} lg:col-span-3`}>05 / The Series</p>

            <div className="lg:col-span-9">
              <h2
                id="series-heading"
                className="text-[clamp(2.4rem,6.2vw,5.8rem)] font-black uppercase leading-[0.86] tracking-[-0.05em] text-white"
              >
                Partner &amp;
                <br />
                Producer Proposal
              </h2>

              <p className="mt-8 max-w-2xl font-serif text-xl leading-relaxed text-zinc-400 sm:text-2xl">
                Explore the pitch, technical workflow, and architecture of the 6-part series.
              </p>

              <Link
                href="/unframed/proposal"
                className="group mt-10 inline-flex min-h-14 items-center gap-4 border border-zinc-700 px-6 py-4 font-mono text-[10px] uppercase tracking-[0.26em] text-zinc-200 transition-colors duration-300 hover:border-sky-300 hover:text-white sm:mt-12 sm:px-8"
              >
                View the proposal
                <span
                  aria-hidden="true"
                  className="text-base transition-transform duration-300 group-hover:translate-x-1"
                >
                  →
                </span>
              </Link>
            </div>
          </div>
        </section>

        <footer className="px-5 pb-16 sm:px-8 lg:px-12">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 border-t border-zinc-900 pt-6 font-mono text-[9px] uppercase tracking-[0.24em] text-zinc-700 sm:flex-row sm:items-center sm:justify-between">
            <span>UNFRAMED // Episode 0: The Spectral Tiger</span>
            <span>Anton Merkurov © 2026</span>
          </div>
        </footer>
      </article>
    </div>
  );
}
