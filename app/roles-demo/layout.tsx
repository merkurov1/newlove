import type { Metadata } from 'next';

export const metadata: Metadata = {
  alternates: { canonical: 'https://www.merkurov.love/roles-demo' },
};

export default function RolesDemoLayout({ children }: { children: React.ReactNode }) {
  return children;
}
