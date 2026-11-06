import Link from 'next/link';
import type { IssueLang } from '@/lib/flow-issue/types';
import type { PublicFlowIssue } from '@/lib/flow-issue/public';
import { issueDescription, issueItemCount, issuePageTitle } from '@/lib/flow-issue/public';

type FlowIssuesArchiveProps = {
  issues: PublicFlowIssue[];
  lang: IssueLang;
  hrefFor: (issue: PublicFlowIssue) => string;
  alternateHref: string;
  alternateLabel: string;
};

function formatDate(value: string | null, lang: IssueLang): string {
  if (!value) return '';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  return new Intl.DateTimeFormat(lang === 'ru' ? 'ru-RU' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export default function FlowIssuesArchive({
  issues,
  lang,
  hrefFor,
  alternateHref,
  alternateLabel,
}: FlowIssuesArchiveProps) {
  const ru = lang === 'ru';

  return (
    <div className="min-h-screen bg-[#FAF8F5] px-5 pb-24 pt-24 text-[#1C1A1B] sm:px-8 sm:pt-28">
      <div className="mx-auto max-w-3xl">
        <header className="mb-12 border-b border-neutral-300 pb-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-neutral-400">
              Flow / {ru ? 'выпуски' : 'issues'}
            </p>
            <Link
              href={alternateHref}
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-400 transition hover:text-neutral-900"
            >
              {alternateLabel} ↗
            </Link>
          </div>

          <h1 className="font-serif text-4xl font-light leading-tight tracking-tight sm:text-5xl">
            {ru ? 'Выпуски' : 'Issues'}
          </h1>

          <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-neutral-600">
            {ru
              ? 'Поток, собранный в периоды. Каждый выпуск — срез внимания: заметки, ссылки, изображения и сигналы без редакционной надстройки.'
              : 'Flow gathered into periods. Each issue is a slice of attention: notes, links, images and signals without an editorial desk.'}
          </p>
        </header>

        {issues.length === 0 ? (
          <p className="py-16 text-center font-serif italic text-neutral-400">
            {ru ? 'Выпусков пока нет.' : 'No issues yet.'}
          </p>
        ) : (
          <ol className="divide-y divide-neutral-300 border-b border-neutral-300">
            {issues.map((issue) => (
              <li key={issue.id}>
                <Link
                  href={hrefFor(issue)}
                  className="group grid gap-3 py-7 transition sm:grid-cols-[8.5rem_1fr] sm:gap-6"
                >
                  <div className="font-mono text-[11px] uppercase tracking-[0.16em] leading-5 text-neutral-400">
                    <time dateTime={issue.publishedAt || undefined}>
                      {formatDate(issue.publishedAt || issue.createdAt, lang)}
                    </time>
                    {issue.number ? (
                      <span className="block">
                        {ru ? 'Выпуск' : 'Issue'} №{issue.number}
                      </span>
                    ) : null}
                  </div>

                  <div className="min-w-0">
                    <h2 className="font-serif text-2xl font-normal leading-snug tracking-tight text-neutral-900 group-hover:underline group-hover:decoration-neutral-300 group-hover:underline-offset-4">
                      {issuePageTitle(issue)}
                    </h2>

                    <p className="mt-2 line-clamp-2 font-serif text-[17px] leading-relaxed text-neutral-600">
                      {issueDescription(issue)}
                    </p>

                    <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-400">
                      {issueItemCount(issue)} {ru ? 'материалов' : 'materials'}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}

        <footer className="mt-12 flex flex-wrap gap-5 font-mono text-[11px] uppercase tracking-[0.18em] text-neutral-400">
          <Link href="/flow" className="transition hover:text-neutral-900">
            {ru ? 'Поток' : 'Flow'} ↗
          </Link>
          <Link href="/journal" className="transition hover:text-neutral-900">
            Journal ↗
          </Link>
        </footer>
      </div>
    </div>
  );
}
