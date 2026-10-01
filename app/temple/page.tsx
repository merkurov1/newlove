import TempleClient from './TempleClient';

export const metadata = {
  title: 'Digital Sanctuary | Merkurov',
  description: 'Broadcast whispers, record voice notes, and observe live digital transmissions from the sanctuary.',
  openGraph: {
    title: 'Digital Sanctuary | Merkurov',
    description: 'Broadcast whispers, record voice notes, and observe live digital transmissions from the sanctuary.',
    url: 'https://merkurov.love/temple',
    type: 'website',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png',
        width: 1200,
        height: 1200,
        alt: 'Digital Sanctuary Temple Log',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Digital Sanctuary | Merkurov',
    description: 'Broadcast whispers, record voice notes, and observe live digital transmissions from the sanctuary.',
    images: ['https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png'],
  },
};

export default function TemplePage() {
  return <TempleClient />;
}
