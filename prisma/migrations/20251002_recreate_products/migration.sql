-- Пересоздаем таблицу Product с правильной структурой
-- Удаляем старую таблицу (данных нет, так что безопасно)
DROP TABLE IF EXISTS "Product" CASCADE;

-- Создаем новую таблицу с CUID и правильными типами
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "description" TEXT,
    "image" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- Создаем уникальный индекс для slug
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");