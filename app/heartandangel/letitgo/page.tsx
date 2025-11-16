import LetItGoAngel from '@/components/LetItGoAngel';
import './letitgo.css';

export const metadata = {
  title: 'Отпусти Сердце — Heart & Angel',
  description:
    'Интерактивная страница: ангел отпускает сердце. Кликайте на ангела и наблюдайте за анимацией!',
  openGraph: {
    title: 'Отпусти Сердце — Heart & Angel',
    description:
      'Интерактивная страница: ангел отпускает сердце. Кликайте на ангела и наблюдайте за анимацией!',
    url: '/heartandangel/letitgo',
    type: 'website',
    images: [
      {
        url: 'https://txvkqcitalfbjytmnawq.supabase.co/storage/v1/object/public/media/IMG_0919.png',
        width: 600,
        height: 600,
        alt: 'Ангел отпускает сердце',
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
