import type { ReactNode } from 'react';
import Link from 'next/link';
import SectionLanguageSwitcher from '@/components/i18n/SectionLanguageSwitcher';
import IssueMaterials from './IssueMaterials';
import JournalArchiveList from './JournalArchiveList';
import type { FlowEntry, FrontIssue } from './types';
import type { JournalMaterial } from '@/lib/journal/issue';
import { findIssueCounterpart, sortJournalIssues } from '@/lib/journal/archive';
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

const kicker = 'font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500';

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
    <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2 border-t-2 border-neutral-900 pb-3 pt-3">
      <h2 className="font-serif text-2xl font-normal tracking-tight text-neutral-900">{title}</h2>
      <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1">
        {note && <p className={kicker}>{note}</p>}
        {href && (
          <Link
            href={href}
            className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:text-[#7A2233]"
          >
            {hrefLabel} →
          </Link>
        )}
      </div>
    </div>
  );
}

function LedgerRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] gap-3 border-t border-neutral-300 py-3">
      <dt className={kicker}>{label}</dt>
      <dd className="min-w-0 font-serif text-[15px] leading-relaxed text-neutral-800">{value}</dd>
    </div>
  );
}

function IssueFeature({
  issue,
  counterpart,
  uiLang,
}: {
  issue: FrontIssue;
  counterpart: FrontIssue | null;
  uiLang: JournalLanguage;
}) {
  const copy = JOURNAL_COPY[uiLang];
  const when =
    period(issue.periodStart, issue.periodEnd, uiLang) || dateLong(issue.publishedAt, uiLang);
  const lead = issue.lead || issue.excerpt;
  const editorialSummary = issue.editorialSummary || '';
  const breakdown = issue.typeCounts
    ? (['note', 'link', 'article', 'video', 'photo', 'other'] as const)
        .filter((kind) => Number(issue.typeCounts?.[kind]) > 0)
        .map((kind) => `${copy.inside.types[kind]} ${issue.typeCounts?.[kind]}`)
        .join(', ')
    : issue.summary;

  return (
    <article aria-labelledby="current-issue-title" className="pt-8 md:pt-10">
      <p className={`${kicker} flex flex-wrap items-center gap-x-2 gap-y-1`}>
        <span className="text-[#7A2233]">Flow</span>
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
            <span>{when}</span>
          </>
        )}
        <span aria-hidden="true">·</span>
        <span>
          {copy.featured.originalLanguage}: {copy.languages[issue.lang]}
        </span>
      </p>

      <h2
        id="current-issue-title"
        lang={issue.lang}
        className="mt-5 max-w-5xl break-words text-balance font-serif text-[2.6rem] font-normal leading-[1.02] tracking-[-0.02em] text-neutral-900 sm:text-5xl md:text-6xl lg:text-7xl"
      >
        {issue.headline}
      </h2>

      <div className="mt-9 grid gap-x-14 gap-y-9 lg:grid-cols-[1.65fr_1fr]">
        <div className="min-w-0">
          {editorialSummary && (
            <p
              lang={issue.lang}
              className="max-w-3xl font-serif text-[22px] font-normal italic leading-[1.45] text-neutral-800 md:text-[26px]"
            >
              {editorialSummary}
            </p>
          )}

          {lead && (
            <>
              <p className={`${kicker} mt-7`}>{copy.featured.leadLabel}</p>
              <div
                lang={issue.lang}
                className="mt-2 max-w-3xl whitespace-pre-line font-serif text-[17px] leading-8 text-neutral-700 md:text-[18px]"
              >
                {lead}
              </div>
            </>
          )}

          <div className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-3">
            <Link
              href={journalIssueHref(issue.lang, issue.slug)}
              className="inline-block border-b-2 border-neutral-900 pb-1 font-mono text-[11px] uppercase tracking-[0.16em] text-neutral-900 transition-colors hover:border-[#7A2233] hover:text-[#7A2233]"
            >
              {copy.featured.read} →
            </Link>

            {counterpart && (
              <span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-500">
                <span>{copy.featured.otherEdition}</span>
                <Link
                  href={journalIssueHref(counterpart.lang, counterpart.slug)}
                  hrefLang={counterpart.lang}
                  aria-label={`${copy.featured.otherEdition}: ${copy.languages[counterpart.lang]}`}
                  className="border-b border-neutral-400 pb-0.5 text-neutral-800 transition-colors hover:border-[#7A2233] hover:text-[#7A2233]"
                >
                  {copy.languages[counterpart.lang]} →
                </Link>
              </span>
            )}
          </div>
        </div>

        <aside
          aria-label={copy.featured.ariaLabel}
          className="min-w-0 border-t-2 border-neutral-900 pt-3"
        >
          <div className="flex items-start justify-between gap-4">
            <p className={kicker}>{copy.featured.issue}</p>
            <p className="font-serif text-5xl font-normal leading-none text-[#7A2233]">
              {issue.number != null ? `№${issue.number}` : '—'}
            </p>
          </div>

          <dl className="mt-5">
            <LedgerRow
              label={copy.featured.periodLabel}
              value={<time dateTime={issue.periodStart || undefined}>{when || '—'}</time>}
            />
            <LedgerRow
              label={copy.featured.originalLanguage}
              value={
                <span lang={issue.lang} className="font-mono text-[11px] uppercase tracking-[0.12em]">
                  {copy.languages[issue.lang]}
                </span>
              }
            />
            <LedgerRow
              label={copy.featured.materialsLabel}
              value={
                issue.published != null
                  ? itemCountLabel(issue.published, uiLang)
                  : copy.inside.empty
              }
            />
            {breakdown && <LedgerRow label={copy.featured.typesLabel} value={breakdown} />}
          </dl>
        </aside>
      </div>
    </article>
  );
}

