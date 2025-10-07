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
      className={`relative w-full h-[50vh] min-h-[320px] max-h-[520px] flex flex-col items-center justify-center rounded-3xl overflow-hidden shadow-xl bg-gradient-to-br from-pink-50 via-white to-rose-50 px-4 md:px-12 text-center ${className}`}
      style={style}
    >
      <div className="relative z-10 flex flex-col items-center justify-center h-full text-center select-none">
        <h1 className="text-3xl md:text-5xl font-extrabold tracking-tight text-gray-900 mb-4 drop-shadow-lg">
          {title}
        </h1>
        <div className="text-base md:text-xl text-gray-700 mb-6 max-w-2xl mx-auto drop-shadow">
          {description}
        </div>
      </div>
      {/* Scroll indicator */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center opacity-80">
        <div className="w-6 h-6 rounded-full border-2 border-pink-300 flex items-center justify-center animate-bounce">
          <svg width="16" height="16" fill="none" stroke="#FF69B4" strokeWidth="2" viewBox="0 0 24 24"><path d="M12 5v14M19 12l-7 7-7-7"/></svg>
        </div>
        <span className="text-xs text-pink-400 mt-1">Scroll</span>
      </div>
    </section>
  );
}
