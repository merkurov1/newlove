import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import FlowIssueDetail from '@/components/flow-issues/FlowIssueDetail';
import {
  findAdjacentFlowIssues,
  issueDescription,
  issuePageTitle,
  listPublicFlowIssues,
  loadPublicFlowIssue,
} from '@/lib/flow-issue/public';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const dynamic = 'force-dynamic';

const SITE = 'https://www.merkurov.love';

type PageProps = {
  params: Promise<{ slug: string }> | { slug: string };
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const issue = await loadPublicFlowIssue(slug);

  if (!issue) {
    return sanitizeMetadata({ title: 'Flow issue | Anton Merkurov' });
  }

  const canonical = `${SITE}/flow-issues/${encodeURIComponent(issue.slug)}`;

  return sanitizeMetadata({
    title: issuePageTitle(issue),
    description: issueDescription(issue),
    alternates: {
      canonical,
      languages: {
        ru: `${SITE}/flow-issues/${encodeURIComponent(issue.slug)}`,
        en: `${SITE}/en/flow-issues/${encodeURIComponent(issue.slug)}`,
      },
    },
    openGraph: {
      title: issuePageTitle(issue),
      description: issueDescription(issue),
      url: canonical,
      type: 'article',
    },
    twitter: {
      card: 'summary_large_image',
      title: issuePageTitle(issue),
      description: issueDescription(issue),
    },
  });
}

export default async function FlowIssuePage({ params }: PageProps) {
  const { slug } = await params;
  const issue = await loadPublicFlowIssue(slug);

  if (!issue || (!issue.htmlWeb && !issue.payload)) notFound();

  const catalogue = await listPublicFlowIssues(issue.lang);
  const { previous, next } = findAdjacentFlowIssues(catalogue, issue);

  return (
    <FlowIssueDetail
      issue={issue}
      canonical={`${SITE}/flow-issues/${encodeURIComponent(issue.slug)}`}
      indexHref="/flow-issues"
      previousIssue={previous}
      nextIssue={next}
    />
  );
}
