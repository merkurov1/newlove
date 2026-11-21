import Link from 'next/link';
import type { IssueLang } from '@/lib/flow-issue/types';
import type { PublicFlowIssue } from '@/lib/flow-issue/public';
import { issueDescription, issueItemCount, issuePageTitle } from '@/lib/flow-issue/public';
import { formatIssueNumber } from '@/lib/flow-issue/header';
import { formatIssueDate } from '@/lib/flow-issue/title';
import { uniqueJournalIssues } from '@/lib/journal/archive';
import FlowIssuesArchiveFilters, { type FlowArchiveItem } from './FlowIssuesArchiveFilters';

type FlowIssuesArchiveProps = {
  issues: PublicFlowIssue[];
  lang: IssueLang;
  hrefFor: (issue: PublicFlowIssue) => string;
  alternateHref: string;
  alternateLabel: string;
};

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

        <FlowIssuesArchiveFilters
          lang={lang}
          items={uniqueJournalIssues(issues).map<FlowArchiveItem>((issue) => ({
            id: issue.id,
            href: hrefFor(issue),
            lang: issue.lang,
            title: issuePageTitle(issue),
            description: issueDescription(issue),
            itemCount: issueItemCount(issue),
            dateLabel: formatIssueDate(issue.publishedAt || issue.createdAt, issue.lang),
            numberLabel: formatIssueNumber(issue.number, issue.lang),
            publishedAt: issue.publishedAt,
            createdAt: issue.createdAt,
            periodEnd: issue.payload?.period?.end ?? null,
          }))}
        />

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
