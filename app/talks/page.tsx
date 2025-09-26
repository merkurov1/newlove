// app/talks/page.tsx (ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ)

import TalksClientPage from "./TalksClientPage"; 
import prisma from "@/lib/prisma";
// ИСПРАВЛЕНО: Импортируем auth из нашего файла lib/auth.ts
import { auth } from "@/lib/auth"; 

async function getData() {
  // Используем auth()
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

