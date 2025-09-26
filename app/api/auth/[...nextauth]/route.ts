// app/api/auth/[...nextauth]/route.ts (ПОДТВЕРЖДЕННАЯ ВЕРСИЯ)

import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth"; 
import { NextRequest } from "next/server"; 

// 1. Создаем обработчик NextAuthHandler с приведением типа 'any'.
const NextAuthHandler = NextAuth(authConfig) as any; 

// 2. Явно экспортируем функции GET и POST.
export async function GET(req: NextRequest, ctx: any) {
    return NextAuthHandler(req, ctx);
}

export async function POST(req: NextRequest, ctx: any) {
    return NextAuthHandler(req, ctx);
}

