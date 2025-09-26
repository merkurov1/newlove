// app/talks/page.tsx (ИСПРАВЛЕНО)

import TalksClientPage from "./TalksClientPage"; 
// import { authOptions } from "@/lib/auth"; // Не нужно, если не используется явно
import prisma from "@/lib/prisma";
// V5 (beta) требует импорта 'auth' для получения сессии на стороне сервера
import { auth } from "@auth/nextjs/server"; 

// Функция для получения данных на сервере
async function getData() {
  // Используем auth() для получения сессии в Server Component
  const session = await auth(); 
  
  const initialMessages = await prisma.message.findMany({
    orderBy: { createdAt: "asc" },
    include: { author: { select: { name: true, image: true } } },
    take: 100,
  });
  return { initialMessages, session };
}

export default async function TalksPage() {
  const { initialMessages, session } = await getData();

  // Передаем полученные данные в клиентский компонент как props
  return (
    <TalksClientPage 
      initialMessages={initialMessages} 
      // Сессия передаётся дальше
      session={session} 
    />
  );
}
