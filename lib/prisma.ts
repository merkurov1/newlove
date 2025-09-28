import { PrismaClient } from '@prisma/client';

// Эта конструкция помогает TypeScript работать с глобальными переменными
const globalForPrisma = global as unknown as {
  prisma: PrismaClient | undefined;
};

// Создаем или используем существующий экземпляр Prisma
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    // Включаем логирование запросов только в режиме разработки
    log:
      process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

// В продакшене `globalForPrisma.prisma` не будет перезаписываться,
// так как модуль инициализируется один раз. В разработке это
// предотвращает создание новых подключений при каждом hot-reload.
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

export default prisma;

