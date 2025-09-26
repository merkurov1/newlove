// app/talks/TalksClientPage.tsx
'use client';

import LoungeInterface from "@/components/LoungeInterface";
import type { Session } from 'next-auth';

// Определяем тип для сообщений, который должен совпадать с типом в LoungeInterface
type InitialMessage = {
  id: number;
  createdAt: Date;
  content: string;
  userId: string;
  author: { name: string | null; image: string | null };
};

// Определяем тип для props, которые приходят с сервера
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
