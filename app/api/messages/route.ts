// app/api/messages/route.ts (ФИНАЛЬНАЯ ВЕРСИЯ)

import prisma from "@/lib/prisma";
// ИМПОРТ ИЗ НАШЕГО ФАЙЛА-ОБЕРТКИ:
import { auth } from "@/lib/auth"; 
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  // Используем нашу функцию auth()
  const session = await auth(); 
  
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
        userId: session.user.id as string, 
      },
    });
    return NextResponse.json(newMessage, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: "Failed to create message" }, { status: 500 });
  }
}

