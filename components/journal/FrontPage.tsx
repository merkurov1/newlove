import type { ReactNode } from 'react';
import Link from 'next/link';
import SectionLanguageSwitcher from '@/components/i18n/SectionLanguageSwitcher';
import { LANGUAGE_META } from '@/lib/i18n/config';
import {
  JOURNAL_COPY,
  journalArchiveHref,
  journalIssueHref,
  type JournalLanguage,
} from '@/lib/i18n/journal';

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
  lang: JournalLanguage;
  featured: FrontIssue | null;
  other: FrontIssue | null;
  flow: FlowEntry[];
  archive: FrontIssue[];
  subscribe: ReactNode;
}

const LOCALE: Record<Lang, string> = { ru: 'ru-RU', en: 'en-GB' };

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

const kicker = 'font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-500';

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
      <h2 className="font-serif text-xl font-normal text-neutral-900">{title}</h2>
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

function IssueLead({
  issue,
  uiLang,
  label,
}: {
  issue: FrontIssue | null;
  uiLang: JournalLanguage;
  label: string;
}) {
  const copy = JOURNAL_COPY[uiLang];

  if (!issue || !issue.slug) {
    return (
      <article className="py-10 md:px-10 md:first:pl-0 md:last:pr-0">
        <p className={kicker}>{label}</p>
        <p className="mt-6 font-serif text-2xl italic text-neutral-400">
          {copy.featured.emptyTitle}
        </p>
        <p className="mt-3 max-w-sm font-serif text-sm leading-relaxed text-neutral-500">
          {copy.featured.emptyBody}
        </p>
      </article>
    );
  }

  const when =
    period(issue.periodStart, issue.periodEnd, uiLang) || dateLong(issue.publishedAt, uiLang);

  return (
    <article className="group py-10 md:px-10 md:first:pl-0 md:last:pr-0">
      <Link href={journalIssueHref(issue.lang, issue.slug)} className="block">
        <p className={kicker}>
          <span className="text-[#990F3D]">Flow</span>
          {issue.number ? ` · ${copy.featured.issue} №${issue.number}` : ''}
          {` · ${copy.languages[issue.lang]}`}
        </p>

        <p className="mt-3 font-mono text-[9px] uppercase tracking-[0.14em] text-neutral-400">
          {label}
        </p>

        <h3
          lang={issue.lang}
          className="mt-4 font-serif text-3xl font-normal leading-[1.1] tracking-tight text-neutral-900 transition-colors group-hover:text-[#990F3D] md:text-[2.6rem]"
        >
          {issue.headline}
        </h3>

        {issue.excerpt && (
          <p
            lang={issue.lang}
            className="mt-5 line-clamp-4 font-serif text-[17px] leading-relaxed text-neutral-600"
          >
            {issue.excerpt}
          </p>
        )}

        <p className="mt-6 font-mono text-[11px] tracking-wide text-neutral-500">
          {when}
          {issue.published != null && ` · ${items(issue.published, uiLang)}`}
        </p>

        <span className="mt-6 inline-block border-b border-neutral-900 pb-0.5 font-mono text-[10px] uppercase tracking-[0.16em] text-neutral-900 transition-colors group-hover:border-[#990F3D] group-hover:text-[#990F3D]">
          {copy.featured.read} →
        </span>
      </Link>
    </article>
  );
}

