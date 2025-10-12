"use client";
import useSupabaseSession from '@/hooks/useSupabaseSession';

export default function HeroHearts({ className = "", style }) {
  const { session, status } = useSupabaseSession();

  // Определяем вариант hero
  let title = 'Добро пожаловать в мир медиа и технологий';
  let description = 'Исследуем пересечение искусства, любви и денег в цифровую эпоху. Зарегистрируйтесь, чтобы получить доступ к эксклюзивным материалам и закрытому сообществу.';
  if (session?.user?.role === 'ADMIN') {
    title = 'Панель администратора';
    description = 'Добро пожаловать в круг близких! Вам открыты все публикации, включая личные истории и творческие эксперименты. Впереди — запуск закрытого сообщества и новые проекты.';
  } else if (session?.user) {
    title = 'Добро пожаловать в круг близких!';
    description = 'Вам открыты все публикации, включая личные истории и творческие эксперименты. Впереди — запуск закрытого сообщества и новые проекты. Остаемся на связи.';
  }

  return (
    <section
      className={`w-full flex flex-col items-center justify-center overflow-hidden text-center ${className}`}
      style={{
        ...style,
        padding: 0,
        margin: 0,
        borderRadius: 0,
        boxShadow: 'none',
        background: 'linear-gradient(120deg, #f8f6f2 0%, #f3e9f7 100%)',
        maxWidth: '100vw',
        overflowX: 'hidden',
      }}>
      <div className="w-full flex flex-col items-center justify-center select-none" style={{maxWidth:'100vw', padding:'64px 0 48px 0'}}>
        <h1
          className="font-extrabold text-gray-900 tracking-tight"
          style={{
            fontSize: 'clamp(2.5rem, 7vw, 4.5rem)',
            lineHeight: 1.08,
            letterSpacing: '-0.01em',
            marginBottom: '0.5em',
            marginTop: 0,
          }}
        >
          {title}
        </h1>
        <div
          className="text-gray-700 font-medium"
          style={{
            fontSize: 'clamp(1.15rem, 2.8vw, 1.65rem)',
            maxWidth: '44rem',
            margin: '0 auto',
            lineHeight: 1.5,
            opacity: 0.92,
          }}
        >
          {description}
        </div>
      </div>
    </section>
  );
}
