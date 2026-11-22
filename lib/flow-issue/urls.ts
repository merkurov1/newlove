import { absoluteUrl } from '@/lib/seo';

/**
 * Flow issues have one canonical URL determined by the language of the issue
 * content itself, not by the language of the archive chrome that links to it.
 *
 * The same row is reachable through both `/flow-issues/<slug>` and
 * `/en/flow-issues/<slug>`. Those two paths are interface variants of one
 * document, so only the content-language path may be self-canonical.
 */
export function flowIssuePath(slug: string, lang: string | null | undefined): string {
  const safeSlug = encodeURIComponent(String(slug || '').trim());
  return String(lang || '').toLowerCase() === 'ru'
    ? `/flow-issues/${safeSlug}`
    : `/en/flow-issues/${safeSlug}`;
}

export function flowIssueCanonicalUrl(
  slug: string,
  lang: string | null | undefined
): string {
  return absoluteUrl(flowIssuePath(slug, lang));
}
