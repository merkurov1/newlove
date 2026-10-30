import { permanentRedirect } from 'next/navigation';

/**
 * Legacy duplicate of /flow. Kept as a permanent redirect so old links and
 * search results consolidate on the canonical Flow page.
 */
export default function FeedPage() {
  permanentRedirect('/flow');
}
