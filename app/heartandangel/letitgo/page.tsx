import LetItGoAngel from '@/components/LetItGoAngel';
import './letitgo.css';

export const metadata = {
  title: 'Let the Heart Go — Heart & Angel',
  description:
    'Interactive page: the angel lets the heart go. Click the angel and watch the animation!',
  openGraph: {
    title: 'Let the Heart Go — Heart & Angel',
    description:
      'Interactive page: the angel lets the heart go. Click the angel and watch the animation!',
    url: '/heartandangel/letitgo',
    type: 'website',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png',
        width: 600,
        height: 600,
        alt: 'Angel lets the heart go',
      },
    ],
  },
};

export default function LetItGoPage() {
  return (
    <div className="letitgo-container">
      <LetItGoAngel />
    </div>
  );
}
