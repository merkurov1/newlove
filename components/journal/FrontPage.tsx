import type { ReactNode } from 'react';
import Link from 'next/link';
import SectionLanguageSwitcher from '@/components/i18n/SectionLanguageSwitcher';
import IssueEdition from './IssueEdition';
import JournalArchiveList from './JournalArchiveList';
import type { FlowEntry, FrontIssue } from './types';
import type { JournalMaterial } from '@/lib/journal/issue';
import { findIssueCounterpart, sortJournalIssues } from '@/lib/journal/archive';
import { stamp } from '@/lib/journal/format';
import { JOURNAL_COPY, journalArchiveHref, type JournalLanguage } from '@/lib/i18n/journal';

export type { FlowEntry, FrontIssue, Lang } from './types';

interface Props {
  lang: JournalLanguage;
  featured: FrontIssue | null;
  materials?: JournalMaterial[];
  flow: FlowEntry[];
  archive: FrontIssue[];
  subscribe: ReactNode;
}

const kicker = 'font-mono text-[10px] uppercase tracking-[0.18em] text-[#6F6A60]';
const micro = 'font-mono text-[9px] uppercase tracking-[0.14em] text-[#6F6A60]';
const accent = 'text-[#7A2233]';
const rule = 'border-[#D8D2C4]';

function SectionHead({
  title,
  note,
  href,
  hrefLabel,
}: {
  title: string;
  note?: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
      <h2 className="max-w-2xl break-words font-serif text-[clamp(1.7rem,2.8vw,2.3rem)] font-normal leading-tight tracking-tight text-[#1D1B18]">
        {title}
      </h2>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        {note && <p className={micro}>{note}</p>}
        {href && (
          <Link
            href={href}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#6F6A60] underline decoration-[#C9C2B4] underline-offset-4 transition-colors hover:text-[#7A2233] hover:decoration-[#7A2233]"
          >
            {hrefLabel} →
          </Link>
        )}
      </div>
    </div>
  );
}

