import FlowIssueArticle from './FlowIssueArticle';
import { issuePageTitle, type PublicFlowIssue } from '@/lib/flow-issue/public';

const SITE = 'https://www.merkurov.love';

type FlowIssueDetailProps = {
  issue: PublicFlowIssue;
  canonical: string;
  indexHref: string;
  previousIssue?: PublicFlowIssue | null;
  nextIssue?: PublicFlowIssue | null;
};

export default function FlowIssueDetail({
  issue,
  canonical,
  indexHref,
  previousIssue = null,
  nextIssue = null,
}: FlowIssueDetailProps) {
  const period = issue.payload?.period;

  const articleSchema = {
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: issuePageTitle(issue),
    datePublished: issue.publishedAt || issue.createdAt || undefined,
    inLanguage: issue.lang,
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': canonical,
    },
    author: {
      '@type': 'Person',
      name: 'Anton Merkurov',
      url: SITE,
    },
    publisher: {
      '@type': 'Person',
      name: 'Anton Merkurov',
      url: SITE,
    },
    ...(period ? { temporalCoverage: `${period.start}/${period.end}` } : {}),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(articleSchema).replace(/</g, '\\u003c'),
        }}
      />
      <FlowIssueArticle
        htmlWeb={issue.htmlWeb}
        lang={issue.lang}
        slug={issue.slug}
        payload={issue.payload}
        title={issue.title}
        number={issue.number}
        indexHref={indexHref}
        previousIssue={
          previousIssue
            ? {
                href: `${indexHref}/${encodeURIComponent(previousIssue.slug)}`,
                title: issuePageTitle(previousIssue),
                lang: previousIssue.lang,
                number: previousIssue.number,
              }
            : null
        }
        nextIssue={
          nextIssue
            ? {
                href: `${indexHref}/${encodeURIComponent(nextIssue.slug)}`,
                title: issuePageTitle(nextIssue),
                lang: nextIssue.lang,
                number: nextIssue.number,
              }
            : null
        }
      />
    </>
  );
}
