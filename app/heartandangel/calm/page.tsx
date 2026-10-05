import HeartPhysics from '@/components/HeartPhysics';

export const metadata = {
  title: 'Keep Calm — Digital Temple',
  description: 'Find your balance and maintain calm in the digital space.',
  openGraph: {
    title: 'Keep Calm — Digital Temple',
    description: 'Find your balance and maintain calm in the digital space.',
    url: 'https://merkurov.love/heartandangel/calm',
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
    <main>
      <HeartPhysics daemonUrl={daemonUrl} heartUrl={heartUrl} />
    </main>
  );
}