function EmptyFeature({ uiLang }: { uiLang: JournalLanguage }) {
  const copy = JOURNAL_COPY[uiLang];

  return (
    <article className="py-12">
      <p className={kicker}>{copy.featured.currentEdition}</p>
      <p className="mt-6 max-w-xl font-serif text-3xl italic text-neutral-400">
        {copy.featured.emptyTitle}
      </p>
      <p className="mt-3 max-w-md font-serif text-[15px] leading-relaxed text-neutral-500">
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

  return (
    <div lang={lang} className="mx-auto max-w-6xl px-5 pb-24 pt-16 sm:px-8 md:pt-24">
      <header className="pb-7">
        <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
          <div className="min-w-0">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-[#7A2233]">
              {copy.masthead.kicker}
            </p>
            <h1 className="mt-2 font-serif text-5xl font-normal tracking-tight md:text-7xl">
              {copy.masthead.title}
            </h1>
          </div>
          <div className="flex max-w-sm flex-col items-start gap-3 md:items-end">
            <p className="font-serif text-base italic leading-relaxed text-neutral-600 md:text-right">
              {copy.masthead.description}
            </p>
            <SectionLanguageSwitcher section="journal" currentLang={lang} />
          </div>
        </div>
      </header>

      <nav
        aria-label={copy.nav.ariaLabel}
        className="flex flex-wrap gap-x-7 gap-y-2 border-y border-neutral-900 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600"
      >
        <a href="#issues" className="hover:text-[#7A2233]">
          {copy.nav.issues}
        </a>
        <a href="#contents" className="hover:text-[#7A2233]">
          {copy.nav.contents}
        </a>
        <a href="#stream" className="hover:text-[#7A2233]">
          {copy.nav.stream}
        </a>
        <a href="#archive" className="hover:text-[#7A2233]">
          {copy.nav.archive}
        </a>
        <a href="#subscribe" className="ml-auto hover:text-[#7A2233]">
          {copy.nav.subscribe}
        </a>
      </nav>

      <section
        id="issues"
        aria-label={copy.featured.currentEdition}
        className="border-b border-neutral-300 pb-12"
      >
        <p className={`${kicker} mt-6 text-[#7A2233]`}>{copy.featured.currentEdition}</p>
        {featured && featured.slug ? (
          <IssueFeature issue={featured} counterpart={counterpart} uiLang={lang} />
        ) : (
          <EmptyFeature uiLang={lang} />
        )}
      </section>

      {featured && featured.slug && <IssueMaterials materials={materials} lang={lang} />}

      <section id="stream" className="border-b border-neutral-300 py-12">
        <SectionHead title={copy.flow.title} href="/flow" hrefLabel={copy.flow.cta} />

        {flow.length === 0 ? (
          <p className="py-6 font-serif italic text-neutral-400">{copy.flow.empty}</p>
        ) : (
          <ul className="mt-2 grid gap-x-12 md:grid-cols-2">
            {flow.slice(0, 4).map((entry) => {
              const when = stamp(entry.at, lang);
              const label = copy.flow.types[entry.type] || copy.flow.types.mixed;
              const entryLanguage = copy.languages[entry.lang];
              const href = entry.slug ? `/flow/${encodeURIComponent(entry.slug)}` : '/flow';

              return (
                <li key={entry.id} className="border-t border-neutral-300">
                  <Link href={href} className="group grid grid-cols-[84px_1fr] gap-4 py-4">
                    <span className="font-mono text-[11px] leading-5 text-neutral-500">
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
                        className="mt-1 block font-serif text-lg leading-snug text-neutral-900 transition-colors group-hover:text-[#7A2233]"
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

      <section id="archive" className="border-b border-neutral-300 py-12">
        <SectionHead
          title={copy.archive.title}
          note={copy.archive.previewNote}
          href={journalArchiveHref(lang)}
          hrefLabel={copy.archive.cta}
        />
        <div className="mt-2">
          <JournalArchiveList issues={archive} lang={lang} limit={6} />
        </div>
      </section>

      <section id="subscribe" className="py-12">
        <div className="grid gap-8 border-y border-neutral-900 py-10 md:grid-cols-[0.9fr_1.1fr] md:items-start md:gap-14">
          <div>
            <p className={kicker}>{copy.subscribe.kicker}</p>
            <h2 className="mt-3 max-w-md font-serif text-3xl font-normal leading-tight text-neutral-900">
              {copy.subscribe.title}
            </h2>
            <p className="mt-4 max-w-md font-serif text-[15px] leading-relaxed text-neutral-600">
              {copy.subscribe.body}
            </p>
          </div>
          <div>
            <p className="max-w-md font-serif text-2xl italic leading-snug text-neutral-800">
              {copy.subscribe.quote}
            </p>
            <div className="mt-6 max-w-md">{subscribe}</div>
          </div>
        </div>
      </section>
    </div>
  );
}
