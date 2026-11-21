import type { ReactNode } from 'react';
import Link from 'next/link';
import { JOURNAL_COPY, type JournalLanguage } from '@/lib/i18n/journal';
import { dateLong, items as itemCountLabel } from '@/lib/journal/format';
import {
  groupIssueMaterials,
  materialHref,
  type JournalMaterial,
  type JournalMaterialGroup,
  type JournalMaterialKind,
} from '@/lib/journal/issue';

type Props = {
  materials: JournalMaterial[];
  lang: JournalLanguage;
};

const kicker = 'font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500';

function languageLabel(
  copy: (typeof JOURNAL_COPY)[JournalLanguage],
  value: JournalMaterial['lang']
): string {
  return copy.languages[value];
}

function MaterialMeta({
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
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.13em] text-neutral-500">
      {when && <time dateTime={material.publishedAt || undefined}>{when}</time>}
      {when && <span aria-hidden="true">·</span>}
      <span>{languageLabel(copy, material.lang)}</span>
      {material.isLead && (
        <>
          <span aria-hidden="true">·</span>
          <span className="text-[#7A2233]">{copy.inside.lead}</span>
        </>
      )}
    </p>
  );
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

function TextMaterial({
  material,
  lang,
  copy,
}: {
  material: JournalMaterial;
  lang: JournalLanguage;
  copy: (typeof JOURNAL_COPY)[JournalLanguage];
}) {
  const body = material.description || material.body;

  return (
    <li className="border-t border-neutral-300">
      <MaterialLink
        material={material}
        className="group grid grid-cols-1 gap-3 py-5 transition-colors sm:grid-cols-[8.5rem_1fr] sm:gap-8"
      >
        <div className="min-w-0">
          <p className={kicker}>{copy.inside.types[material.kind]}</p>
          <MaterialMeta material={material} lang={lang} copy={copy} />
        </div>

        <div className="flex min-w-0 items-start gap-4 sm:gap-6">
          <div className="min-w-0 flex-1">
            <h4
              lang={material.lang === 'other' ? undefined : material.lang}
              className="break-words font-serif text-[22px] font-normal leading-snug tracking-tight text-neutral-900 transition-colors group-hover:text-[#7A2233]"
            >
              {material.title}
            </h4>

            {body && (
              <p
                lang={material.lang === 'other' ? undefined : material.lang}
                className="mt-2 line-clamp-3 font-serif text-[15px] leading-relaxed text-neutral-600"
              >
                {body}
              </p>
            )}

            {material.siteName && (
              <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-500">
                {material.siteName}
              </p>
            )}
          </div>

          {material.image && (
            <img
              src={material.image}
              alt={material.imageAlt || material.title}
              loading="lazy"
              className="hidden h-24 w-32 shrink-0 object-cover sm:block"
            />
          )}
        </div>
      </MaterialLink>
    </li>
  );
}

