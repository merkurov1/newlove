-- Миграция: Добавление физических открыток и заказов
-- Выполните этот SQL код в Supabase SQL Editor

-- 1. Создание enum для статусов заказов
CREATE TYPE "PostcardOrderStatus" AS ENUM (
  'PENDING',
  'PAID', 
  'PROCESSING',
  'SHIPPED',
  'DELIVERED',
  'CANCELLED'
);

-- 2. Создание таблицы открыток
CREATE TABLE "postcards" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "image" TEXT NOT NULL,
  "price" INTEGER NOT NULL,
  "available" BOOLEAN NOT NULL DEFAULT true,
  "featured" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  
  CONSTRAINT "postcards_pkey" PRIMARY KEY ("id")
);

-- 3. Создание таблицы заказов открыток
CREATE TABLE "postcard_orders" (
  "id" TEXT NOT NULL,
  "postcardId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "recipientName" TEXT NOT NULL,
  "address" TEXT NOT NULL,
  "city" TEXT NOT NULL,
  "postalCode" TEXT NOT NULL,
  "country" TEXT NOT NULL DEFAULT 'Russia',
  "phone" TEXT,
  "customMessage" TEXT,
  "status" "PostcardOrderStatus" NOT NULL DEFAULT 'PENDING',
  "stripePaymentIntentId" TEXT,
  "amount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "shippedAt" TIMESTAMP(3),
  "deliveredAt" TIMESTAMP(3),
  
  CONSTRAINT "postcard_orders_pkey" PRIMARY KEY ("id")
);

-- 4. Добавление внешних ключей
ALTER TABLE "postcard_orders" ADD CONSTRAINT "postcard_orders_postcardId_fkey" 
  FOREIGN KEY ("postcardId") REFERENCES "postcards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "postcard_orders" ADD CONSTRAINT "postcard_orders_userId_fkey" 
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 5. Создание индексов для производительности
CREATE INDEX "postcard_orders_postcardId_idx" ON "postcard_orders"("postcardId");
CREATE INDEX "postcard_orders_userId_idx" ON "postcard_orders"("userId");
CREATE INDEX "postcard_orders_status_idx" ON "postcard_orders"("status");
CREATE INDEX "postcards_available_idx" ON "postcards"("available");
CREATE INDEX "postcards_featured_idx" ON "postcards"("featured");

-- 6. Добавление тестовых открыток (опционально)
INSERT INTO "postcards" ("id", "title", "description", "image", "price", "available", "featured", "updatedAt") VALUES
  ('postcard_1', 'Авторская открытка "Закат"', 'Уникальная открытка с авторским рисунком заката над городом', 'https://example.com/postcard1.jpg', 50000, true, true, CURRENT_TIMESTAMP),
  ('postcard_2', 'Открытка "Минимализм"', 'Стильная минималистичная открытка в черно-белых тонах', 'https://example.com/postcard2.jpg', 35000, true, false, CURRENT_TIMESTAMP);

-- Готово! После выполнения этой миграции обновите Prisma schema командой:
-- npx prisma db pull
-- npx prisma generate