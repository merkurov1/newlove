import type { ReactNode } from 'react';
import Link from 'next/link';
import SectionLanguageSwitcher from '@/components/i18n/SectionLanguageSwitcher';
import IssueHighlights from './IssueHighlights';
import JournalArchiveList from './JournalArchiveList';
import type { FlowEntry, FrontIssue } from './types';
import type { JournalMaterial } from '@/lib/journal/issue';
import { materialHref } from '@/lib/journal/issue';
import { findIssueCounterpart, sortJournalIssues } from '@/lib/journal/archive';
import { normalizeJournalTitle, selectJournalHighlights } from '@/lib/journal/selection';
import { dateLong, items as itemCountLabel, period, stamp } from '@/lib/journal/format';
import {
  JOURNAL_COPY,
  journalArchiveHref,
  journalIssueHref,
  type JournalLanguage,
} from '@/lib/i18n/journal';

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
const rule = 'border-[#D8D2C4]';
const accent = 'text-[#7A2233]';

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
    <div
      className={`flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-t ${rule} pb-3 pt-4`}
    >
      <h2 className="max-w-2xl break-words font-serif text-[clamp(1.5rem,2.4vw,2rem)] font-normal leading-tight tracking-tight text-[#1D1B18]">
        {title}
      </h2>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        {note && <p className={kicker}>{note}</p>}
        {href && (
          <Link
            href={href}
            className="font-mono text-[10px] uppercase tracking-[0.16em] text-[#6F6A60] transition-colors hover:text-[#7A2233]"
          >
            {hrefLabel} →
          </Link>
        )}
      </div>
    </div>
  );
}

