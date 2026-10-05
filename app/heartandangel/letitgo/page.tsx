import LetItGoAngel from '@/components/LetItGoAngel';

export const metadata = {
  title: 'Let It Go — Digital Temple',
  description: 'Release your burdens into the digital sky.',
  openGraph: {
    title: 'Let It Go — Digital Temple',
    description: 'Release your burdens into the digital sky.',
    url: 'https://merkurov.love/heartandangel/letitgo',
    siteName: 'Merkurov Love',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png',
        width: 800,
        height: 800,
        alt: 'Let It Go Angel',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Let It Go — Digital Temple',
    description: 'Release your burdens into the digital sky.',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png'],
  },
};

export default function Page() {
  return <LetItGoAngel />;
}
