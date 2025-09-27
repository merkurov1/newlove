import NextAuth from 'next-auth';
import { authOptions } from '@/lib/authOptions'; // <<< Импортируем из нового файла

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
