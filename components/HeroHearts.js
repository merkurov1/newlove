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
      className={`relative w-full h-[26vh] min-h-[80px] max-h-[180px] flex flex-col items-center justify-center rounded-2xl overflow-hidden shadow-xl bg-gradient-to-br from-blue-50 via-white to-purple-100 py-7 px-2 md:h-[30vh] md:min-h-[100px] md:max-h-[220px] md:rounded-3xl md:py-12 md:px-6 text-center ${className}`}
      style={style}
    >
      <div className="relative z-10 flex flex-col items-center justify-center h-full text-center select-none">
        <h1 className="text-2xl md:text-5xl font-light tracking-wide text-gray-900 mb-1 md:mb-2">
          {title}
        </h1>
        <div className="text-xs md:text-lg text-gray-700 mb-1 md:mb-2 max-w-xs md:max-w-2xl mx-auto">
          {description}
        </div>
      </div>
    </section>
  );
}
