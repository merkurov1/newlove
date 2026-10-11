import dynamic from 'next/dynamic';
import { sanitizeMetadata } from '@/lib/metadataSanitize';

export const metadata = sanitizeMetadata({
  alternates: { canonical: 'https://www.merkurov.love/silence' },
  title: 'Silence Index | Merkurov Private Office',
  description:
    'The Silence Index — a composite tracking Heritage vs Noise (Gold, Hermes vs BTC, NVDA). Interactive chart and brief analysis.',
  openGraph: {
    title: 'Silence Index | Merkurov Private Office',
    description:
      'The Silence Index — a composite tracking Heritage vs Noise (Gold, Hermes vs BTC, NVDA).',
    url: 'https://www.merkurov.love/silence',
    siteName: 'Anton Merkurov',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Silence Index | Merkurov Private Office',
    description:
      'The Silence Index — a composite tracking Heritage vs Noise (Gold, Hermes vs BTC, NVDA).',
  },
});

const SilenceClient = dynamic(() => import('@/components/SilenceClient'), { ssr: false });

export default function Page() {
  return <SilenceClient />;
}