function LinkMaterial({
  material,
  lang,
  copy,
}: {
  material: JournalMaterial;
  lang: JournalLanguage;
  copy: (typeof JOURNAL_COPY)[JournalLanguage];
}) {
  return (
    <li className="border-t border-neutral-300">
      <MaterialLink
        material={material}
        className="group grid grid-cols-1 gap-4 py-5 transition-colors sm:grid-cols-[1fr_11rem] sm:gap-8"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className={kicker}>{copy.inside.types.link}</p>
            {material.siteName && (
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-[#7A2233]">
                {material.siteName}
              </p>
            )}
          </div>

          <h4
            lang={material.lang === 'other' ? undefined : material.lang}
            className="mt-3 break-words font-serif text-[24px] font-normal leading-snug tracking-tight text-neutral-900 transition-colors group-hover:text-[#7A2233]"
          >
            {material.title}
          </h4>

          {(material.description || material.body) && (
            <p
              lang={material.lang === 'other' ? undefined : material.lang}
              className="mt-2 line-clamp-3 font-serif text-[15px] leading-relaxed text-neutral-600"
            >
              {material.description || material.body}
            </p>
          )}

          <div className="mt-3">
            <MaterialMeta material={material} lang={lang} copy={copy} />
          </div>
        </div>

        {material.image ? (
          <img
            src={material.image}
            alt={material.imageAlt || material.title}
            loading="lazy"
            className="h-32 w-full object-cover sm:h-24"
          />
        ) : (
          <span
            aria-hidden="true"
            className="hidden border-t border-neutral-300 pt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-400 sm:block"
          >
            {copy.inside.open} ↗
          </span>
        )}
      </MaterialLink>
    </li>
  );
}

function VideoMaterial({
  material,
  lang,
  copy,
}: {
  material: JournalMaterial;
  lang: JournalLanguage;
  copy: (typeof JOURNAL_COPY)[JournalLanguage];
}) {
  return (
    <li className="min-w-0">
      <MaterialLink material={material} className="group block">
        {material.image ? (
          <img
            src={material.image}
            alt={material.imageAlt || material.title}
            loading="lazy"
            className="aspect-video w-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex aspect-video w-full items-center justify-center border border-neutral-300 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400"
          >
            {copy.inside.types.video}
          </span>
        )}

        <p className={`${kicker} mt-3`}>
          {copy.inside.types.video}
          {material.siteName ? ` · ${material.siteName}` : ''}
        </p>

        {material.title && (
          <h4
            lang={material.lang === 'other' ? undefined : material.lang}
            className="mt-1 break-words font-serif text-[20px] font-normal leading-snug tracking-tight text-neutral-900 transition-colors group-hover:text-[#7A2233]"
          >
            {material.title}
          </h4>
        )}

        <div className="mt-2">
          <MaterialMeta material={material} lang={lang} copy={copy} />
        </div>
      </MaterialLink>
    </li>
  );
}

function PhotoMaterial({
  material,
  lang,
  copy,
}: {
  material: JournalMaterial;
  lang: JournalLanguage;
  copy: (typeof JOURNAL_COPY)[JournalLanguage];
}) {
  return (
    <li className="min-w-0">
      <MaterialLink material={material} className="group block">
        {material.image && (
          <img
            src={material.image}
            alt={material.imageAlt || material.title}
            loading="lazy"
            className="aspect-[4/3] w-full object-cover"
          />
        )}

        {material.title && (
          <h4
            lang={material.lang === 'other' ? undefined : material.lang}
            className="mt-3 break-words font-serif text-[18px] font-normal leading-snug text-neutral-900 transition-colors group-hover:text-[#7A2233]"
          >
            {material.title}
          </h4>
        )}

        {material.description && material.description !== material.title && (
          <p className="mt-1 line-clamp-2 font-serif text-[14px] leading-relaxed text-neutral-600">
            {material.description}
          </p>
        )}

        <div className="mt-2">
          <MaterialMeta material={material} lang={lang} copy={copy} />
        </div>
      </MaterialLink>
    </li>
  );
}

function MaterialGroup({
  group,
  lang,
  copy,
}: {
  group: JournalMaterialGroup;
  lang: JournalLanguage;
  copy: (typeof JOURNAL_COPY)[JournalLanguage];
}) {
  const label = copy.inside.types[group.kind];
  const isMedia = group.kind === 'video' || group.kind === 'photo';
  const isLink = group.kind === 'link';

  return (
    <section
      aria-label={label}
      className="mt-10 first:mt-0"
      data-material-kind={group.kind}
    >
      <div className="flex items-baseline justify-between border-b-2 border-neutral-900 pb-2">
        <h3 className="font-serif text-2xl font-normal tracking-tight text-neutral-900">
          {label}
        </h3>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500">
          {group.items.length}
        </span>
      </div>

      {isMedia ? (
        <ul className="mt-6 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {group.items.map((material) =>
            group.kind === 'video' ? (
              <VideoMaterial
                key={material.id}
                material={material}
                lang={lang}
                copy={copy}
              />
            ) : (
              <PhotoMaterial
                key={material.id}
                material={material}
                lang={lang}
                copy={copy}
              />
            )
          )}
        </ul>
      ) : (
        <ul>
          {group.items.map((material) =>
            isLink ? (
              <LinkMaterial
                key={material.id}
                material={material}
                lang={lang}
                copy={copy}
              />
            ) : (
              <TextMaterial
                key={material.id}
                material={material}
                lang={lang}
                copy={copy}
              />
            )
          )}
        </ul>
      )}
    </section>
  );
}

/**
 * “Inside this issue” — the second level of the Journal composition.
 *
 * Every section is derived from the published issue payload; absent types are
 * not rendered. There are no placeholder cards and no synthetic entries.
 */
export default function IssueMaterials({ materials, lang }: Props) {
  const copy = JOURNAL_COPY[lang];
  const groups = groupIssueMaterials(materials);
  const typeSummary = groups
    .map((group) => `${copy.inside.types[group.kind]} ${group.items.length}`)
    .join(' · ');

  return (
    <section
      id="contents"
      aria-labelledby="issue-contents-title"
      className="border-b border-neutral-300 pb-14 pt-12"
    >
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[#7A2233]">
            {copy.inside.kicker}
          </p>
          <h2
            id="issue-contents-title"
            className="mt-2 font-serif text-3xl font-normal tracking-tight text-neutral-900 md:text-4xl"
          >
            {copy.inside.title}
          </h2>
        </div>

        <p className="max-w-sm font-mono text-[10px] uppercase leading-5 tracking-[0.12em] text-neutral-500 sm:text-right">
          <span className="text-neutral-700">{copy.inside.contents}</span>
          <span className="block">
            {itemCountLabel(materials.length, lang)}
            {typeSummary ? ` · ${typeSummary}` : ''}
          </span>
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="mt-8 max-w-xl border-t border-neutral-300 pt-6 font-serif text-[17px] italic text-neutral-500">
          {copy.inside.empty}
        </p>
      ) : (
        <div className="mt-8">
          {groups.map((group) => (
            <MaterialGroup
              key={group.kind}
              group={group}
              lang={lang}
              copy={copy}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export type { JournalMaterial, JournalMaterialKind };
