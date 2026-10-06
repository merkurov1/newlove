import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: 'https://www.merkurov.love/communications' },
};

export default function CommunicationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
