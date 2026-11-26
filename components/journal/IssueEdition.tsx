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

const kicker = 'font-mono text-[10px] uppercase tracking-[0.16em] text-[#6F6A60]';
const micro = 'font-mono text-[9px] uppercase tracking-[0.14em] text-[#6F6A60]';
const rule = 'border-[#D8D2C4]';
const accent = 'text-[#7A2233]';

function materialBody(material: JournalMaterial): string {
  return material.description || material.body;
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

function IssueRail({
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
        .join(', ')
    : issue.summary;

  return (
    <header className="grid border-b border-[#1D1B18] lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.44fr)]">
      <div className="min-w-0 px-5 py-5 sm:px-7 sm:py-6 lg:px-8">
        <h2 id="current-issue-heading" className="min-w-0">
          <span className={`block ${kicker} ${accent}`}>{copy.featured.currentEdition}</span>
          <span className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <span className="font-serif text-[clamp(3.25rem,7vw,5.75rem)] font-normal leading-[0.8] tracking-[-0.055em] text-[#1D1B18]">
              {issue.number != null ? (
                <>
                  <span className="sr-only">{copy.featured.issue} </span>№{issue.number}
                </>
              ) : (
                copy.featured.issue
              )}
            </span>
            {issue.published != null && (
              <span className={`${kicker} pb-1 text-[#3C3934]`}>
                {itemCountLabel(issue.published, uiLang)}
              </span>
            )}
          </span>
        </h2>
        {breakdown && <p className={`${micro} mt-3 break-words text-[#3C3934]`}>{breakdown}</p>}
      </div>

      <div className="grid grid-cols-2 gap-x-6 gap-y-4 border-t border-[#D8D2C4] px-5 py-5 sm:px-7 lg:grid-cols-1 lg:border-l lg:border-t-0 lg:px-8 lg:py-6">
        {when && (
          <div className="min-w-0">
            <p className={micro}>{copy.featured.periodLabel}</p>
            <time
              dateTime={issue.periodStart || issue.publishedAt || undefined}
              className="mt-1 block font-serif text-[15px] leading-snug text-[#1D1B18]"
            >
              {when}
            </time>
          </div>
        )}

        <div className="min-w-0">
          <p className={micro}>{copy.featured.originalLanguage}</p>
          <p lang={issue.lang} className="mt-1 font-serif text-[15px] leading-snug text-[#1D1B18]">
            {copy.languages[issue.lang]}
          </p>
        </div>

        {counterpart && (
          <div className="col-span-2 min-w-0 sm:col-span-1 lg:col-span-1">
            <p className={micro}>{copy.featured.otherEdition}</p>
            <Link
              href={journalIssueHref(counterpart.lang, counterpart.slug)}
              hrefLang={counterpart.lang}
              aria-label={`${copy.featured.otherEdition}: ${copy.languages[counterpart.lang]}`}
              className="mt-1 inline-flex items-baseline gap-2 border-b border-[#A39A8C] pb-0.5 font-serif text-[15px] leading-snug text-[#3C3934] transition-colors hover:border-[#7A2233] hover:text-[#7A2233]"
            >
              <span lang={counterpart.lang}>{copy.languages[counterpart.lang]}</span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

function MainMaterial({
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
      className="grid border-b border-[#1D1B18] lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.85fr)]"
    >
      <div className="min-w-0 px-5 pb-6 pt-5 sm:px-7 sm:pb-8 sm:pt-6 lg:px-8 lg:pb-9">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 border-t-2 border-[#7A2233] pt-3">
          <p className={`${kicker} ${accent}`}>
            <span aria-hidden="true">01 / </span>
            <span>{copy.featured.mainStory}</span>
          </p>
          {leadMaterial?.siteName && (
            <p className={`${micro} max-w-[20rem] truncate text-[#6F6A60]`}>
              {leadMaterial.siteName}
            </p>
          )}
        </div>

        <h3
          id="current-issue-title"
          lang={titleLang}
          className="mt-4 max-w-[20ch] break-words text-balance font-serif text-[clamp(2rem,4.2vw,3.5rem)] font-normal leading-[0.98] tracking-[-0.03em] text-[#1D1B18]"
        >
          {headline}
        </h3>

        {editorialSummary && (
          <p
            lang={issue.lang}
            className="mt-4 max-w-[38rem] break-words font-serif text-[clamp(1.05rem,1.6vw,1.35rem)] font-normal italic leading-snug text-[#3C3934]"
          >
            {editorialSummary}
          </p>
        )}

        {body && (
          <div className="mt-4 max-w-[42rem]">
            <p className={`${micro} mb-1`}>{copy.featured.leadLabel}</p>
            <p
              lang={titleLang}
              className="line-clamp-4 break-words font-serif text-[16px] leading-[1.7] text-[#4B4741] md:text-[17px]"
            >
              {body}
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center gap-x-6 gap-y-3">
          {leadHref && <MaterialAction href={leadHref}>{copy.inside.open} ↗</MaterialAction>}
          <Link
            href="#contents"
            className="inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#6F6A60] transition-colors hover:text-[#7A2233]"
          >
            {copy.inside.selectedTitle}
            <span aria-hidden="true">↓</span>
          </Link>
        </div>
      </div>

      {image && (
        <figure className="flex min-w-0 flex-col border-t border-[#D8D2C4] lg:border-l lg:border-t-0">
          <div className="relative flex-1 overflow-hidden bg-[#E7E0D5]">
            <img
              src={image}
              alt={leadMaterial?.imageAlt || headline}
              loading="eager"
              className="aspect-[16/10] h-full w-full object-cover"
            />
          </div>
          <figcaption className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-[#D8D2C4] px-4 py-3 font-mono text-[9px] uppercase tracking-[0.12em] text-[#6F6A60]">
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

function SelectionMedia({
  material,
  format,
  copy,
}: {
  material: JournalMaterial;
  format: ReturnType<typeof journalFormat>;
  copy: (typeof JOURNAL_COPY)[JournalLanguage];
}) {
  if (format === 'post') return null;

  if (format === 'link') {
    return (
      <span
        aria-hidden="true"
        className="flex h-14 w-14 shrink-0 items-center justify-center border border-[#1D1B18] font-serif text-[22px] leading-none text-[#1D1B18] transition-colors group-hover:border-[#7A2233] group-hover:text-[#7A2233] sm:h-16 sm:w-16"
      >
        ↗
      </span>
    );
  }

  if (format === 'photo') {
    return material.image ? (
      <img
        src={material.image}
        alt={material.imageAlt || material.title}
        loading="lazy"
        className="aspect-[4/5] w-24 shrink-0 object-cover sm:w-28 lg:w-32"
      />
    ) : (
      <span
        aria-hidden="true"
        className="flex aspect-[4/5] w-24 shrink-0 items-center justify-center border border-[#D8D2C4] font-mono text-[9px] uppercase tracking-[0.14em] text-[#6F6A60] sm:w-28 lg:w-32"
      >
        {copy.inside.formats.photo}
      </span>
    );
  }

  return (
    <span className="relative block w-40 shrink-0 overflow-hidden bg-[#E7E0D5] sm:w-48 lg:w-52">
      {material.image ? (
        <img
          src={material.image}
          alt={material.imageAlt || material.title}
          loading="lazy"
          className="aspect-video w-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex aspect-video w-full items-center justify-center border border-[#D8D2C4] font-mono text-[9px] uppercase tracking-[0.14em] text-[#6F6A60]"
        >
          {copy.inside.formats.video}
        </span>
      )}
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center bg-black/10"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#F5F2EB]/90 pl-0.5 text-[11px] text-[#1D1B18] shadow-sm">
          ▶
        </span>
      </span>
    </span>
  );
}

function SelectionRow({
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
  const body = materialBody(material);
  const title =
    normalizeJournalTitle(material.title, { siteName: material.siteName }) ||
    copy.inside.formats[format];
  const kindLabel = copy.inside.types[material.kind] || copy.inside.types.other;
  const when = dateLong(material.publishedAt, lang);
  const href = materialHref(material.url);
  const titleSize =
    format === 'post'
      ? 'text-[clamp(1.35rem,2.2vw,1.9rem)]'
      : 'text-[clamp(1.15rem,1.7vw,1.45rem)]';

  return (
    <li
      className={`group border-t ${rule}`}
      data-material-kind={material.kind}
      data-material-format={format}
      data-material-id={material.id}
    >
      <MaterialLink
        material={material}
        className="grid grid-cols-[2rem_minmax(0,1fr)] gap-x-4 py-5 sm:grid-cols-[2.5rem_minmax(0,1fr)] sm:gap-x-6 lg:py-6"
      >
        <span className={`${micro} pt-0.5 text-[#7A2233]`}>{String(index).padStart(2, '0')}</span>

        <span className="min-w-0">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className={`${micro} ${accent}`}>{kindLabel}</span>
            {material.siteName && (
              <span className={`${micro} min-w-0 max-w-[18rem] truncate`}>{material.siteName}</span>
            )}
          </span>

          <span className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0 flex-1">
              <span
                lang={material.lang === 'other' ? undefined : material.lang}
                className={`block break-words font-serif font-normal leading-snug tracking-tight text-[#1D1B18] transition-colors group-hover:text-[#7A2233] ${titleSize}`}
              >
                {title}
              </span>

              {body && (
                <span
                  lang={material.lang === 'other' ? undefined : material.lang}
                  className="mt-1.5 line-clamp-2 block break-words font-serif text-[14px] leading-relaxed text-[#5B5651]"
                >
                  {body}
                </span>
              )}

              <span className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.12em] text-[#6F6A60]">
                {when && <time dateTime={material.publishedAt || undefined}>{when}</time>}
                {when && <span aria-hidden="true">·</span>}
                <span>{copy.languages[material.lang]}</span>
                {href && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="text-[#3C3934]">{copy.inside.open}</span>
                    <span aria-hidden="true">{href.startsWith('/') ? '→' : '↗'}</span>
                  </>
                )}
              </span>
            </span>

            <SelectionMedia material={material} format={format} copy={copy} />
          </span>
        </span>
      </MaterialLink>
    </li>
  );
}

function EmptyIssue({ uiLang }: { uiLang: JournalLanguage }) {
  const copy = JOURNAL_COPY[uiLang];

  return (
    <section id="issues" aria-labelledby="current-issue-heading" className="pt-6">
      <div className="border border-[#1D1B18] bg-[#FBF8F2] px-5 py-7 sm:px-7 sm:py-8 lg:px-8">
        <h2 id="current-issue-heading" className="max-w-2xl">
          <span className={`block ${kicker} ${accent}`}>{copy.featured.currentEdition}</span>
          <span className="mt-4 block font-serif text-[clamp(1.75rem,3vw,2.5rem)] italic leading-tight text-[#6F6A60]">
            {copy.featured.emptyTitle}
          </span>
        </h2>
        <p className="mt-3 max-w-md font-serif text-[16px] leading-relaxed text-[#6F6A60]">
          {copy.featured.emptyBody}
        </p>
      </div>
    </section>
  );
}

/**
 * The current issue as one editorial object: issue identity, leading story,
 * selected materials and the full-issue action share one frame and one
 * numbered rhythm. It never invents a story, image or issue number; missing
 * data falls back to the localized empty states.
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
    <section id="issues" aria-labelledby="current-issue-heading" className="pt-6">
      <div className="border border-[#1D1B18] bg-[#FBF8F2]">
        <IssueRail issue={issue} counterpart={counterpart} uiLang={lang} />
        <MainMaterial issue={issue} leadMaterial={main} uiLang={lang} />

        <section
          id="contents"
          aria-labelledby="issue-contents-title"
          className="border-b border-[#1D1B18] px-5 py-6 sm:px-7 sm:py-7 lg:px-8 lg:py-8"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
            <div className="min-w-0">
              <p className={`${kicker} ${accent}`}>{copy.inside.kicker}</p>
              <h3
                id="issue-contents-title"
                className="mt-1 font-serif text-[clamp(1.6rem,2.6vw,2.15rem)] font-normal leading-tight tracking-tight text-[#1D1B18]"
              >
                {copy.inside.selectedTitle}
              </h3>
            </div>
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
            <ul className="mt-5">
              {supporting.map((material, index) => (
                <SelectionRow
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
            className="group flex flex-col gap-4 bg-[#1D1B18] px-5 py-5 text-[#F5F2EB] transition-colors hover:bg-[#7A2233] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7A2233] sm:flex-row sm:items-center sm:justify-between sm:px-7 lg:px-8"
          >
            <span className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-4">
              <span className="font-mono text-[9px] uppercase tracking-[0.18em] text-[#D8D2C4]">
                {copy.featured.issue}
                {issue.number != null ? ` №${issue.number}` : ''}
              </span>
              <span className="break-words font-serif text-[clamp(1.4rem,2.4vw,2rem)] leading-tight">
                {copy.featured.read}
              </span>
            </span>
            <span className="flex items-center justify-between gap-6 sm:justify-start">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[#D8D2C4]">
                {fullIssueCount}
              </span>
              <span
                aria-hidden="true"
                className="font-serif text-[24px] leading-none transition-transform group-hover:translate-x-1"
              >
                →
              </span>
            </span>
          </Link>
        )}
      </div>
    </section>
  );
}
