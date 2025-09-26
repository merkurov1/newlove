// app/api/auth/[...nextauth]/route.ts (ФИНАЛЬНОЕ ИСПРАВЛЕНИЕ ТИПОВ)

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth"; // Импортируем только объект конфигурации
import { NextRequest } from "next/server"; // Добавляем импорт для типизации запроса

// 1. Создаем обработчик NextAuthHandler.
// ВАЖНО: Приводим тип к 'any', чтобы избежать ошибки конфликта типов v5/v15.
const NextAuthHandler = NextAuth(authConfig) as any; 

// 2. Явно экспортируем функции GET и POST, вызывая обработчик.
// Это удовлетворяет типизации Next.js v15.

export async function GET(req: NextRequest, ctx: any) {
    return NextAuthHandler(req, ctx);
}

export async function POST(req: NextRequest, ctx: any) {
    return NextAuthHandler(req, ctx);
}

