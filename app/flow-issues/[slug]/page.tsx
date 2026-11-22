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
import { flowIssueCanonicalUrl } from '@/lib/flow-issue/urls';

export const dynamic = 'force-dynamic';

type PageProps = {
  params: Promise<{ slug: string }> | { slug: string };
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const issue = await loadPublicFlowIssue(slug);

  if (!issue) {
    return sanitizeMetadata({ title: 'Flow issue | Anton Merkurov' });
  }

  const canonical = flowIssueCanonicalUrl(issue.slug, issue.lang);

  return sanitizeMetadata({
    title: issuePageTitle(issue),
    description: issueDescription(issue),
    alternates: {
      canonical,
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
      canonical={flowIssueCanonicalUrl(issue.slug, issue.lang)}
      indexHref={issue.lang === 'ru' ? '/flow-issues' : '/en/flow-issues'}
      previousIssue={previous}
      nextIssue={next}
    />
  );
}
