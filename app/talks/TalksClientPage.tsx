'use client';

import LoungeInterface from "@/components/LoungeInterface";
import type { Session } from 'next-auth';

// Определяем тип для сообщений, который теперь СОВПАДАЕТ с данными от Prisma
type InitialMessage = {
  id: string; // 👈 ИСПРАВЛЕНО: ID теперь string, как в базе данных
  createdAt: Date;
  content: string;
  userId: string;
  user: { // 👈 ИСПРАВЛЕНО: поле теперь называется "user", а не "author"
    name: string | null; 
    image: string | null 
  };
};

// Тип для props, которые приходят с сервера
type Props = {
  initialMessages: InitialMessage[];
  session: Session | null;
};

export default function TalksClientPage({ initialMessages, session }: Props) {
  // Просто "пробрасываем" полученные props дальше в компонент интерфейса
  return (
    <LoungeInterface 
      initialMessages={initialMessages} 
      session={session} 
    />
  );
}
