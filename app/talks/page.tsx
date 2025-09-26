// app/talks/page.tsx (ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ)

import TalksClientPage from "./TalksClientPage"; 
import prisma from "@/lib/prisma";
// ИСПРАВЛЕНО: Вместо @auth/nextjs/server используем прямой импорт из next-auth
import { auth } from "next-auth"; 

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
