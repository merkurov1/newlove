import type { Metadata } from 'next';
import { pageMetadata, ROUTE_COPY } from '@/lib/seo';

const PATH = '/unframed/proposal';
const copy = ROUTE_COPY[PATH];

export const metadata: Metadata = pageMetadata({
  ...copy,
  path: PATH,
  type: 'article',
  authors: ['Anton Merkurov'],
  languages: {
    'x-default': PATH,
    en: PATH,
  },
});

export default function ProposalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
