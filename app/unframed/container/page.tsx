import Image from 'next/image';
import Link from 'next/link';
import { ArrowUpRight, BookOpen, Lock, Play } from 'lucide-react';
import { Inter, Playfair_Display, Space_Mono } from 'next/font/google';
import EpisodeSeriesNav from '@/components/unframed/EpisodeSeriesNav';
import { CONTAINER_EPISODE, SPECTRAL_TIGER_EPISODE } from '@/lib/unframed/episodes';
import { GRAIN_BACKGROUND } from '@/lib/unframed/visual';

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

const episode = CONTAINER_EPISODE;
const previousEpisode = SPECTRAL_TIGER_EPISODE;

const sectionLabel = 'font-mono text-[10px] uppercase tracking-[0.32em] text-zinc-500';

export default function ContainerEpisodePage() {
  return (
    <div
      className={`min-h-screen bg-[#050505] text-white selection:bg-sky-300 selection:text-black ${sans.variable} ${mono.variable} ${serif.variable}`}
    >
      {/* GLOBAL GRAIN — same treatment as the rest of the UNFRAMED surfaces. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-50 opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage: GRAIN_BACKGROUND,
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
                UNFRAMED // Episode {episode.number}
              </p>
              <p className="font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-600">
                {episode.seriesLabel}
              </p>
            </div>

            <div className="mt-10 grid gap-10 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-9">
                <h1>
                  <span className="block text-[clamp(3.5rem,13vw,11.5rem)] font-black uppercase leading-[0.78] tracking-[-0.07em] text-zinc-100">
                    Unframed
                  </span>
                  <span className="mt-6 block font-mono text-[10px] uppercase tracking-[0.42em] text-sky-300 sm:text-xs">
                    {'// Episode '}
                    {episode.number}
                  </span>
                  <span className="mt-3 block max-w-5xl text-[clamp(2.15rem,6.4vw,6rem)] font-black uppercase leading-[0.88] tracking-[-0.045em] text-white">
                    {episode.title}
                  </span>
                </h1>
              </div>

              <dl className="grid grid-cols-2 gap-6 border-t border-zinc-800 pt-5 font-mono text-[10px] uppercase tracking-[0.24em] lg:col-span-3 lg:grid-cols-1 lg:border-t-0 lg:pt-0">
                <div>
                  <dt className="text-zinc-700">Runtime</dt>
                  <dd className="mt-2 text-zinc-300">{episode.runtime}</dd>
                </div>
                <div>
                  <dt className="text-zinc-700">Format</dt>
                  <dd className="mt-2 text-zinc-300">{episode.format}</dd>
                </div>
              </dl>
            </div>

            <p className="mt-10 max-w-2xl border-l-2 border-sky-400/70 pl-5 font-serif text-lg leading-relaxed text-zinc-400 sm:pl-6 sm:text-xl">
              {episode.tagline}
            </p>
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
                Official transmission
              </p>
            </div>

            <div className="relative aspect-video w-full overflow-hidden bg-black">
              <iframe
                className="absolute inset-0 h-full w-full"
                src={episode.video.url}
                title={episode.video.title}
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                referrerPolicy="strict-origin-when-cross-origin"
                allowFullScreen
              />
            </div>
          </div>
        </section>

        {/* =====================================================
            02 — THE THESIS
        ===================================================== */}
        <section aria-labelledby="thesis-heading" className="px-5 py-24 sm:px-8 md:py-36 lg:px-12">
          <div className="mx-auto grid max-w-7xl gap-10 border-y border-zinc-800 py-14 md:py-20 lg:grid-cols-12">
            <div className="lg:col-span-3">
              <h2 id="thesis-heading" className={sectionLabel}>
                02 / The Thesis
              </h2>

              <div aria-hidden="true" className="mt-8 h-px w-16 bg-sky-400/70" />
            </div>

            <div className="lg:col-span-9">
              <blockquote className="max-w-5xl">
                <p className="font-serif text-[clamp(2rem,4.7vw,4.4rem)] leading-[1.08] tracking-[-0.015em] text-zinc-100">
                  “{episode.statement}”
                </p>
              </blockquote>
            </div>
          </div>
        </section>

        {/* A quiet series bridge, placed inside the reading flow rather than
            appended as a generic button at the bottom of the page. */}
        <EpisodeSeriesNav
          direction="Previous transmission"
          title={`Episode ${previousEpisode.number} — ${previousEpisode.title}`}
          meta="2008 / World of Warcraft"
          href={`/unframed/${previousEpisode.slug}`}
        />

        {/* =====================================================
            03 — EXCERPT FROM THE BOOK
        ===================================================== */}
        <section
          aria-labelledby="excerpt-heading"
          className="px-5 pb-24 pt-24 sm:px-8 md:pb-36 md:pt-36 lg:px-12"
        >
          <div className="mx-auto grid max-w-7xl gap-12 border-t border-zinc-800 pt-10 md:pt-14 lg:grid-cols-12">
            <aside className="lg:col-span-3 lg:sticky lg:top-28 lg:self-start">
              <h2 className={sectionLabel}>03 / Excerpt from the Book</h2>

              <dl className="mt-8 space-y-5 font-mono text-[10px] uppercase leading-relaxed tracking-[0.22em] text-zinc-600">
                <div>
                  <dt className="text-zinc-700">Source</dt>
                  <dd className="mt-1 text-zinc-400">UNFRAMED</dd>
                </div>
                <div>
                  <dt className="text-zinc-700">Chapter</dt>
                  <dd className="mt-1 text-zinc-400">{episode.chapter.label}</dd>
                </div>
                <div>
                  <dt className="text-zinc-700">Section</dt>
                  <dd className="mt-1 text-zinc-400">Part I — The Granite and the Glitch</dd>
                </div>
              </dl>

              <div aria-hidden="true" className="mt-10 h-px w-16 bg-sky-400/70" />
            </aside>

            <div className="lg:col-span-9 lg:pl-4">
              <div className="max-w-[70ch]">
                <h3
                  id="excerpt-heading"
                  className="text-[clamp(2.9rem,7.6vw,6.8rem)] font-black uppercase leading-[0.84] tracking-[-0.055em] text-white"
                >
                  The Digital
                  <br />
                  Awakening
                </h3>

                <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-zinc-600">
                  Chapter 06 — A continuous excerpt
                </p>

                <div className="mt-14 space-y-7 font-serif text-[1.08rem] leading-[1.78] text-zinc-300 sm:text-[1.18rem] md:text-[1.24rem]">
                  {episode.chapter.paragraphs.map((paragraph, index) => (
                    <p
                      key={index}
                      className={
                        index === 0
                          ? 'text-zinc-200 first-letter:float-left first-letter:mr-3 first-letter:font-serif first-letter:text-[4.5rem] first-letter:leading-[0.78] first-letter:text-sky-200'
                          : index === episode.chapter.paragraphs.length - 1
                            ? 'text-zinc-100'
                            : undefined
                      }
                    >
                      {paragraph}
                    </p>
                  ))}
                </div>

                <p className="mt-14 border-t border-zinc-800 pt-6 font-mono text-[10px] uppercase leading-relaxed tracking-[0.22em] text-zinc-600">
                  {episode.chapter.sourceLine}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* =====================================================
            04 — ACQUIRE THE BOOK
        ===================================================== */}
        <section aria-labelledby="book-heading" className="px-5 pb-24 sm:px-8 md:pb-36 lg:px-12">
          <div className="mx-auto grid max-w-7xl gap-12 border-t border-zinc-800 pt-10 md:gap-16 md:pt-14 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <Link
                href={episode.book.url}
                aria-label="Read UNFRAMED in the private reader"
                className="group relative block aspect-[9/16] w-full max-w-sm overflow-hidden border border-zinc-800 bg-zinc-950"
              >
                <Image
                  src={episode.image}
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
                    Private reader
                  </p>
                  <p className="mt-2 font-serif text-2xl leading-none text-white">UNFRAMED</p>
                  <p className="mt-2 font-mono text-[9px] uppercase tracking-[0.22em] text-zinc-400">
                    A memoir by Anton Merkurov
                  </p>
                </div>
              </Link>
            </div>

            <div className="flex flex-col justify-between lg:col-span-7">
              <div>
                <p className={sectionLabel}>04 / Acquire the Book</p>

                <h2
                  id="book-heading"
                  className="mt-10 text-[clamp(2.6rem,7vw,6.6rem)] font-black uppercase leading-[0.84] tracking-[-0.055em] text-white"
                >
                  Read the
                  <br />
                  full book
                </h2>

                <p className="mt-8 font-serif text-2xl leading-relaxed text-zinc-400 sm:text-3xl">
                  The complete manuscript is available in the private UNFRAMED reader.
                </p>
              </div>

              <div className="mt-12 md:mt-16">
                <Link
                  href={episode.book.url}
                  className="group inline-flex min-h-14 items-center justify-between gap-8 border border-zinc-700 px-6 py-4 font-mono text-[10px] uppercase tracking-[0.26em] text-zinc-200 transition-colors duration-300 hover:border-sky-300 hover:text-white sm:px-8"
                >
                  <span className="flex items-center gap-3">
                    <BookOpen size={15} aria-hidden="true" />
                    Enter the private reader
                  </span>
                  <ArrowUpRight
                    size={16}
                    aria-hidden="true"
                    className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
                  />
                </Link>

                <p className="mt-5 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.24em] text-zinc-600">
                  <Lock size={11} aria-hidden="true" />
                  {episode.book.meta}
                </p>
              </div>
            </div>
          </div>
        </section>

        <footer className="px-5 pb-16 sm:px-8 lg:px-12">
          <div className="mx-auto flex max-w-7xl flex-col gap-3 border-t border-zinc-900 pt-6 font-mono text-[9px] uppercase tracking-[0.24em] text-zinc-700 sm:flex-row sm:items-center sm:justify-between">
            <Link href="/unframed" className="transition-colors hover:text-zinc-400">
              UNFRAMED // Series index
            </Link>
            <span>Anton Merkurov © 2026</span>
          </div>
        </footer>
      </article>
    </div>
  );
}