export default function FrontPage({ lang, featured, other, flow, archive, subscribe }: Props) {
  const copy = JOURNAL_COPY[lang];

  return (
    <div lang={lang} className="mx-auto max-w-6xl px-5 pb-24 pt-16 sm:px-8 md:pt-24">
      <header className="pb-6">
        <div className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5">
          <div>
            <h1 className="font-serif text-5xl font-normal tracking-tight md:text-7xl">
              {copy.masthead.title}
            </h1>
          </div>
          <div className="flex max-w-xs flex-col items-start gap-3 md:items-end">
            <p className="font-serif text-base italic text-neutral-600 md:text-right">
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
        <a href="#issues" className="hover:text-[#990F3D]">
          {copy.nav.issues}
        </a>
        <a href="#stream" className="hover:text-[#990F3D]">
          {copy.nav.stream}
        </a>
        <a href="#archive" className="hover:text-[#990F3D]">
          {copy.nav.archive}
        </a>
        <a href="#subscribe" className="ml-auto hover:text-[#990F3D]">
          {copy.nav.subscribe}
        </a>
      </nav>

      <section
        id="issues"
        aria-label={copy.featured.ariaLabel}
        className="grid border-b border-neutral-300 md:grid-cols-2 md:divide-x md:divide-neutral-300"
      >
        <IssueLead issue={featured} uiLang={lang} label={copy.featured.currentEdition} />
        <IssueLead issue={other} uiLang={lang} label={copy.featured.otherEdition} />
      </section>

      <div className="grid gap-x-14 gap-y-14 py-12 lg:grid-cols-12">
        <section id="stream" className="lg:col-span-7">
          <SectionHead title={copy.flow.title} href="/flow" hrefLabel={copy.flow.cta} />
          {flow.length === 0 ? (
            <p className="py-6 font-serif italic text-neutral-400">{copy.flow.empty}</p>
          ) : (
            <ul>
              {flow.map((entry) => {
                const when = stamp(entry.at, lang);
                const label = copy.flow.types[entry.type] || copy.flow.types.mixed;
                const languageLabel =
                  entry.lang === lang ? '' : ` · ${LANGUAGE_META[entry.lang].label}`;
                const href = entry.slug ? `/flow/${encodeURIComponent(entry.slug)}` : '/flow';
                return (
                  <li key={entry.id} className="border-t border-neutral-300">
                    <Link href={href} className="group grid grid-cols-[88px_1fr] gap-4 py-4">
                      <span className="font-mono text-[11px] leading-5 text-neutral-500">
                        {when.day}
                        <br />
                        {when.time}
                      </span>
                      <span>
                        <span className={kicker}>
                          {label}
                          {languageLabel}
                        </span>
                        <span
                          lang={entry.lang}
                          className="mt-1 block font-serif text-lg leading-snug text-neutral-900 transition-colors group-hover:text-[#990F3D]"
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

        <section id="archive" className="lg:col-span-5">
          <SectionHead
            title={copy.archive.title}
            href={journalArchiveHref(lang)}
            hrefLabel={copy.archive.cta}
          />
          {archive.length === 0 ? (
            <p className="py-6 font-serif italic text-neutral-400">{copy.archive.empty}</p>
          ) : (
            <ul>
              {archive.map((issue) => (
                <li key={issue.id} className="border-t border-neutral-300">
                  <Link
                    href={journalIssueHref(issue.lang, issue.slug)}
                    className="group grid grid-cols-[1fr_auto] items-baseline gap-4 py-4"
                  >
                    <span>
                      <span className="block font-mono text-[10px] uppercase tracking-[0.14em] text-neutral-500">
                        {dateLong(issue.publishedAt, lang)}
                      </span>
                      <span
                        lang={issue.lang}
                        className="mt-1 block font-serif text-xl leading-snug text-neutral-900 transition-colors group-hover:text-[#990F3D]"
                      >
                        {issue.headline}
                      </span>
                      <span className="mt-1 block font-mono text-[9px] uppercase tracking-[0.12em] text-neutral-500">
                        {copy.archive.issue}
                        {issue.number ? ` №${issue.number}` : ''}
                        {issue.published != null ? ` · ${items(issue.published, lang)}` : ''}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-neutral-500">
                      {copy.languages[issue.lang]}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section id="subscribe" className="border-y border-neutral-900 py-12">
        <div className="grid gap-8 md:grid-cols-[0.9fr_1.1fr] md:items-start md:gap-14">
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
