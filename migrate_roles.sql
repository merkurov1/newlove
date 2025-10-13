-- Миграция для добавления новых ролей пользователей
-- Выполнить в Supabase SQL Editor

-- Create Role_new enum idempotently
DO $$
BEGIN
  BEGIN
    CREATE TYPE "Role_new" AS ENUM (
      'USER',
      'ADMIN', 
      'SUBSCRIBER',
      'PATRON',
      'PREMIUM',
      'SPONSOR'
    );
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;
END$$;

-- 2. Добавляем временную колонку с новым типом (если ещё нет)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role_new" "Role_new";

-- 3. Копируем данные из старой колонки в новую, только если старый столбец существует
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'role') THEN
    UPDATE "User" SET "role_new" = "role"::text::"Role_new";
  ELSE
    -- Если старой колонки нет, возможно миграция уже применялась
    RAISE NOTICE 'Column "role" not found on "User" — skipping copy step.';
  END IF;
END $$;

-- 4. Устанавливаем роль ADMIN для merkurov@gmail.com
UPDATE "User" SET "role_new" = 'ADMIN' WHERE email = 'merkurov@gmail.com';

-- 5/6. Заменяем старую колонку на новую, только если старая колонка существует
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'role') THEN
    ALTER TABLE "User" DROP COLUMN "role";
    ALTER TABLE "User" RENAME COLUMN "role_new" TO "role";
  ELSE
    -- Удаляем временную колонку, если уже всё в порядке
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'User' AND column_name = 'role_new') THEN
      ALTER TABLE "User" RENAME COLUMN "role_new" TO "role";
    END IF;
  END IF;
END $$;

-- 7. Устанавливаем DEFAULT значение
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';

-- 8. Добавляем NOT NULL ограничение
ALTER TABLE "User" ALTER COLUMN "role" SET NOT NULL;

-- 9. Удаляем старый enum (если есть)
DROP TYPE IF EXISTS "Role";

-- 10. Переименовываем новый enum, если он существует
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'role_new') THEN
    ALTER TYPE "Role_new" RENAME TO "Role";
  END IF;
END $$;

-- Проверка результата:
SELECT email, role FROM "User" ORDER BY role;

-- Вы должны увидеть:
-- merkurov@gmail.com | ADMIN
-- другие пользователи | USER или ADMIN