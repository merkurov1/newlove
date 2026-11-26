import type { ReactNode } from 'react';
import Link from 'next/link';
import SectionLanguageSwitcher from '@/components/i18n/SectionLanguageSwitcher';
import IssueMaterials from './IssueMaterials';
import JournalArchiveList from './JournalArchiveList';
import type { FlowEntry, FrontIssue } from './types';
import type { JournalMaterial } from '@/lib/journal/issue';
import { materialHref } from '@/lib/journal/issue';
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
      <h2 className="max-w-2xl break-words font-serif text-[clamp(1.75rem,3vw,2.5rem)] font-normal leading-[1.05] tracking-tight text-[#1D1B18]">
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

function LedgerRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={`grid grid-cols-[6.5rem_1fr] gap-3 border-t ${rule} py-3`}>
      <dt className={kicker}>{label}</dt>
      <dd className="min-w-0 font-serif text-[15px] leading-relaxed text-[#3C3934]">{value}</dd>
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
  const lead = issue.lead || issue.excerpt;
  const editorialSummary = issue.editorialSummary || '';
  const breakdown = issue.typeCounts
    ? (['note', 'link', 'article', 'video', 'photo', 'other'] as const)
        .filter((kind) => Number(issue.typeCounts?.[kind]) > 0)
        .map((kind) => `${copy.inside.types[kind]} ${issue.typeCounts?.[kind]}`)
        .join(', ')
    : issue.summary;
  const leadHref = leadMaterial ? materialHref(leadMaterial.url) : null;

  return (
    <article aria-labelledby="current-issue-title" className="pt-5 md:pt-7">
      <div className={`grid border-t border-[#1D1B18] lg:grid-cols-[minmax(0,1fr)_19rem]`}>
        <div className="min-w-0 py-9 lg:py-12 lg:pr-12">
          <div className={`${kicker} flex flex-wrap items-center gap-x-3 gap-y-1`}>
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

          <h2
            id="current-issue-title"
            lang={issue.lang}
            className="mt-7 max-w-[15ch] break-words text-balance font-serif text-[clamp(2.75rem,7.2vw,6.4rem)] font-normal leading-[0.93] tracking-[-0.035em] text-[#1D1B18] sm:max-w-[18ch]"
          >
            {issue.headline}
          </h2>

          <div className="mt-8 grid gap-x-10 gap-y-7 md:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]">
            <div className="min-w-0">
              {editorialSummary && (
                <p
                  lang={issue.lang}
                  className="max-w-[38rem] break-words font-serif text-[clamp(1.35rem,2.2vw,1.85rem)] font-normal italic leading-[1.35] text-[#3C3934]"
                >
                  {editorialSummary}
                </p>
              )}

              {lead && (
                <>
                  <p className={`${kicker} mt-7`}>{copy.featured.leadLabel}</p>
                  <div
                    lang={issue.lang}
                    className="mt-2 max-w-[40rem] break-words whitespace-pre-line font-serif text-[17px] leading-[1.75] text-[#4B4741] md:text-[18px]"
                  >
                    {lead}
                  </div>
                </>
              )}
            </div>

            <div className="flex min-w-0 flex-col items-start gap-5 md:pt-1">
              <Link
                href={journalIssueHref(issue.lang, issue.slug)}
                className="inline-flex items-baseline gap-2 border-b border-[#1D1B18] pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#1D1B18] transition-colors hover:border-[#7A2233] hover:text-[#7A2233]"
              >
                {copy.featured.read} →
              </Link>

              {leadHref && <MaterialAction href={leadHref}>{copy.inside.open} ↗</MaterialAction>}

              {counterpart && (
                <span className="flex max-w-[18rem] flex-wrap items-baseline gap-x-2 gap-y-1 font-mono text-[9px] uppercase leading-5 tracking-[0.14em] text-[#6F6A60]">
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
          </div>
        </div>

        <aside
          aria-label={copy.featured.ariaLabel}
          className={`mt-0 min-w-0 border-t ${rule} py-7 lg:border-l lg:border-t-0 lg:pl-9 lg:py-12`}
        >
          <div className="flex items-start justify-between gap-4">
            <p className={kicker}>{copy.featured.issue}</p>
            {issue.number != null && (
              <p className="font-serif text-[clamp(3.5rem,6vw,5.75rem)] font-normal leading-none tracking-[-0.04em] text-[#7A2233]">
                №{issue.number}
              </p>
            )}
          </div>

          <dl className="mt-5">
            {when && (
              <LedgerRow
                label={copy.featured.periodLabel}
                value={<time dateTime={issue.periodStart || undefined}>{when}</time>}
              />
            )}
            <LedgerRow
              label={copy.featured.originalLanguage}
              value={
                <span
                  lang={issue.lang}
                  className="font-mono text-[11px] uppercase tracking-[0.12em]"
                >
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

      {leadMaterial?.image && (
        <figure className={`border-t ${rule} pt-4`}>
          <img
            src={leadMaterial.image}
            alt={leadMaterial.imageAlt || leadMaterial.title}
            loading="eager"
            className="aspect-[16/9] w-full object-cover"
          />
          <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 font-mono text-[9px] uppercase tracking-[0.14em] text-[#6F6A60]">
            <span>{leadMaterial.siteName || copy.inside.lead}</span>
            {leadMaterial.publishedAt && (
              <time dateTime={leadMaterial.publishedAt}>
                {dateLong(leadMaterial.publishedAt, uiLang)}
              </time>
            )}
          </figcaption>
        </figure>
      )}
    </article>
  );
}

function EmptyFeature({ uiLang }: { uiLang: JournalLanguage }) {
  const copy = JOURNAL_COPY[uiLang];

  return (
    <article className="border-t border-[#1D1B18] py-14">
      <p className={kicker}>{copy.featured.currentEdition}</p>
      <p className="mt-6 max-w-xl font-serif text-4xl italic leading-tight text-[#6F6A60]">
        {copy.featured.emptyTitle}
      </p>
      <p className="mt-4 max-w-md font-serif text-[16px] leading-relaxed text-[#6F6A60]">
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

  const leadMaterial = materials.find((material) => material.isLead) || null;

  // The stored issue headline is built from the lead material. When both are
  // the same story, the cover already presents it and the contents must not
  // repeat the same block. A legacy payload whose lead title differs keeps the
  // material in the contents so no published item disappears.
  const leadInCover = Boolean(
    leadMaterial && leadMaterial.title.trim() === (featured?.headline || '').trim()
  );
  const coverLeadMaterial = leadInCover ? leadMaterial : null;
  const secondaryMaterials =
    leadMaterial && leadInCover
      ? materials.filter((material) => material.id !== leadMaterial.id)
      : materials;

  return (
    <div
      lang={lang}
      className="mx-auto min-w-0 max-w-[1440px] px-5 pb-24 pt-28 sm:px-8 sm:pt-32 lg:px-12 lg:pt-36"
    >
      <header className={`border-b ${rule} pb-7`}>
        <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
          <div className="min-w-0">
            <p className={`font-mono text-[10px] uppercase tracking-[0.24em] ${accent}`}>
              {copy.masthead.kicker}
            </p>
            <h1 className="mt-2 break-words font-serif text-[clamp(3.5rem,10vw,8rem)] font-normal leading-[0.88] tracking-[-0.04em] text-[#1D1B18]">
              {copy.masthead.title}
            </h1>
          </div>
          <div className="flex max-w-sm flex-col items-start gap-4 md:items-end">
            <p className="max-w-sm font-serif text-base italic leading-relaxed text-[#5B5651] md:text-right">
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
        className={`flex flex-wrap gap-x-7 gap-y-2 border-b ${rule} py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#6F6A60]`}
      >
        <a href="#issues" className="transition-colors hover:text-[#7A2233]">
          {copy.nav.issues}
        </a>
        <a href="#contents" className="transition-colors hover:text-[#7A2233]">
          {copy.nav.contents}
        </a>
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
        <section id="issues" aria-label={copy.featured.currentEdition} className="pb-12">
          {featured && featured.slug ? (
            <IssueCover
              issue={featured}
              counterpart={counterpart}
              leadMaterial={coverLeadMaterial}
              uiLang={lang}
            />
          ) : (
            <EmptyFeature uiLang={lang} />
          )}
        </section>

        {(featured?.slug || materials.length > 0) && (
          <IssueMaterials
            materials={secondaryMaterials}
            lang={lang}
            hasLead={leadInCover}
            leadKind={leadInCover && leadMaterial ? leadMaterial.kind : null}
          />
        )}

        <section id="stream" className={`border-b ${rule} py-12`}>
          <SectionHead title={copy.flow.title} href="/flow" hrefLabel={copy.flow.cta} />

          {flow.length === 0 ? (
            <p className="py-6 font-serif italic text-[#6F6A60]">{copy.flow.empty}</p>
          ) : (
            <ul className={`mt-2 grid divide-y ${rule} md:grid-cols-2 md:divide-y-0`}>
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
                    <Link href={href} className="group grid grid-cols-[78px_1fr] gap-4 py-4">
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
                          className="mt-1 block break-words font-serif text-lg leading-snug text-[#1D1B18] transition-colors group-hover:text-[#7A2233]"
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

        <section id="archive" className={`border-b ${rule} py-12`}>
          <SectionHead
            title={copy.archive.title}
            note={copy.archive.previewNote}
            href={journalArchiveHref(lang)}
            hrefLabel={copy.archive.cta}
          />
          <div className="mt-2">
            <JournalArchiveList issues={previewArchive} lang={lang} limit={4} />
          </div>
        </section>

        <section id="subscribe" className="py-12">
          <div
            className={`grid gap-8 border-y border-[#1D1B18] py-10 md:grid-cols-[0.9fr_1.1fr] md:items-start md:gap-14`}
          >
            <div>
              <p className={kicker}>{copy.subscribe.kicker}</p>
              <h2 className="mt-3 max-w-md font-serif text-[clamp(2rem,3.2vw,2.75rem)] font-normal leading-[1.02] text-[#1D1B18]">
                {copy.subscribe.title}
              </h2>
              <p className="mt-4 max-w-md font-serif text-[15px] leading-relaxed text-[#5B5651]">
                {copy.subscribe.body}
              </p>
            </div>
            <div>
              <p className="max-w-md font-serif text-[clamp(1.35rem,2.2vw,1.75rem)] italic leading-snug text-[#3C3934]">
                {copy.subscribe.quote}
              </p>
              <div className="mt-6 max-w-md">{subscribe}</div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
