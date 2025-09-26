// app/talks/page.tsx (Серверный компонент)

import LoungeInterface from "@/components/LoungeInterface";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

const prisma = new PrismaClient();

// Эта функция будет выполнена на сервере при загрузке страницы
async function getMessages() {
  const messages = await prisma.message.findMany({
    orderBy: {
      createdAt: "asc",
    },
    // Включаем данные автора в запрос
    include: {
      author: {
        select: {
          name: true,
          image: true,
        },
      },
    },
    take: 50, // Ограничим количество начальных сообщений
  });
  return messages;
}

export default async function TalksPage() {
  // Получаем начальные сообщения и сессию на сервере
  const initialMessages = await getMessages();
  const session = await getServerSession(authOptions);

  // Передаем их в клиентский компонент как пропсы
  return <LoungeInterface initialMessages={initialMessages} session={session} />;
}