export default function FrontPage({
  lang,
  featured,
  materials = [],
  flow,
  archive,
  subscribe,
}: Props) {
  const copy = JOURNAL_COPY[lang];
  const catalogue = sortJournalIssues([...(featured ? [featured] : []), ...archive]);
  const counterpart = featured
    ? findIssueCounterpart(featured, catalogue, featured.lang === 'en' ? 'ru' : 'en')
    : null;
  // The counterpart edition belongs to the current issue, not to the preview
  // archive. Keep it in the full archive, but do not repeat the same issue
  // period immediately below the cover.
  const previewArchive = counterpart
    ? archive.filter((issue) => String(issue.id) !== String(counterpart.id))
    : archive;

  const contentsVisible = Boolean(featured);

  return (
    <div
      lang={lang}
      className="mx-auto min-w-0 max-w-6xl px-5 pb-20 pt-24 font-sans antialiased sm:px-8 sm:pt-28 lg:px-12 lg:pt-32"
    >
      <header className={`border-b ${rule} pb-6`}>
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.52fr)] lg:items-end">
          <div className="min-w-0">
            <p className={`font-mono text-[10px] uppercase tracking-[0.24em] ${accent}`}>
              {copy.masthead.kicker}
            </p>
            <h1 className="mt-2 break-words font-serif text-[clamp(2.7rem,6.5vw,5.2rem)] font-normal leading-[0.88] tracking-[-0.04em] text-[#1D1B18]">
              {copy.masthead.title}
            </h1>
          </div>
          <div className="flex flex-col gap-4 lg:items-end">
            <p className="max-w-sm font-serif text-[15px] italic leading-relaxed text-[#5B5651] lg:text-right">
              {copy.masthead.description}
            </p>
            <SectionLanguageSwitcher
              section="journal"
              currentLang={lang}
              showDetectionHint={false}
            />
          </div>
        </div>
      </header>

      <nav
        aria-label={copy.nav.ariaLabel}
        className={`flex flex-wrap gap-x-3 gap-y-2 border-b ${rule} py-3 font-mono text-[9px] uppercase tracking-[0.1em] text-[#6F6A60] sm:gap-x-7 sm:text-[10px] sm:tracking-[0.18em]`}
      >
        <a href="#issues" className="transition-colors hover:text-[#7A2233]">
          {copy.nav.issues}
        </a>
        {contentsVisible && (
          <a href="#contents" className="transition-colors hover:text-[#7A2233]">
            {copy.nav.contents}
          </a>
        )}
        <a href="#stream" className="transition-colors hover:text-[#7A2233]">
          {copy.nav.stream}
        </a>
        <a href="#archive" className="transition-colors hover:text-[#7A2233]">
          {copy.nav.archive}
        </a>
        <a href="#subscribe" className="ml-auto transition-colors hover:text-[#7A2233]">
          {copy.nav.subscribe}
        </a>
      </nav>

      <main>
        <IssueEdition
          lang={lang}
          issue={featured}
          counterpart={counterpart}
          materials={materials}
        />

        <section id="stream" className={`mt-14 border-t border-[#1D1B18] pt-5 sm:mt-16`}>
          <div className="grid gap-6 lg:grid-cols-[minmax(0,0.32fr)_minmax(0,1fr)] lg:gap-12">
            <div>
              <h2 className="font-serif text-[clamp(1.7rem,2.8vw,2.3rem)] font-normal leading-tight tracking-tight text-[#1D1B18]">
                {copy.flow.title}
              </h2>
              <Link
                href="/flow"
                className="mt-2 inline-block font-mono text-[10px] uppercase tracking-[0.16em] text-[#6F6A60] underline decoration-[#C9C2B4] underline-offset-4 transition-colors hover:text-[#7A2233] hover:decoration-[#7A2233]"
              >
                {copy.flow.cta} →
              </Link>
            </div>

            {flow.length === 0 ? (
              <p className="max-w-xl py-2 font-serif italic text-[#6F6A60]">{copy.flow.empty}</p>
            ) : (
              <ul className="grid gap-x-10 md:grid-cols-2">
                {flow.slice(0, 4).map((entry) => {
                  const when = stamp(entry.at, lang);
                  const label = copy.flow.types[entry.type] || copy.flow.types.mixed;
                  const entryLanguage = copy.languages[entry.lang];
                  const href = entry.slug ? `/flow/${encodeURIComponent(entry.slug)}` : '/flow';

                  return (
                    <li
                      key={entry.id}
                      className={`border-t ${rule} first:border-t-0 md:first:border-t`}
                    >
                      <Link href={href} className="group grid grid-cols-[4.5rem_1fr] gap-4 py-4">
                        <span className="font-mono text-[9px] uppercase leading-5 tracking-[0.1em] text-[#6F6A60]">
                          {when.day}
                          <br />
                          {when.time}
                        </span>
                        <span className="min-w-0">
                          <span
                            lang={entry.lang}
                            className="block break-words font-serif text-[17px] leading-snug text-[#1D1B18] transition-colors group-hover:text-[#7A2233]"
                          >
                            {entry.text || label}
                          </span>
                          <span className={`${micro} mt-1 block text-[#3C3934]`}>
                            {label} · {entryLanguage}
                          </span>
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </section>

        <section id="archive" className={`mt-14 border-t border-[#1D1B18] pt-5 sm:mt-16`}>
          <SectionHead
            title={copy.archive.title}
            note={copy.archive.previewNote}
            href={journalArchiveHref(lang)}
            hrefLabel={copy.archive.cta}
          />
          <div className="mt-3">
            <JournalArchiveList issues={previewArchive} lang={lang} limit={4} />
          </div>
        </section>

        <section id="subscribe" className={`mt-14 border-t border-[#D8D2C4] pt-8 sm:mt-16`}>
          <div className="grid gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-start md:gap-12">
            <div>
              <p className={`${kicker} ${accent}`}>{copy.subscribe.kicker}</p>
              <h2 className="mt-2 max-w-md font-serif text-[clamp(1.75rem,2.8vw,2.35rem)] font-normal leading-[1.04] text-[#1D1B18]">
                {copy.subscribe.title}
              </h2>
              <p className="mt-3 max-w-md font-serif text-[15px] leading-relaxed text-[#5B5651]">
                {copy.subscribe.body}
              </p>
            </div>
            <div className="md:pt-1">
              <p className="max-w-md font-serif text-[clamp(1.2rem,2vw,1.55rem)] italic leading-snug text-[#3C3934]">
                {copy.subscribe.quote}
              </p>
              <div className="mt-5 max-w-md">{subscribe}</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
