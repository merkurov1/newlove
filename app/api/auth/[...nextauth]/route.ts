// app/api/auth/[...nextauth]/route.ts (ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ ВЫЗОВА)

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth"; // Импортируем только объект конфигурации
import { NextRequest } from "next/server"; // Добавляем импорт для типизации запроса

// Важно: NextAuth нужно вызывать с конфигурацией. 
// Мы создадим функцию, которая будет создавать и вызывать обработчик для каждого роута.

const handler = (req: NextRequest | Request, ctx: any) => {
    // В отличие от v4, в v5 (beta) обработчик вызывается один раз.
    // Если NextAuthHandler - это объект (что и произошло), то мы не можем его вызвать.
    
    // Временное решение: вызываем NextAuth прямо здесь, 
    // чтобы создать "горячий" обработчик, который можно вызвать.
    return NextAuth(authConfig)(req, ctx);
};

// Явно экспортируем функции GET и POST.
export async function GET(req: NextRequest, ctx: any) {
    return handler(req, ctx);
}

export async function POST(req: NextRequest, ctx: any) {
    return handler(req, ctx);
}

