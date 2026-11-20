import Link from 'next/link';
import type { IssueLang } from '@/lib/flow-issue/types';
import type { PublicFlowIssue } from '@/lib/flow-issue/public';
import { issueDescription, issueItemCount, issuePageTitle } from '@/lib/flow-issue/public';
import { formatIssueNumber } from '@/lib/flow-issue/header';
import { formatIssueDate } from '@/lib/flow-issue/title';

type FlowIssuesArchiveProps = {
  issues: PublicFlowIssue[];
  lang: IssueLang;
  hrefFor: (issue: PublicFlowIssue) => string;
  alternateHref: string;
  alternateLabel: string;
};

function languageLabel(lang: IssueLang, uiLang: IssueLang): string {
  if (lang === 'ru') return uiLang === 'ru' ? 'Русский' : 'Russian';
  return uiLang === 'ru' ? 'Английский' : 'English';
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
        <header className="mb-12 border-b border-[#DAD3CC] pb-8">
          <div className="mb-4 flex items-center justify-between gap-4">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[#7A2233]">
              {ru ? 'ПОТОК / АРХИВ' : 'FLOW / ARCHIVE'}
            </p>
            <Link
              href={alternateHref}
              className="font-mono text-[11px] uppercase tracking-[0.18em] text-[#6B6568] transition hover:text-[#1C1A1B]"
            >
              {alternateLabel} ↗
            </Link>
          </div>

          <h1 className="font-serif text-4xl font-light leading-tight tracking-tight sm:text-5xl">
            {ru ? 'Выпуски' : 'Issues'}
          </h1>

          <p className="mt-4 max-w-2xl font-serif text-lg leading-relaxed text-[#5B5658]">
            {ru
              ? 'Поток, собранный в выпуски. Каждый выпуск — редакционный срез недели: главная тема, порядок материалов, колонка Пьеро и полная видеохроника.'
              : 'Flow gathered into issues. Each issue is an editorial reading of the week: the main theme, the order of materials, Pierrot’s column and the complete video record.'}
          </p>
        </header>

        {issues.length === 0 ? (
          <p className="py-16 text-center font-serif italic text-[#8A8380]">
            {ru ? 'Выпусков пока нет.' : 'No issues yet.'}
          </p>
        ) : (
          <ol className="divide-y divide-[#DAD3CC] border-b border-[#DAD3CC]">
            {issues.map((issue) => (
              <li key={issue.id}>
                <Link
                  href={hrefFor(issue)}
                  className="group grid gap-3 py-7 transition sm:grid-cols-[9.5rem_1fr] sm:gap-6"
                >
                  <div className="font-mono text-[11px] uppercase tracking-[0.16em] leading-5 text-[#6B6568]">
                    <time dateTime={issue.publishedAt || undefined}>
                      {formatIssueDate(issue.publishedAt || issue.createdAt, issue.lang)}
                    </time>
                    <span className="block">{formatIssueNumber(issue.number, issue.lang)}</span>
                    <span className="block text-[#8A8380]">
                      {languageLabel(issue.lang, lang)}
                    </span>
                  </div>

                  <div className="min-w-0">
                    <h2 className="font-serif text-2xl font-normal leading-snug tracking-tight text-[#1C1A1B] group-hover:underline group-hover:decoration-[#B9AEA8] group-hover:underline-offset-4">
                      {issuePageTitle(issue)}
                    </h2>

                    <p className="mt-2 line-clamp-2 font-serif text-[17px] leading-relaxed text-[#5B5658]">
                      {issueDescription(issue)}
                    </p>

                    <p className="mt-3 font-mono text-[10px] uppercase tracking-[0.18em] text-[#8A8380]">
                      {issueItemCount(issue)} {ru ? 'материалов' : 'materials'}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}

        <footer className="mt-12 flex flex-wrap gap-5 font-mono text-[11px] uppercase tracking-[0.18em] text-[#8A8380]">
          <Link href="/flow" className="transition hover:text-[#1C1A1B]">
            {ru ? 'Поток' : 'Flow'} ↗
          </Link>
          <Link href="/journal" className="transition hover:text-[#1C1A1B]">
            Journal ↗
          </Link>
        </footer>
      </div>
    </div>
  );
}
