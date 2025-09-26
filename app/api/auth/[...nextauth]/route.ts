// app/api/auth/[...nextauth]/route.ts (ИСПРАВЛЕНО)

// Импортируем наш созданный handler из lib/auth.ts
import { handler } from "@/lib/auth";

// Экспортируем handler для роутов GET и POST
export { handler as GET, handler as POST };

