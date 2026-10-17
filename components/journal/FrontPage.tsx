import type { ReactNode } from 'react';
import Link from 'next/link';

export type Lang = 'ru' | 'en';

export interface FrontIssue {
  id: string;
  slug: string;
  lang: Lang;
  number: number | null;
  headline: string;
  excerpt: string;
  summary: string;
  published: number | null;
  publishedAt: string | null;
  periodStart: string | null;
  periodEnd: string | null;
}

export interface FlowEntry {
  id: string;
  slug: string | null;
  type: string;
  lang: Lang;
  text: string;
  at: string | null;
}

interface Props {
  ru: FrontIssue | null;
  en: FrontIssue | null;
  flow: FlowEntry[];
  archive: FrontIssue[];
  subscribe: ReactNode;
}

const LOCALE: Record<Lang, string> = { ru: 'ru-RU', en: 'en-GB' };

const TYPE_LABEL: Record<Lang, Record<string, string>> = {
  ru: { note: 'Заметка', link: 'Ссылка', video: 'Видео', photo: 'Фото' },
  en: { note: 'Note', link: 'Link', video: 'Video', photo: 'Photo' },
};

function dateLong(value: string | null, lang: Lang) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

function period(start: string | null, end: string | null, lang: Lang) {
  if (!start || !end) return '';
  const a = new Date(start);
  const b = new Date(end);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return '';
  try {
    return new Intl.DateTimeFormat(LOCALE[lang], {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }).formatRange(a, b);
  } catch {
    return `${dateLong(start, lang)} — ${dateLong(end, lang)}`;
  }
}

function stamp(value: string | null, lang: Lang) {
  if (!value) return { day: '', time: '' };
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return { day: '', time: '' };
  const day = new Intl.DateTimeFormat(LOCALE[lang], {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  })
    .format(d)
    .replace(/\./g, '');
  const time = new Intl.DateTimeFormat(LOCALE[lang], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'UTC',
  }).format(d);
  return { day, time };
}

function items(n: number, lang: Lang) {
  if (lang === 'en') return `${n} ${n === 1 ? 'item' : 'items'}`;
  const a = n % 10;
  const b = n % 100;
  const word =
    a === 1 && b !== 11
      ? 'материал'
      : a >= 2 && a <= 4 && (b < 10 || b >= 20)
        ? 'материала'
        : 'материалов';
  return `${n} ${word}`;
}

const kicker =
  'font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500';

function SectionHead({
  title,
  href,
  hrefLabel,
}: {
  title: string;
  href?: string;
  hrefLabel?: string;
}) {
  return (
    <div className="flex items-baseline justify-between border-t-2 border-neutral-900 pb-3 pt-3">
      <h2 className="font-serif text-xl font-normal text-neutral-900">
        {title}
      </h2>
      {href && (
        <Link
          href={href}
          className="font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500 transition-colors hover:text-[#990F3D]"
        >
          {hrefLabel} →
        </Link>
      )}
    </div>
  );
}

function IssueLead({ issue, lang }: { issue: FrontIssue | null; lang: Lang }) {
  const ru = lang === 'ru';

  if (!issue || !issue.slug) {
    return (
      <article className="py-10 md:px-10 md:first:pl-0 md:last:pr-0">
        <p className={kicker}>{ru ? 'Flow на русском' : 'Flow in English'}</p>
        <p className="mt-6 font-serif text-2xl italic text-neutral-400">
          {ru ? 'Первый выпуск скоро появится.' : 'The first issue is coming soon.'}
        </p>
      </article>
    );
  }

  const when =
    period(issue.periodStart, issue.periodEnd, lang) ||
    dateLong(issue.publishedAt, lang);

  return (
    <article className="group py-10 md:px-10 md:first:pl-0 md:last:pr-0">
      <Link href={`/letters/${issue.slug}`} className="block">
        <p className={kicker}>
          <span className="text-[#990F3D]">Flow</span>
          {issue.number ? ` · ${ru ? 'Выпуск' : 'Issue'} №${issue.number}` : ''}
          {` · ${ru ? 'На русском' : 'In English'}`}
        </p>

        <h3 className="mt-5 font-serif text-3xl font-normal leading-[1.1] tracking-tight text-neutral-900 transition-colors group-hover:text-[#990F3D] md:text-[2.6rem]">
          {issue.headline}
        </h3>

        {issue.excerpt && (
          <p className="mt-5 line-clamp-4 font-serif text-[17px] leading-relaxed text-neutral-600">
            {issue.excerpt}
          </p>
        )}

        <p className="mt-6 font-mono text-[11px] tracking-wide text-neutral-500">
          {when}
          {issue.published != null && ` · ${items(issue.published, lang)}`}
        </p>

        <span className="mt-6 inline-block border-b border-neutral-900 pb-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-900 transition-colors group-hover:border-[#990F3D] group-hover:text-[#990F3D]">
          {ru ? 'Читать выпуск' : 'Read the issue'} →
        </span>
      </Link>
    </article>
  );
}

