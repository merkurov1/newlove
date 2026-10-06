import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: 'https://www.merkurov.love/tribute' },
};

export default function TributeLayout({ children }: { children: React.ReactNode }) {
  return children;
}
