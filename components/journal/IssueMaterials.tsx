import type { ReactNode } from 'react';
import Link from 'next/link';
import { JOURNAL_COPY, type JournalLanguage } from '@/lib/i18n/journal';
import { dateLong, items as itemCountLabel } from '@/lib/journal/format';
import {
  JOURNAL_MATERIAL_ORDER,
  groupIssueMaterials,
  materialHref,
  type JournalMaterial,
  type JournalMaterialGroup,
  type JournalMaterialKind,
} from '@/lib/journal/issue';

type Props = {
  materials: JournalMaterial[];
  lang: JournalLanguage;
  /** The lead material is already presented in the issue cover above. */
  hasLead?: boolean;
  /** Kind of the lead material, so the contents summary still adds up. */
  leadKind?: JournalMaterialKind | null;
};

const kicker = 'font-mono text-[10px] uppercase tracking-[0.16em] text-[#6F6A60]';
const rule = 'border-[#D8D2C4]';
const accent = 'text-[#7A2233]';

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
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[9px] uppercase tracking-[0.13em] text-[#6F6A60] sm:justify-end">
      {when && <time dateTime={material.publishedAt || undefined}>{when}</time>}
      {when && <span aria-hidden="true">·</span>}
      <span>{languageLabel(copy, material.lang)}</span>
      {material.isLead && (
        <>
          <span aria-hidden="true">·</span>
          <span className={accent}>{copy.inside.lead}</span>
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

function FeatureMaterial({
  material,
  lang,
  copy,
}: {
  material: JournalMaterial;
  lang: JournalLanguage;
  copy: (typeof JOURNAL_COPY)[JournalLanguage];
}) {
  const body = material.description || material.body;
  const isVideo = material.kind === 'video';
  const isPhoto = material.kind === 'photo';
  const isMedia = isVideo || isPhoto;

  const titleBlock = (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1">
        <p className={kicker}>{copy.inside.types[material.kind]}</p>
        {material.siteName && <p className={`${kicker} ${accent}`}>{material.siteName}</p>}
      </div>

      <h4
        lang={material.lang === 'other' ? undefined : material.lang}
        className="mt-3 break-words font-serif text-[clamp(1.75rem,3vw,2.75rem)] font-normal leading-[1.02] tracking-tight text-[#1D1B18] transition-colors group-hover:text-[#7A2233]"
      >
        {material.title}
      </h4>

      {body && (
        <p
          lang={material.lang === 'other' ? undefined : material.lang}
          className="mt-4 line-clamp-4 max-w-[42rem] break-words font-serif text-[16px] leading-[1.7] text-[#5B5651]"
        >
          {body}
        </p>
      )}
    </>
  );

  if (isMedia) {
    return (
      <li className={`border-t ${rule}`}>
        <MaterialLink material={material} className="group block py-8">
          {material.image ? (
            <img
              src={material.image}
              alt={material.imageAlt || material.title}
              loading="lazy"
              className={`${isVideo ? 'aspect-video' : 'aspect-[3/2]'} w-full object-cover`}
            />
          ) : (
            <span
              aria-hidden="true"
              className={`flex ${isVideo ? 'aspect-video' : 'aspect-[3/2]'} w-full items-center justify-center border border-[#D8D2C4] font-mono text-[10px] uppercase tracking-[0.18em] text-[#6F6A60]`}
            >
              {copy.inside.types[material.kind]}
            </span>
          )}

          <div className="mt-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
            <div className="min-w-0">{titleBlock}</div>
            <MaterialMeta material={material} lang={lang} copy={copy} />
          </div>
        </MaterialLink>
      </li>
    );
  }

  return (
    <li className={`border-t ${rule}`}>
      <MaterialLink
        material={material}
        className="group grid gap-6 py-8 md:grid-cols-[minmax(0,1.08fr)_minmax(14rem,0.92fr)] md:items-start md:gap-10"
      >
        <div className="min-w-0">
          {titleBlock}
          <div className="mt-5">
            <MaterialMeta material={material} lang={lang} copy={copy} />
          </div>
        </div>

        {material.image ? (
          <img
            src={material.image}
            alt={material.imageAlt || material.title}
            loading="lazy"
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="hidden border-t border-[#A39A8C] pt-2 font-mono text-[10px] uppercase tracking-[0.16em] text-[#6F6A60] md:block"
          >
            {copy.inside.open} ↗
          </span>
        )}
      </MaterialLink>
    </li>
  );
}

function CompactMaterial({
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
  const body = material.description || material.body;

  return (
    <li className={`border-t ${rule}`}>
      <MaterialLink
        material={material}
        className="group grid gap-3 py-5 sm:grid-cols-[2.25rem_minmax(0,1fr)_9.5rem] sm:gap-5"
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#6F6A60]">
          {String(index).padStart(2, '0')}
        </span>

        <div className="min-w-0">
          <h4
            lang={material.lang === 'other' ? undefined : material.lang}
            className="break-words font-serif text-[clamp(1.2rem,1.7vw,1.5rem)] font-normal leading-snug tracking-tight text-[#1D1B18] transition-colors group-hover:text-[#7A2233]"
          >
            {material.title}
          </h4>

          {body && (
            <p
              lang={material.lang === 'other' ? undefined : material.lang}
              className="mt-1.5 line-clamp-2 max-w-[46rem] break-words font-serif text-[15px] leading-relaxed text-[#5B5651]"
            >
              {body}
            </p>
          )}

          {material.siteName && <p className={`${kicker} mt-2`}>{material.siteName}</p>}
        </div>

        <div className="min-w-0 sm:text-right">
          <MaterialMeta material={material} lang={lang} copy={copy} />
        </div>
      </MaterialLink>
    </li>
  );
}

function GridMedia({
  material,
  lang,
  copy,
}: {
  material: JournalMaterial;
  lang: JournalLanguage;
  copy: (typeof JOURNAL_COPY)[JournalLanguage];
}) {
  const isVideo = material.kind === 'video';

  return (
    <li className="min-w-0">
      <MaterialLink material={material} className="group block">
        {material.image ? (
          <img
            src={material.image}
            alt={material.imageAlt || material.title}
            loading="lazy"
            className={`${isVideo ? 'aspect-video' : 'aspect-[4/5]'} w-full object-cover`}
          />
        ) : (
          <span
            aria-hidden="true"
            className={`flex ${isVideo ? 'aspect-video' : 'aspect-[4/5]'} w-full items-center justify-center border border-[#D8D2C4] font-mono text-[10px] uppercase tracking-[0.18em] text-[#6F6A60]`}
          >
            {copy.inside.types[material.kind]}
          </span>
        )}

        <p className={`${kicker} mt-3`}>
          {copy.inside.types[material.kind]}
          {material.siteName ? ` · ${material.siteName}` : ''}
        </p>

        {material.title && (
          <h4
            lang={material.lang === 'other' ? undefined : material.lang}
            className="mt-1 break-words font-serif text-[clamp(1.15rem,1.6vw,1.4rem)] font-normal leading-snug tracking-tight text-[#1D1B18] transition-colors group-hover:text-[#7A2233]"
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
  const [featured, ...rest] = group.items;

  return (
    <section aria-label={label} className="mt-12 first:mt-0" data-material-kind={group.kind}>
      <div className="flex items-baseline justify-between border-b border-[#1D1B18] pb-2">
        <h3 className="font-serif text-[clamp(1.5rem,2.4vw,2rem)] font-normal tracking-tight text-[#1D1B18]">
          {label}
        </h3>
        <span className={kicker}>{group.items.length}</span>
      </div>

      {featured && (
        <ul>
          <FeatureMaterial material={featured} lang={lang} copy={copy} />
        </ul>
      )}

      {rest.length > 0 &&
        (isMedia ? (
          <ul className="mt-8 grid grid-cols-1 gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {rest.map((material) => (
              <GridMedia key={material.id} material={material} lang={lang} copy={copy} />
            ))}
          </ul>
        ) : (
          <ul>
            {rest.map((material, index) => (
              <CompactMaterial
                key={material.id}
                material={material}
                index={index + 2}
                lang={lang}
                copy={copy}
              />
            ))}
          </ul>
        ))}
    </section>
  );
}

/**
 * “Inside this issue” — the second level of the Journal composition.
 *
 * The lead story lives in the issue cover. Everything rendered here is a real
 * published material from the issue payload; absent types are not rendered and
 * no placeholder cards or synthetic entries are created. Each material type
 * keeps its own visual treatment instead of collapsing into one card list.
 */
export default function IssueMaterials({
  materials,
  lang,
  hasLead = false,
  leadKind = null,
}: Props) {
  const copy = JOURNAL_COPY[lang];
  const groups = groupIssueMaterials(materials);
  const counts = new Map<JournalMaterialKind, number>(
    groups.map((group) => [group.kind, group.items.length])
  );

  if (hasLead && leadKind) {
    counts.set(leadKind, (counts.get(leadKind) || 0) + 1);
  }

  const typeSummary = JOURNAL_MATERIAL_ORDER.filter((kind) => (counts.get(kind) || 0) > 0)
    .map((kind) => `${copy.inside.types[kind]} ${counts.get(kind)}`)
    .join(' · ');

  return (
    <section
      id="contents"
      aria-labelledby="issue-contents-title"
      className={`border-b ${rule} pb-14 pt-12`}
    >
      <header className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div>
          <p className={`font-mono text-[10px] uppercase tracking-[0.18em] ${accent}`}>
            {copy.inside.kicker}
          </p>
          <h2
            id="issue-contents-title"
            className="mt-2 max-w-2xl font-serif text-[clamp(2.25rem,4vw,3.5rem)] font-normal leading-[0.98] tracking-tight text-[#1D1B18]"
          >
            {copy.inside.title}
          </h2>
        </div>

        <p className="max-w-sm font-mono text-[10px] uppercase leading-5 tracking-[0.12em] text-[#6F6A60] md:text-right">
          <span className="text-[#5B5651]">{copy.inside.contents}</span>
          <span className="block">
            {itemCountLabel(materials.length + (hasLead ? 1 : 0), lang)}
            {typeSummary ? ` · ${typeSummary}` : ''}
          </span>
        </p>
      </header>

      {groups.length === 0 ? (
        <p className="mt-8 max-w-xl border-t border-[#D8D2C4] pt-6 font-serif text-[17px] italic text-[#6F6A60]">
          {hasLead ? copy.inside.leadAbove : copy.inside.empty}
        </p>
      ) : (
        <div className="mt-9">
          {groups.map((group) => (
            <MaterialGroup key={group.kind} group={group} lang={lang} copy={copy} />
          ))}
        </div>
      )}
    </section>
  );
}

export type { JournalMaterial, JournalMaterialKind };
