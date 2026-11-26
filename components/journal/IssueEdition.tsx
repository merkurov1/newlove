import type { ReactNode } from 'react';
import Link from 'next/link';
import { JOURNAL_COPY, journalIssueHref, type JournalLanguage } from '@/lib/i18n/journal';
import { materialHref, type JournalMaterial } from '@/lib/journal/issue';
import {
  journalFormat,
  normalizeJournalTitle,
  selectJournalHighlights,
} from '@/lib/journal/selection';
import { dateLong, items as itemCountLabel, period } from '@/lib/journal/format';
import type { FrontIssue } from './types';

type Props = {
  lang: JournalLanguage;
  issue: FrontIssue | null;
  counterpart: FrontIssue | null;
  materials: JournalMaterial[];
};

const kicker = 'font-mono text-[10px] uppercase tracking-[0.18em] text-[#6F6A60]';
const micro = 'font-mono text-[9px] uppercase tracking-[0.14em] text-[#6F6A60]';
const accent = 'text-[#7A2233]';

function materialBody(material: JournalMaterial): string {
  return material.description || material.body;
}

function languageMark(
  material: JournalMaterial,
  copy: (typeof JOURNAL_COPY)[JournalLanguage]
): string {
  if (material.lang === 'other') return copy.languages.other;
  return material.lang.toUpperCase();
}

function MaterialLink({
  material,
  children,
  className,
}: {
  material: JournalMaterial;
  children: ReactNode;
  className: string;
}) {
  const href = materialHref(material.url);

  if (!href) {
    return <div className={className}>{children}</div>;
  }

  if (href.startsWith('/')) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <a
      href={href}
      className={className}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={material.title || undefined}
    >
      {children}
    </a>
  );
}

