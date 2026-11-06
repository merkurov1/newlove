import type { Metadata } from 'next';
import FlowIssuesArchive from '@/components/flow-issues/FlowIssuesArchive';
import { listPublicFlowIssues } from '@/lib/flow-issue/public';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = sanitizeMetadata({
  title: 'Выпуски Flow | Anton Merkurov',
  description: 'Архив выпусков Flow: заметки, ссылки, изображения и сигналы, собранные в периоды.',
  alternates: {
    canonical: 'https://www.merkurov.love/flow-issues',
    languages: {
      ru: 'https://www.merkurov.love/flow-issues',
      en: 'https://www.merkurov.love/en/flow-issues',
    },
  },
});

export default async function FlowIssuesPage() {
  const issues = await listPublicFlowIssues('ru');

  return (
    <FlowIssuesArchive
      issues={issues}
      lang="ru"
      hrefFor={(issue) => `/flow-issues/${encodeURIComponent(issue.slug)}`}
      alternateHref="/en/flow-issues"
      alternateLabel="English"
    />
  );
}
