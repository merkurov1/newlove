// app/talks/page.tsx (ФИНАЛЬНАЯ ВЕРСИЯ)

import TalksClientPage from "./TalksClientPage"; 
import prisma from "@/lib/prisma";
// ИМПОРТ ИЗ НАШЕГО ФАЙЛА-ОБЕРТКИ:
import { auth } from "@/lib/auth"; 

async function getData() {
  // Используем нашу функцию auth()
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

  return (
    <TalksClientPage 
      initialMessages={initialMessages} 
      session={session} 
    />
  );
}

