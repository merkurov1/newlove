// app/api/messages/route.ts

import { authOptions } from "@/lib/auth";
import { PrismaClient } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

const prisma = new PrismaClient();

export async function POST(request: Request) {
  // 1. Получаем сессию на сервере, чтобы узнать, кто отправляет сообщение
  const session = await getServerSession(authOptions);

  // 2. Если сессии нет, возвращаем ошибку
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 3. Получаем текст сообщения из тела запроса
  const { content } = await request.json();
  if (!content) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }

  try {
    // 4. Создаем новое сообщение в базе данных с помощью Prisma
    await prisma.message.create({
      data: {
        content: content,
        userId: session.user.id, // Связываем сообщение с текущим пользователем
      },
    });

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    console.error("Error creating message:", error);
    return NextResponse.json({ error: "Failed to create message" }, { status: 500 });
  }
}
