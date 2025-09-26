// app/talks/page.tsx

import TalksClientPage from "./TalksClientPage"; // Импортируем клиентский компонент
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";

// Функция для получения данных на сервере
async function getData() {
  const session = await getServerSession(authOptions);
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
      session={session} 
    />
  );
}
