-- Пересоздаем таблицу articles с правильной структурой
-- Удаляем старую таблицу (если данных нет)
DROP TABLE IF EXISTS "articles" CASCADE;

-- Создаем новую таблицу с CUID и правильными типами
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "authorId" TEXT NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- Создаем уникальный индекс для slug
CREATE UNIQUE INDEX "articles_slug_key" ON "articles"("slug");

-- Добавляем внешний ключ к таблице пользователей
ALTER TABLE "articles" ADD CONSTRAINT "articles_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;