import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: 'https://www.merkurov.love/roles-demo' },
  robots: { index: false, follow: false },
};

export default function RolesDemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
