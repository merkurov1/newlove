import type { ReactNode } from 'react';
import Link from 'next/link';
import { JOURNAL_COPY, type JournalLanguage } from '@/lib/i18n/journal';
import { materialHref, type JournalMaterial } from '@/lib/journal/issue';
import { journalFormat, normalizeJournalTitle, type JournalFormat } from '@/lib/journal/selection';
import { dateLong, items as itemCountLabel } from '@/lib/journal/format';

type Props = {
  materials: JournalMaterial[];
  lang: JournalLanguage;
  hasMain?: boolean;
  issueHref?: string | null;
  issueLabel?: string;
};

const kicker = 'font-mono text-[10px] uppercase tracking-[0.16em] text-[#6F6A60]';
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

function Meta({
  material,
  lang,
  copy,
}: {
  material: JournalMaterial;
  lang: JournalLanguage;
  copy: (typeof JOURNAL_COPY)[JournalLanguage];
}) {
  const when = dateLong(material.publishedAt, lang);

  return (
    <span className="mt-auto flex flex-wrap items-center gap-x-2 gap-y-1 pt-4 font-mono text-[9px] uppercase tracking-[0.12em] text-[#6F6A60]">
      {when && <time dateTime={material.publishedAt || undefined}>{when}</time>}
      {when && <span aria-hidden="true">·</span>}
      <span>{copy.languages[material.lang]}</span>
    </span>
  );
}

function FormatTitle({
  material,
  copy,
  format,
}: {
  material: JournalMaterial;
  copy: (typeof JOURNAL_COPY)[JournalLanguage];
  format: JournalFormat;
}) {
  const title = normalizeJournalTitle(material.title, { siteName: material.siteName });

  return (
    <h4
      lang={material.lang === 'other' ? undefined : material.lang}
      className="mt-2 break-words font-serif text-[clamp(1.15rem,1.5vw,1.35rem)] font-normal leading-snug tracking-tight text-[#1D1B18] transition-colors group-hover:text-[#7A2233]"
    >
      {title || copy.inside.formats[format]}
    </h4>
  );
}

function PostCard({
  material,
  copy,
  lang,
}: {
  material: JournalMaterial;
  copy: (typeof JOURNAL_COPY)[JournalLanguage];
  lang: JournalLanguage;
}) {
  const body = materialBody(material);

  return (
    <MaterialLink
      material={material}
      className="group flex h-full flex-col border-t-2 border-[#1D1B18] pb-1 pt-3"
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className={`${kicker} ${accent}`}>{copy.inside.formats.post}</span>
        <span className={kicker} aria-hidden="true">
          01
        </span>
      </span>

      <FormatTitle material={material} copy={copy} format="post" />

      {body && (
        <p
          lang={material.lang === 'other' ? undefined : material.lang}
          className="mt-2 line-clamp-4 break-words font-serif text-[14px] leading-relaxed text-[#5B5651]"
        >
          {body}
        </p>
      )}

      <Meta material={material} lang={lang} copy={copy} />
    </MaterialLink>
  );
}

function LinkCard({
  material,
  copy,
  lang,
}: {
  material: JournalMaterial;
  copy: (typeof JOURNAL_COPY)[JournalLanguage];
  lang: JournalLanguage;
}) {
  const body = materialBody(material);
  const source = material.siteName || copy.inside.formats.link;

  return (
    <MaterialLink
      material={material}
      className="group flex h-full flex-col border border-[#D8D2C4] bg-[#EFEAE0]/60 p-4 transition-colors hover:border-[#7A2233]"
    >
      <span className={`${kicker} flex items-baseline justify-between gap-3`}>
        <span>{copy.inside.formats.link}</span>
        <span
          lang={material.lang === 'other' ? undefined : material.lang}
          className="min-w-0 truncate"
        >
          {source}
        </span>
      </span>

      <FormatTitle material={material} copy={copy} format="link" />

      {body && (
        <p
          lang={material.lang === 'other' ? undefined : material.lang}
          className="mt-2 line-clamp-3 break-words font-serif text-[14px] leading-relaxed text-[#5B5651]"
        >
          {body}
        </p>
      )}

      <span className="mt-auto flex items-end justify-between gap-3">
        <Meta material={material} lang={lang} copy={copy} />
        <span
          aria-hidden="true"
          className="pb-1 font-mono text-[12px] text-[#1D1B18] transition-colors group-hover:text-[#7A2233]"
        >
          ↗
        </span>
      </span>
    </MaterialLink>
  );
}

function VideoCard({
  material,
  copy,
  lang,
}: {
  material: JournalMaterial;
  copy: (typeof JOURNAL_COPY)[JournalLanguage];
  lang: JournalLanguage;
}) {
  return (
    <MaterialLink material={material} className="group flex h-full flex-col">
      <span className="relative block overflow-hidden bg-[#E7E0D5]">
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
            className="flex aspect-video w-full items-center justify-center border border-[#D8D2C4] font-mono text-[10px] uppercase tracking-[0.18em] text-[#6F6A60]"
          >
            {copy.inside.formats.video}
          </span>
        )}
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-black/10"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#F5F2EB]/90 pl-0.5 text-[13px] text-[#1D1B18] shadow-sm">
            ▶
          </span>
        </span>
      </span>

      <span className={`${kicker} mt-3`}>{copy.inside.formats.video}</span>
      <FormatTitle material={material} copy={copy} format="video" />
      <Meta material={material} lang={lang} copy={copy} />
    </MaterialLink>
  );
}

