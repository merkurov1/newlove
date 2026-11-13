import Link from 'next/link';

type EpisodeSeriesNavProps = {
  /** e.g. "Next transmission" or "Previous transmission". */
  direction: string;
  title: string;
  href: string;
  meta?: string;
  accentClassName?: string;
};

/**
 * A single editorial bridge between two UNFRAMED transmissions.
 *
 * It is deliberately a row, not a card grid: the series should read as one
 * authored publication, with the neighbouring episode and the series index
 * available without turning the page into a video catalogue.
 */
export default function EpisodeSeriesNav({
  direction,
  title,
  href,
  meta,
  accentClassName = 'text-sky-300',
}: EpisodeSeriesNavProps) {
  return (
    <nav aria-label="UNFRAMED series navigation" className="px-5 sm:px-8 lg:px-12">
      <div className="mx-auto max-w-7xl border-y border-zinc-800">
        <div className="grid gap-4 py-7 md:grid-cols-12 md:items-center">
          <p
            className={`font-mono text-[10px] uppercase tracking-[0.32em] ${accentClassName} md:col-span-3`}
          >
            {direction}
          </p>

          <Link href={href} className="group md:col-span-6">
            <span className="block font-serif text-xl leading-snug text-zinc-200 transition-colors duration-300 group-hover:text-white sm:text-2xl">
              {title}
            </span>
            {meta ? (
              <span className="mt-2 block font-mono text-[9px] uppercase tracking-[0.24em] text-zinc-600">
                {meta}
              </span>
            ) : null}
          </Link>

          <Link href="/unframed" className="group md:col-span-3 md:text-right">
            <span className="font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-600 transition-colors duration-300 group-hover:text-zinc-300">
              Series index <span aria-hidden="true">→</span>
            </span>
          </Link>
        </div>
      </div>
    </nav>
  );
}
