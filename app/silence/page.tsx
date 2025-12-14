import dynamic from 'next/dynamic';

export const metadata = {
  title: 'Silence Index | Merkurov Private Office',
  description:
    'The Silence Index — a composite tracking Heritage vs Noise (Gold, Hermes vs BTC, NVDA). Interactive chart and brief analysis.',
};

const SilenceClient = dynamic(() => import('@/components/SilenceClient'), { ssr: false });

export default function Page() {
  return <SilenceClient />;
}