export default function FrontPage({ ru, en, flow, archive, subscribe }: Props) {
  return (
    <div className="mx-auto max-w-6xl px-5 pb-24 pt-16 sm:px-8 md:pt-24">
      {/* Masthead */}
      <header className="pb-6">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-3">
          <div>
            <h1 className="font-serif text-5xl font-normal tracking-tight md:text-7xl">
              The Journal
            </h1>
          </div>
          <p className="max-w-xs font-serif text-base italic text-neutral-600 md:text-right">
            Notes on art, technology, and the architecture of value.
          </p>
        </div>
      </header>

      <nav
        aria-label="Journal sections"
        className="flex flex-wrap gap-x-7 gap-y-2 border-y border-neutral-900 py-3 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-600"
      >
        <a href="#issues" className="hover:text-[#990F3D]">Flow / Выпуски</a>
        <a href="#stream" className="hover:text-[#990F3D]">Поток</a>
        <a href="#archive" className="hover:text-[#990F3D]">Архив</a>
        <a href="#subscribe" className="ml-auto hover:text-[#990F3D]">Подписка</a>
      </nav>

      {/* Главные материалы: свежие выпуски на двух языках */}
      <section
        id="issues"
        className="grid border-b border-neutral-300 md:grid-cols-2 md:divide-x md:divide-neutral-300"
      >
        <IssueLead issue={ru} lang="ru" />
        <IssueLead issue={en} lang="en" />
      </section>

      {/* Поток и архив */}
      <div className="grid gap-x-14 gap-y-14 py-12 lg:grid-cols-12">
        <section id="stream" className="lg:col-span-7">
          <SectionHead title="Flow" href="/flow" hrefLabel="Весь поток" />
          {flow.length === 0 ? (
            <p className="py-6 font-serif italic text-neutral-400">—</p>
          ) : (
            <ul>
              {flow.map((entry) => {
                const when = stamp(entry.at, entry.lang);
                const label =
                  TYPE_LABEL[entry.lang][entry.type] || entry.type;
                const href = entry.slug
                  ? `/flow/${encodeURIComponent(entry.slug)}`
                  : '/flow';
                return (
                  <li key={entry.id} className="border-t border-neutral-300">
                    <Link
                      href={href}
                      className="group grid grid-cols-[88px_1fr] gap-4 py-4"
                    >
                      <span className="font-mono text-[11px] leading-5 text-neutral-500">
                        {when.day}
                        <br />
                        {when.time}
                      </span>
                      <span>
                        <span className={kicker}>{label}</span>
                        <span className="mt-1 block font-serif text-lg leading-snug text-neutral-900 transition-colors group-hover:text-[#990F3D]">
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

        <section id="archive" className="lg:col-span-5">
          <SectionHead
            title="Архив выпусков"
            href="/letters"
            hrefLabel="Все выпуски"
          />
          {archive.length === 0 ? (
            <p className="py-6 font-serif italic text-neutral-400">—</p>
          ) : (
            <ul>
              {archive.map((issue) => {
                const ru = issue.lang === 'ru';
                return (
                  <li key={issue.id} className="border-t border-neutral-300">
                    <Link
                      href={`/letters/${issue.slug}`}
                      className="group grid grid-cols-[1fr_auto] items-baseline gap-4 py-4"
                    >
                      <span>
                        <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                          {dateLong(issue.publishedAt, issue.lang)}
                        </span>
                        <span className="mt-1 block font-serif text-xl leading-snug text-neutral-900 transition-colors group-hover:text-[#990F3D]">
                          {ru ? 'Выпуск' : 'Issue'}
                          {issue.number ? ` №${issue.number}` : ''}
                        </span>
                        {issue.summary && (
                          <span className="mt-1 block font-serif text-sm text-neutral-500">
                            {issue.summary}
                          </span>
                        )}
                      </span>
                      <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                        {issue.lang}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      {/* Подписка */}
      <section
        id="subscribe"
        className="border-y border-neutral-900 py-12 text-center"
      >
        <p className={kicker}>Flow · Weekly</p>
        <p className="mx-auto mt-3 max-w-md font-serif text-2xl italic leading-snug text-neutral-800">
          Я ничего не пишу, я только отбираю.
        </p>
        <div className="mx-auto mt-8 max-w-md text-left">{subscribe}</div>
      </section>
    </div>
  );
}
