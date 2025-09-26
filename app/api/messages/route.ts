// app/api/messages/route.ts (ИСПРАВЛЕНО)

// Импортируем authOptions, если они нужны для других целей, но для сессии
// в v5 нам нужна функция auth.
// import { authOptions } from "@/lib/auth"; // Оставим пока на всякий случай
import prisma from "@/lib/prisma";
// V5 (beta) требует импорта 'auth' для получения сессии на стороне сервера
import { auth } from "@auth/nextjs/server"; 
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // Используем функцию auth() для получения сессии в Route Handler
  const session = await auth(); 
  
  // Проверка сессии остаётся прежней, но используем данные, 
  // возвращаемые функцией auth()
  if (!session?.user?.id) { 
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  const { content } = await request.json();
  if (!content) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }
  try {
    const newMessage = await prisma.message.create({
      data: {
        content: content,
        // session.user.id может не существовать в типе, 
        // поэтому нужно убедиться, что тип юзера соответствует
        userId: session.user.id as string, 
      },
    });
    return NextResponse.json(newMessage, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create message" }, { status: 500 });
  }
}
