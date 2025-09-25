// app/api/articles/auth/[...nextauth]/route.ts

import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth"; // Импортируем нашу конфигурацию

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