function MaterialAction({ href, children }: { href: string; children: ReactNode }) {
  if (href.startsWith('/')) {
    return (
      <Link
        href={href}
        className="inline-flex items-baseline gap-2 border-b border-[#1D1B18] pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#1D1B18] transition-colors hover:border-[#7A2233] hover:text-[#7A2233]"
      >
        {children}
      </Link>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-baseline gap-2 border-b border-[#1D1B18] pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#1D1B18] transition-colors hover:border-[#7A2233] hover:text-[#7A2233]"
    >
      {children}
    </a>
  );
}

function IssueCover({
  issue,
  counterpart,
  leadMaterial,
  uiLang,
}: {
  issue: FrontIssue;
  counterpart: FrontIssue | null;
  leadMaterial: JournalMaterial | null;
  uiLang: JournalLanguage;
}) {
  const copy = JOURNAL_COPY[uiLang];
  const when =
    period(issue.periodStart, issue.periodEnd, uiLang) || dateLong(issue.publishedAt, uiLang);
  const headline = normalizeJournalTitle(leadMaterial?.title || issue.headline, {
    siteName: leadMaterial?.siteName,
  });
  const titleLang = leadMaterial && leadMaterial.lang !== 'other' ? leadMaterial.lang : issue.lang;
  const body = (
    leadMaterial?.description ||
    leadMaterial?.body ||
    issue.lead ||
    issue.excerpt ||
    ''
  ).trim();
  const editorialSummary = issue.editorialSummary || '';
  const breakdown = issue.typeCounts
    ? (['note', 'link', 'article', 'video', 'photo', 'other'] as const)
        .filter((kind) => Number(issue.typeCounts?.[kind]) > 0)
        .map((kind) => `${copy.inside.types[kind]} ${issue.typeCounts?.[kind]}`)
        .join(', ')
    : issue.summary;
  const leadHref = leadMaterial ? materialHref(leadMaterial.url) : null;

  return (
    <article aria-labelledby="current-issue-title" className="pt-4 md:pt-5">
      <div
        className={`flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#1D1B18] pb-3 pt-3 ${kicker}`}
      >
        <span className={accent}>{copy.featured.currentEdition}</span>
        {issue.number ? (
          <>
            <span aria-hidden="true">·</span>
            <span>
              {copy.featured.issue} №{issue.number}
            </span>
          </>
        ) : null}
        {when && (
          <>
            <span aria-hidden="true">·</span>
            <time dateTime={issue.periodStart || issue.publishedAt || undefined}>{when}</time>
          </>
        )}
      </div>

      <div
        className={`grid gap-x-12 gap-y-7 pb-7 pt-5 ${
          leadMaterial?.image
            ? 'lg:grid-cols-[minmax(0,1.12fr)_minmax(0,0.88fr)] lg:items-start'
            : ''
        }`}
      >
        <div className="min-w-0" data-role="main-material">
          <p className={`${kicker} ${accent} mb-2`}>{copy.featured.mainStory}</p>
          <h2
            id="current-issue-title"
            lang={titleLang}
            className="max-w-[22ch] break-words text-balance font-serif text-[clamp(2rem,4.2vw,3.5rem)] font-normal leading-[0.98] tracking-[-0.025em] text-[#1D1B18]"
          >
            {headline}
          </h2>

          {editorialSummary && (
            <p
              lang={issue.lang}
              className="mt-4 max-w-[40rem] break-words font-serif text-[clamp(1.05rem,1.6vw,1.35rem)] font-normal italic leading-snug text-[#3C3934]"
            >
              {editorialSummary}
            </p>
          )}

          {body && (
            <div className="mt-4 max-w-[44rem]">
              <p className={`${kicker} mb-1`}>{copy.featured.leadLabel}</p>
              <p
                lang={titleLang}
                className="line-clamp-4 break-words font-serif text-[16px] leading-[1.7] text-[#4B4741] md:text-[17px]"
              >
                {body}
              </p>
            </div>
          )}

          <div className="mt-5 flex flex-wrap items-baseline gap-x-6 gap-y-3">
            {leadHref && <MaterialAction href={leadHref}>{copy.inside.open} ↗</MaterialAction>}

            {counterpart && (
              <span className="flex max-w-[20rem] flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[9px] uppercase leading-5 tracking-[0.14em] text-[#6F6A60]">
                <span>{copy.featured.otherEdition}</span>
                <Link
                  href={journalIssueHref(counterpart.lang, counterpart.slug)}
                  hrefLang={counterpart.lang}
                  aria-label={`${copy.featured.otherEdition}: ${copy.languages[counterpart.lang]}`}
                  className="border-b border-[#A39A8C] pb-0.5 text-[#3C3934] transition-colors hover:border-[#7A2233] hover:text-[#7A2233]"
                >
                  {copy.languages[counterpart.lang]} →
                </Link>
              </span>
            )}
          </div>

          <p className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1 border-t border-[#D8D2C4] pt-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[#6F6A60]">
            <span>
              {copy.featured.originalLanguage}:{' '}
              <span lang={issue.lang} className="text-[#3C3934]">
                {copy.languages[issue.lang]}
              </span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="text-[#3C3934]">
              {issue.published != null
                ? itemCountLabel(issue.published, uiLang)
                : copy.inside.empty}
            </span>
            {breakdown && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#3C3934]">{breakdown}</span>
              </>
            )}
          </p>
        </div>

        {leadMaterial?.image && (
          <figure className="min-w-0">
            <img
              src={leadMaterial.image}
              alt={leadMaterial.imageAlt || headline}
              loading="eager"
              className="aspect-[16/10] w-full object-cover"
            />
            <figcaption className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#6F6A60]">
              <span>{leadMaterial.siteName || copy.inside.lead}</span>
              {leadMaterial.publishedAt && (
                <time dateTime={leadMaterial.publishedAt}>
                  {dateLong(leadMaterial.publishedAt, uiLang)}
                </time>
              )}
            </figcaption>
          </figure>
        )}
      </div>
    </article>
  );
}

function EmptyFeature({ uiLang }: { uiLang: JournalLanguage }) {
  const copy = JOURNAL_COPY[uiLang];

  return (
    <article className="border-t border-[#1D1B18] py-10">
      <p className={kicker}>{copy.featured.currentEdition}</p>
      <p className="mt-4 max-w-xl font-serif text-3xl italic leading-tight text-[#6F6A60]">
        {copy.featured.emptyTitle}
      </p>
      <p className="mt-3 max-w-md font-serif text-[16px] leading-relaxed text-[#6F6A60]">
        {copy.featured.emptyBody}
      </p>
    </article>
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

  const { main, supporting } = selectJournalHighlights(materials);
  const contentsVisible = Boolean(featured?.slug || main || materials.length > 0);

  return (
    <div
      lang={lang}
      className="mx-auto min-w-0 max-w-[1440px] px-5 pb-20 pt-24 sm:px-8 sm:pt-28 lg:px-12 lg:pt-32"
    >
      <header className={`border-b ${rule} pb-5`}>
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-4">
          <div className="min-w-0">
            <p className={`font-mono text-[10px] uppercase tracking-[0.24em] ${accent}`}>
              {copy.masthead.kicker}
            </p>
            <h1 className="mt-1 break-words font-serif text-[clamp(2.5rem,6vw,4.75rem)] font-normal leading-[0.9] tracking-[-0.035em] text-[#1D1B18]">
              {copy.masthead.title}
            </h1>
          </div>
          <div className="flex max-w-sm flex-col items-start gap-3 md:items-end">
            <p className="max-w-sm font-serif text-[15px] italic leading-relaxed text-[#5B5651] md:text-right">
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
        className={`flex flex-wrap gap-x-7 gap-y-2 border-b ${rule} py-2.5 font-mono text-[10px] uppercase tracking-[0.18em] text-[#6F6A60]`}
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
        <section id="issues" aria-label={copy.featured.currentEdition} className="pb-8">
          {featured && featured.slug ? (
            <IssueCover
              issue={featured}
              counterpart={counterpart}
              leadMaterial={main}
              uiLang={lang}
            />
          ) : (
            <EmptyFeature uiLang={lang} />
          )}
        </section>

        {contentsVisible && (
          <IssueHighlights
            materials={supporting}
            lang={lang}
            hasMain={Boolean(main)}
            issueHref={featured?.slug ? journalIssueHref(featured.lang, featured.slug) : null}
            issueLabel={copy.featured.read}
          />
        )}

        <section id="stream" className={`border-b ${rule} py-8`}>
          <SectionHead title={copy.flow.title} href="/flow" hrefLabel={copy.flow.cta} />

          {flow.length === 0 ? (
            <p className="py-4 font-serif italic text-[#6F6A60]">{copy.flow.empty}</p>
          ) : (
            <ul className={`mt-1 grid divide-y ${rule} md:grid-cols-2 md:divide-y-0`}>
              {flow.slice(0, 4).map((entry) => {
                const when = stamp(entry.at, lang);
                const label = copy.flow.types[entry.type] || copy.flow.types.mixed;
                const entryLanguage = copy.languages[entry.lang];
                const href = entry.slug ? `/flow/${encodeURIComponent(entry.slug)}` : '/flow';

                return (
                  <li
                    key={entry.id}
                    className={`border-t ${rule} md:[&:nth-child(2n)]:border-l md:[&:nth-child(2n)]:pl-8`}
                  >
                    <Link href={href} className="group grid grid-cols-[72px_1fr] gap-4 py-3.5">
                      <span className="font-mono text-[10px] uppercase leading-5 tracking-[0.08em] text-[#6F6A60]">
                        {when.day}
                        <br />
                        {when.time}
                      </span>
                      <span className="min-w-0">
                        <span className={kicker}>
                          {label} · {entryLanguage}
                        </span>
                        <span
                          lang={entry.lang}
                          className="mt-1 block break-words font-serif text-[17px] leading-snug text-[#1D1B18] transition-colors group-hover:text-[#7A2233]"
                        >
                          {entry.text || label}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section id="archive" className={`border-b ${rule} py-8`}>
          <SectionHead
            title={copy.archive.title}
            note={copy.archive.previewNote}
            href={journalArchiveHref(lang)}
            hrefLabel={copy.archive.cta}
          />
          <div className="mt-1">
            <JournalArchiveList issues={previewArchive} lang={lang} limit={4} />
          </div>
        </section>

        <section id="subscribe" className="py-8">
          <div
            className={`grid gap-7 border-y border-[#1D1B18] py-8 md:grid-cols-[0.9fr_1.1fr] md:items-start md:gap-12`}
          >
            <div>
              <p className={kicker}>{copy.subscribe.kicker}</p>
              <h2 className="mt-2 max-w-md font-serif text-[clamp(1.75rem,2.8vw,2.35rem)] font-normal leading-[1.04] text-[#1D1B18]">
                {copy.subscribe.title}
              </h2>
              <p className="mt-3 max-w-md font-serif text-[15px] leading-relaxed text-[#5B5651]">
                {copy.subscribe.body}
              </p>
            </div>
            <div>
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
