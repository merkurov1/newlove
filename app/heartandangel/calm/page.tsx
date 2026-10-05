import type { Metadata } from 'next';
import HeartPhysics from '@/components/HeartPhysics';

export const metadata: Metadata = {
  title: 'Keep Calm — Digital Temple',
  description: 'Keep Calm is an interactive digital ritual for slowing down, finding balance and holding a fragile heart in motion.',
  alternates: { canonical: 'https://www.merkurov.love/heartandangel/calm' },
  openGraph: {
    title: 'Keep Calm — Digital Temple',
    description: 'Find your balance and maintain calm in the digital space.',
    url: 'https://www.merkurov.love/heartandangel/calm',
    siteName: 'Merkurov Love',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Heart1.png',
        width: 800,
        height: 800,
        alt: 'Keep Calm Heart & Daemon',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Keep Calm — Digital Temple',
    description: 'Find your balance and maintain calm in the digital space.',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Heart1.png'],
  },
};

export default function Page() {
  const daemonUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Daemon.png';
  const heartUrl = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/Heart1.png';

  return (
    <main aria-labelledby="calm-title">
      <section className="sr-only">
        <h1 id="calm-title">Keep Calm</h1>
        <p>Hold the heart gently, breathe and find a moment of calm inside the Heart &amp; Angel world.</p>
      </section>
      <HeartPhysics daemonUrl={daemonUrl} heartUrl={heartUrl} />
    </main>
  );
}
