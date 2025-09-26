// app/api/auth/[...nextauth]/route.ts (ФИНАЛЬНО ИСПРАВЛЕННЫЙ РОУТ)

// Важно: в v5 (beta) мы используем `Auth` как функцию, которая возвращает обработчик.
import NextAuth from "next-auth"; // Это импорт функции, а не конструктора NextAuth
import { authConfig } from "@/lib/auth"; // Импортируем только объект конфигурации

// Создаем обработчик на основе конфигурации. 
// Next.js автоматически вызывает его для GET и POST.
const handler = NextAuth(authConfig);

// Экспортируем handler как GET и POST. Next.js и TypeScript должны 
// принять этот паттерн для NextAuth v5.
export { handler as GET, handler as POST };

// Обратите внимание: функция auth() в lib/auth.ts теперь используется
// только для получения сессии на стороне сервера, а не для обработки роутов.

