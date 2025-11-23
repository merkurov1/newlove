import { Suspense } from 'react'; // Импортируем Suspense
import LetItGoAngel from '@/components/LetItGoAngel';
import TempleNav from '@/components/TempleNav'; // Импортируем наш новый компонент
import './letitgo.css';

export const metadata = {
  title: 'Let the Heart Go | Merkurov',
  description: 'Interactive Digital Art. The Angel releases the burden.',
  openGraph: {
    title: 'Let the Heart Go',
    description: 'Interactive Digital Art. The Angel releases the burden.',
    url: 'https://merkurov.love/heartandangel/letitgo',
    type: 'website',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png',
        width: 1200,
        height: 1200,
        alt: 'Angel lets the heart go',
      },
    ],
  },
};

export default function LetItGoPage() {
  return (
    <div className="letitgo-container">
      {/* 
        Вставляем навигатор Храма. 
        Он сам проверит, зашли мы из Храма или просто так.
        Если просто так — он ничего не сделает.
        Если из Храма — скроет хедеры и добавит навигацию.
      */}
      <Suspense fallback={null}>
        <TempleNav />
      </Suspense>

      {/* Твой основной контент */}
      <LetItGoAngel />
    </div>
  );
}