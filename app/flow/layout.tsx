import type { Metadata } from 'next';
import { ROUTE_COPY, pageMetadata } from '@/lib/seo';

const copy = ROUTE_COPY['/flow'];

export const metadata: Metadata = pageMetadata({
  ...copy,
  path: '/flow',
  languages: {
    'x-default': '/flow',
    en: '/flow',
    ru: '/flow',
  },
});

export default function FlowLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
