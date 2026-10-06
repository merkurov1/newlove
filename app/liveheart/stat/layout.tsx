import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: 'https://www.merkurov.love/liveheart/stat' },
};

export default function LiveHeartStatsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
