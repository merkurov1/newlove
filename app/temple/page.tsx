import TempleClient from './TempleClient';

const DESCRIPTION =
  'Broadcast whispers, record voice notes, and watch the live log of rituals in the Digital Temple.';
const IMAGE = 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png';

export const metadata = {
  title: 'Digital Temple | Merkurov',
  description: DESCRIPTION,
  // Без этого страница наследует canonical главной из layout и выпадает из индекса.
  // Хост — www, потому что сайт редиректит на него.
  alternates: {
    canonical: 'https://www.merkurov.love/temple',
  },
  openGraph: {
    title: 'Digital Temple | Merkurov',
    description: DESCRIPTION,
    url: 'https://www.merkurov.love/temple',
    type: 'website',
    images: [
      {
        url: IMAGE,
        width: 1200,
        height: 1200,
        alt: 'Digital Temple log',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Digital Temple | Merkurov',
    description: DESCRIPTION,
    images: [IMAGE],
  },
};

export default function TemplePage() {
  return <TempleClient />;
}
