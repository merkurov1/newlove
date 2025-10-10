"use client";
import { useSession } from 'next-auth/react';

export default function HeroHearts({ className = "", style }) {
  const { data: session, status } = useSession();

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
      className={`relative w-full flex flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-blue-50/80 via-white/90 to-purple-100/80 backdrop-blur-md shadow-lg rounded-2xl md:rounded-3xl px-4 py-8 md:py-16 my-4 md:my-8 text-center ${className}`}
      style={style}
    >
      <div className="relative z-10 flex flex-col items-center justify-center w-full max-w-3xl mx-auto gap-4 select-none">
        <h1
          className="font-extrabold text-gray-900 tracking-tight"
          style={{
            fontSize: 'clamp(2.1rem, 6vw, 3.5rem)',
            lineHeight: 1.1,
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
            fontSize: 'clamp(1.05rem, 2.8vw, 1.45rem)',
            maxWidth: '38rem',
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