function MainAction({ href, children }: { href: string; children: ReactNode }) {
  const className =
    'inline-flex items-baseline gap-2 border-b border-[#1D1B18] pb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-[#1D1B18] transition-colors hover:border-[#7A2233] hover:text-[#7A2233]';

  if (href.startsWith('/')) {
    return (
      <Link href={href} className={className}>
        {children}
      </Link>
    );
  }

  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

function IssueMasthead({
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
  const breakdown = issue.typeCounts
    ? (['note', 'link', 'article', 'video', 'photo', 'other'] as const)
        .filter((kind) => Number(issue.typeCounts?.[kind]) > 0)
        .map((kind) => `${copy.inside.types[kind]} ${issue.typeCounts?.[kind]}`)
        .join(' · ')
    : issue.summary;

  return (
    <header className="grid grid-cols-2 gap-x-6 gap-y-5 border-t-2 border-[#1D1B18] pt-4 sm:gap-x-10 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.75fr)_minmax(0,0.9fr)] lg:items-end">
      <h2 id="current-issue-heading" className="col-span-2 min-w-0 lg:col-span-1">
        <span className={`block ${kicker} ${accent}`}>{copy.featured.currentEdition}</span>
        <span className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="font-serif text-[clamp(2.35rem,4.4vw,3.5rem)] font-normal leading-[0.82] tracking-[-0.045em] text-[#1D1B18]">
            {issue.number != null ? (
              <>
                <span className="sr-only">{copy.featured.issue} </span>№{issue.number}
              </>
            ) : (
              copy.featured.issue
            )}
          </span>
          {issue.published != null && (
            <span className={`${micro} pb-1 text-[#3C3934]`}>
              {itemCountLabel(issue.published, uiLang)}
            </span>
          )}
        </span>
        {breakdown && (
          <span className={`${micro} mt-2 block max-w-sm break-words leading-relaxed`}>
            {breakdown}
          </span>
        )}
      </h2>

      {when && (
        <div className="min-w-0 self-start lg:self-end">
          <p className={micro}>{copy.featured.periodLabel}</p>
          <time
            dateTime={issue.periodStart || issue.publishedAt || undefined}
            className="mt-1 block max-w-[15rem] font-serif text-[16px] leading-snug text-[#1D1B18]"
          >
            {when}
          </time>
        </div>
      )}

      <div className="min-w-0 self-start lg:self-end">
        <p className={micro}>{copy.featured.originalLanguage}</p>
        <p lang={issue.lang} className="mt-1 font-serif text-[16px] leading-snug text-[#1D1B18]">
          {copy.languages[issue.lang]}
        </p>
        {counterpart && (
          <p className="mt-2 font-serif text-[14px] leading-snug text-[#6F6A60]">
            <Link
              href={journalIssueHref(counterpart.lang, counterpart.slug)}
              hrefLang={counterpart.lang}
              aria-label={`${copy.featured.otherEdition}: ${copy.languages[counterpart.lang]}`}
              className="border-b border-[#A39A8C] pb-0.5 transition-colors hover:border-[#7A2233] hover:text-[#7A2233]"
            >
              <span lang={counterpart.lang}>{copy.languages[counterpart.lang]}</span>
              <span aria-hidden="true"> →</span>
            </Link>
          </p>
        )}
      </div>
    </header>
  );
}

function Cover({
  issue,
  leadMaterial,
  uiLang,
}: {
  issue: FrontIssue;
  leadMaterial: JournalMaterial | null;
  uiLang: JournalLanguage;
}) {
  const copy = JOURNAL_COPY[uiLang];
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
  const leadHref = leadMaterial ? materialHref(leadMaterial.url) : null;
  const image = leadMaterial?.image;

  return (
    <div
      data-role="main-material"
      className={`mt-7 grid gap-x-10 gap-y-6 lg:mt-9 ${
        image ? 'lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)] lg:items-stretch' : ''
      }`}
    >
      <div className="flex min-w-0 flex-col justify-between">
        <div>
          <h3
            id="current-issue-title"
            lang={titleLang}
            className="max-w-[22ch] break-words text-balance font-serif text-[clamp(2.2rem,4.6vw,3.9rem)] font-normal leading-[0.96] tracking-[-0.035em] text-[#1D1B18]"
          >
            {headline}
          </h3>

          {editorialSummary && (
            <p
              lang={issue.lang}
              className="mt-4 max-w-[34rem] break-words font-serif text-[clamp(1.05rem,1.7vw,1.35rem)] font-normal italic leading-snug text-[#3C3934]"
            >
              {editorialSummary}
            </p>
          )}

          {body && (
            <p
              lang={titleLang}
              className="mt-4 line-clamp-4 max-w-[38rem] break-words font-serif text-[16px] leading-[1.7] text-[#4B4741] md:text-[17px]"
            >
              {body}
            </p>
          )}
        </div>

        <div className="mt-7 flex flex-wrap items-center gap-x-7 gap-y-3">
          {leadHref && <MainAction href={leadHref}>{copy.inside.open} ↗</MainAction>}
          {leadMaterial && (
            <span className={`${micro} text-[#3C3934]`}>{copy.featured.mainStory}</span>
          )}
        </div>
      </div>

      {image && (
        <figure className="flex min-w-0 flex-col">
          <div className="flex-1 overflow-hidden bg-[#E7E0D5]">
            <img
              src={image}
              alt={leadMaterial?.imageAlt || headline}
              loading="eager"
              className="aspect-[4/3] h-full w-full object-cover sm:aspect-[16/10] lg:aspect-auto"
            />
          </div>
          <figcaption className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#6F6A60]">
            <span>{leadMaterial?.siteName || copy.inside.lead}</span>
            {leadMaterial?.publishedAt && (
              <time dateTime={leadMaterial.publishedAt}>
                {dateLong(leadMaterial.publishedAt, uiLang)}
              </time>
            )}
          </figcaption>
        </figure>
      )}
    </div>
  );
}

function PlayMark() {
  return (
    <span
      aria-hidden="true"
      className="absolute inset-0 flex items-center justify-center bg-[#1D1B18]/5"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full border border-[#F5F2EB]/80 bg-[#F5F2EB]/90 pl-0.5 text-[11px] text-[#1D1B18] shadow-sm">
        ▶
      </span>
    </span>
  );
}

function SelectionItem({
  material,
  index,
  lang,
  copy,
}: {
  material: JournalMaterial;
  index: number;
  lang: JournalLanguage;
  copy: (typeof JOURNAL_COPY)[JournalLanguage];
}) {
  const format = journalFormat(material.kind);
  const title =
    normalizeJournalTitle(material.title, { siteName: material.siteName }) ||
    copy.inside.formats[format];
  const body = materialBody(material);
  const kindLabel = copy.inside.types[material.kind] || copy.inside.types.other;
  const when = dateLong(material.publishedAt, lang);
  const href = materialHref(material.url);
  const hasMedia = format === 'photo' || format === 'video';

  return (
    <li
      className="min-w-0 border-t border-[#1D1B18]"
      data-material-kind={material.kind}
      data-material-format={format}
      data-material-id={material.id}
    >
      <MaterialLink
        material={material}
        className="group grid gap-x-8 gap-y-4 py-7 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:py-8"
      >
        <div
          className={`${micro} flex flex-wrap items-baseline gap-x-3 gap-y-1 sm:flex-col sm:items-start sm:gap-y-1.5`}
        >
          <span className={`${accent} text-[10px]`}>
            <span className="sr-only">{index}. </span>
            {kindLabel}
          </span>
          {when && (
            <time dateTime={material.publishedAt || undefined} className="text-[#3C3934]">
              {when}
            </time>
          )}
          <span aria-label={copy.languages[material.lang]}>{languageMark(material, copy)}</span>
        </div>

        <div
          className={`min-w-0 ${
            hasMedia ? 'grid gap-x-8 gap-y-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center' : ''
          }`}
        >
          <div className="min-w-0">
            <h4
              lang={material.lang === 'other' ? undefined : material.lang}
              className={`break-words font-serif font-normal leading-snug tracking-tight text-[#1D1B18] transition-colors group-hover:text-[#7A2233] ${
                format === 'post'
                  ? 'text-[clamp(1.6rem,2.6vw,2.25rem)]'
                  : 'text-[clamp(1.3rem,2vw,1.7rem)]'
              }`}
            >
              {title}
              {href && (
                <span
                  aria-hidden="true"
                  className="ml-2 inline-block align-baseline font-sans text-[0.62em] text-[#6F6A60] transition-colors group-hover:text-[#7A2233]"
                >
                  {href.startsWith('/') ? '→' : '↗'}
                </span>
              )}
            </h4>

            {body && (
              <p
                lang={material.lang === 'other' ? undefined : material.lang}
                className="mt-2 line-clamp-3 max-w-2xl break-words font-serif text-[14px] leading-relaxed text-[#5B5651]"
              >
                {body}
              </p>
            )}

            {format === 'link' && material.siteName && (
              <span className={`${micro} mt-3 block text-[#3C3934]`}>{material.siteName}</span>
            )}
          </div>

          {format === 'photo' && material.image && (
            <img
              src={material.image}
              alt={material.imageAlt || title}
              loading="lazy"
              className="aspect-[4/5] w-full object-cover transition-transform duration-500 group-hover:scale-[1.015] sm:max-w-[18rem] lg:w-[15rem]"
            />
          )}

          {format === 'video' && (
            <span className="relative block w-full overflow-hidden bg-[#E7E0D5] lg:w-[22rem]">
              {material.image ? (
                <img
                  src={material.image}
                  alt={material.imageAlt || title}
                  loading="lazy"
                  className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-[1.015]"
                />
              ) : (
                <span className="flex aspect-video w-full items-center justify-center border border-[#D8D2C4] font-mono text-[9px] uppercase tracking-[0.14em] text-[#6F6A60]">
                  {copy.inside.formats.video}
                </span>
              )}
              <PlayMark />
            </span>
          )}
        </div>
      </MaterialLink>
    </li>
  );
}

function EmptyIssue({ uiLang }: { uiLang: JournalLanguage }) {
  const copy = JOURNAL_COPY[uiLang];

  return (
    <section id="issues" aria-labelledby="current-issue-heading" className="pt-7">
      <header className="border-t-2 border-[#1D1B18] pt-4">
        <h2 id="current-issue-heading" className="max-w-2xl">
          <span className={`block ${kicker} ${accent}`}>{copy.featured.currentEdition}</span>
          <span className="mt-4 block font-serif text-[clamp(1.9rem,3.2vw,2.7rem)] italic leading-tight text-[#6F6A60]">
            {copy.featured.emptyTitle}
          </span>
        </h2>
        <p className="mt-3 max-w-md font-serif text-[16px] leading-relaxed text-[#6F6A60]">
          {copy.featured.emptyBody}
        </p>
      </header>
    </section>
  );
}

/**
 * The current issue as an open editorial cover: issue identity, leading story,
 * selected materials and the full-issue invitation share one reading column and
 * one rhythm, without a surrounding card. It never invents a story, image or
 * issue number; missing data falls back to the localized empty states.
 */
export default function IssueEdition({ lang, issue, counterpart, materials }: Props) {
  const copy = JOURNAL_COPY[lang];

  if (!issue) return <EmptyIssue uiLang={lang} />;

  const { main, supporting } = selectJournalHighlights(materials);
  const count = supporting.length + (main ? 1 : 0);
  const fullIssueHref = issue.slug ? journalIssueHref(issue.lang, issue.slug) : null;
  const fullIssueCount =
    issue.published != null ? itemCountLabel(issue.published, lang) : itemCountLabel(count, lang);

  return (
    <section id="issues" aria-labelledby="current-issue-heading" className="pt-7 sm:pt-8">
      <IssueMasthead issue={issue} counterpart={counterpart} uiLang={lang} />
      <Cover issue={issue} leadMaterial={main} uiLang={lang} />

      <section
        id="contents"
        aria-labelledby="issue-contents-title"
        className="mt-12 border-t-2 border-[#1D1B18] pt-4 sm:mt-14"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-2">
          <h3
            id="issue-contents-title"
            className="font-serif text-[clamp(1.8rem,3vw,2.5rem)] font-normal leading-tight tracking-tight text-[#1D1B18]"
          >
            {copy.inside.selectedTitle}
          </h3>
          <p className={`${micro} text-[#3C3934]`}>{itemCountLabel(count, lang)}</p>
        </div>

        <p className="mt-2 max-w-xl font-serif text-[15px] leading-relaxed text-[#5B5651]">
          {copy.inside.selectedNote}
        </p>

        {supporting.length === 0 ? (
          <p className="mt-5 max-w-xl border-t border-[#D8D2C4] pt-4 font-serif text-[16px] italic text-[#6F6A60]">
            {main ? copy.inside.leadAbove : copy.inside.empty}
          </p>
        ) : (
          <ul className="mt-6">
            {supporting.map((material, index) => (
              <SelectionItem
                key={material.id}
                material={material}
                index={index + 2}
                lang={lang}
                copy={copy}
              />
            ))}
          </ul>
        )}
      </section>

      {fullIssueHref && (
        <Link
          id="full-issue"
          href={fullIssueHref}
          data-role="full-issue"
          className="group mt-10 flex flex-col gap-3 border-t border-[#1D1B18] pt-5 text-[#1D1B18] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#7A2233] sm:mt-12 sm:flex-row sm:items-end sm:justify-between"
        >
          <span className="min-w-0">
            <span className={`${micro} block text-[#6F6A60]`}>
              {copy.featured.issue}
              {issue.number != null ? ` №${issue.number}` : ''}
            </span>
            <span className="mt-1 block break-words font-serif text-[clamp(1.7rem,3vw,2.35rem)] leading-tight tracking-tight transition-colors group-hover:text-[#7A2233]">
              {copy.featured.read}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-5 pb-1">
            <span className={`${micro} text-[#3C3934]`}>{fullIssueCount}</span>
            <span
              aria-hidden="true"
              className="font-serif text-[clamp(1.6rem,2.4vw,2rem)] leading-none transition-transform group-hover:translate-x-1"
            >
              →
            </span>
          </span>
        </Link>
      )}
    </section>
  );
}
