import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: 'https://www.merkurov.love/unframed/proposal' },
};

export default function ProposalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
