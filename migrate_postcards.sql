-- Миграция: Добавление физических открыток и заказов
-- Выполните этот SQL код в Supabase SQL Editor

-- 1. Создание enum для статусов заказов (идемпотентно)
DO $$
BEGIN
  BEGIN
    CREATE TYPE "PostcardOrderStatus" AS ENUM (
      'PENDING',
      'PAID',
      'PROCESSING',
      'SHIPPED',
      'DELIVERED',
      'CANCELLED'
    );
  EXCEPTION WHEN duplicate_object THEN
    -- type already exists, ignore
    NULL;
  END;
END$$;

-- 2. Создание таблицы открыток
CREATE TABLE IF NOT EXISTS "postcards" (
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

CREATE TABLE IF NOT EXISTS "postcard_orders" (
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

-- Add foreign key postcard_orders.postcardId -> postcards.id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'postcard_orders_postcardId_fkey'
  ) THEN
    ALTER TABLE "postcard_orders" ADD CONSTRAINT "postcard_orders_postcardId_fkey"
      FOREIGN KEY ("postcardId") REFERENCES "postcards"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;

-- Add foreign key postcard_orders.userId -> User.id if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'postcard_orders_userId_fkey'
  ) THEN
    ALTER TABLE "postcard_orders" ADD CONSTRAINT "postcard_orders_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;

-- 5. Создание индексов для производительности
CREATE INDEX IF NOT EXISTS "postcard_orders_postcardId_idx" ON "postcard_orders"("postcardId");
CREATE INDEX IF NOT EXISTS "postcard_orders_userId_idx" ON "postcard_orders"("userId");
CREATE INDEX IF NOT EXISTS "postcard_orders_status_idx" ON "postcard_orders"("status");
CREATE INDEX IF NOT EXISTS "postcards_available_idx" ON "postcards"("available");
CREATE INDEX IF NOT EXISTS "postcards_featured_idx" ON "postcards"("featured");

-- 6. Добавление тестовых открыток (опционально)
-- Note: seed_test_data.sql provides a canonical seed; this block is left for reference but will not be executed by default to avoid duplicate inserts.
-- You can enable it manually if needed.
-- INSERT INTO "postcards" ("id", "title", "description", "image", "price", "available", "featured", "createdAt", "updatedAt") VALUES
--   ('postcard_1', 'Авторская открытка "Закат"', 'Уникальная открытка с авторским рисунком заката над городом', 'https://example.com/postcard1.jpg', 2900, true, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
--   ('postcard_2', 'Открытка "Минимализм"', 'Стильная минималистичная открытка в черно-белых тонах', 'https://example.com/postcard2.jpg', 2900, true, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

-- Готово! После выполнения этой миграции обновите Prisma schema командой:
-- npx prisma db pull
-- npx prisma generate