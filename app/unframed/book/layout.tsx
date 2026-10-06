import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: 'https://www.merkurov.love/unframed/book' },
};

export default function BookLayout({ children }: { children: React.ReactNode }) {
  return children;
}
