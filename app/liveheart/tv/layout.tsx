import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: 'https://www.merkurov.love/liveheart/tv' },
};

export default function LiveHeartTvLayout({ children }: { children: React.ReactNode }) {
  return children;
}