function PhotoCard({
  material,
  copy,
  lang,
}: {
  material: JournalMaterial;
  copy: (typeof JOURNAL_COPY)[JournalLanguage];
  lang: JournalLanguage;
}) {
  return (
    <MaterialLink material={material} className="group flex h-full flex-col">
      {material.image ? (
        <img
          src={material.image}
          alt={material.imageAlt || material.title}
          loading="lazy"
          className="aspect-[4/5] w-full object-cover"
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex aspect-[4/5] w-full items-center justify-center border border-[#D8D2C4] font-mono text-[10px] uppercase tracking-[0.18em] text-[#6F6A60]"
        >
          {copy.inside.formats.photo}
        </span>
      )}

      <span className={`${kicker} mt-3`}>{copy.inside.formats.photo}</span>
      <FormatTitle material={material} copy={copy} format="photo" />
      <Meta material={material} lang={lang} copy={copy} />
    </MaterialLink>
  );
}

function SelectedCard({
  material,
  lang,
  copy,
}: {
  material: JournalMaterial;
  lang: JournalLanguage;
  copy: (typeof JOURNAL_COPY)[JournalLanguage];
}) {
  const format = journalFormat(material.kind);

  return (
    <li
      className="min-w-0"
      data-material-kind={material.kind}
      data-material-format={format}
      data-material-id={material.id}
    >
      {format === 'post' && <PostCard material={material} copy={copy} lang={lang} />}
      {format === 'link' && <LinkCard material={material} copy={copy} lang={lang} />}
      {format === 'video' && <VideoCard material={material} copy={copy} lang={lang} />}
      {format === 'photo' && <PhotoCard material={material} copy={copy} lang={lang} />}
    </li>
  );
}

/**
 * Compact editorial selection for the Journal front page.
 *
 * It renders only the already-selected current-issue materials. Missing
 * formats are skipped and no synthetic cards are added, while each format
 * keeps a distinct visual treatment so the five entries never collapse into
 * one repeated card.
 */
export default function IssueHighlights({
  materials,
  lang,
  hasMain = false,
  issueHref = null,
  issueLabel,
}: Props) {
  const copy = JOURNAL_COPY[lang];
  const count = materials.length + (hasMain ? 1 : 0);

  return (
    <section
      id="contents"
      aria-labelledby="issue-contents-title"
      className={`border-b ${rule} pb-10 pt-8`}
    >
      <header className="border-t border-[#1D1B18] pb-5 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-x-8 gap-y-5">
          <div className="min-w-0 max-w-2xl">
            <p className={`${kicker} ${accent}`}>{copy.inside.kicker}</p>
            <h2
              id="issue-contents-title"
              className="mt-1 font-serif text-[clamp(1.6rem,2.6vw,2.15rem)] font-normal leading-tight tracking-tight text-[#1D1B18]"
            >
              {copy.inside.selectedTitle}
            </h2>
            <p className="mt-2 max-w-xl font-serif text-[15px] leading-relaxed text-[#5B5651]">
              {copy.inside.selectedNote}
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:w-auto sm:items-end">
            <p className="font-mono text-[10px] uppercase leading-5 tracking-[0.12em] text-[#6F6A60] md:text-right">
              {itemCountLabel(count, lang)}
            </p>

            {issueHref && (
              <Link
                href={issueHref}
                data-role="full-issue"
                className="group inline-flex w-full items-center justify-between gap-6 bg-[#1D1B18] px-5 py-3.5 font-mono text-[11px] uppercase tracking-[0.18em] text-[#F5F2EB] transition-colors hover:bg-[#7A2233] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#7A2233] sm:w-auto sm:justify-center"
              >
                <span>{issueLabel || copy.featured.read}</span>
                <span
                  aria-hidden="true"
                  className="transition-transform group-hover:translate-x-0.5"
                >
                  →
                </span>
              </Link>
            )}
          </div>
        </div>
      </header>

      {materials.length === 0 ? (
        <p className="mt-6 max-w-xl border-t border-[#D8D2C4] pt-5 font-serif text-[16px] italic text-[#6F6A60]">
          {hasMain ? copy.inside.leadAbove : copy.inside.empty}
        </p>
      ) : (
        <ul className="mt-5 grid grid-cols-1 items-start gap-x-7 gap-y-8 sm:grid-cols-2 xl:grid-cols-4">
          {materials.map((material) => (
            <SelectedCard key={material.id} material={material} lang={lang} copy={copy} />
          ))}
        </ul>
      )}
    </section>
  );
}

export type { JournalFormat };
