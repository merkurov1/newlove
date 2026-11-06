import type { Metadata } from 'next';
import FlowIssuesArchive from '@/components/flow-issues/FlowIssuesArchive';
import { listPublicFlowIssues } from '@/lib/flow-issue/public';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = sanitizeMetadata({
  title: 'Flow Issues | Anton Merkurov',
  description: 'The Flow issue archive: notes, links, images and signals gathered into periods.',
  alternates: {
    canonical: 'https://www.merkurov.love/en/flow-issues',
    languages: {
      ru: 'https://www.merkurov.love/flow-issues',
      en: 'https://www.merkurov.love/en/flow-issues',
    },
  },
});

export default async function EnFlowIssuesPage() {
  const issues = await listPublicFlowIssues('en');

  return (
    <FlowIssuesArchive
      issues={issues}
      lang="en"
      hrefFor={(issue) => `/en/flow-issues/${encodeURIComponent(issue.slug)}`}
      alternateHref="/flow-issues"
      alternateLabel="Русский"
    />
  );
}
