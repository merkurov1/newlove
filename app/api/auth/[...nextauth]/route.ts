// app/api/auth/[...nextauth]/route.ts (ФИНАЛЬНО ИСПРАВЛЕННЫЙ РОУТ)

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth"; // Импортируем только объект конфигурации

// Создаем обработчик NextAuth из нашей конфигурации
const NextAuthHandler = NextAuth(authConfig);

// Явно экспортируем функции GET и POST, как того требует Next.js v15
// (используем Request и Response из 'next/server', которые совместимы с NextAuthHandler)
export async function GET(req: Request, ctx: any) {
    return NextAuthHandler(req, ctx);
}

export async function POST(req: Request, ctx: any) {
    return NextAuthHandler(req, ctx);
}

