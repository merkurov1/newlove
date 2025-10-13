-- Миграция для добавления новых ролей пользователей
-- Выполнить в Supabase SQL Editor

-- 1. Создаем новый enum с расширенным списком ролей
CREATE TYPE "Role_new" AS ENUM (
  'USER',
  'ADMIN', 
  'SUBSCRIBER',
  'PATRON',
  'PREMIUM',
  'SPONSOR'
);

-- 2. Добавляем временную колонку с новым типом
ALTER TABLE "User" ADD COLUMN "role_new" "Role_new";

-- 3. Копируем данные из старой колонки в новую
UPDATE "User" SET "role_new" = "role"::text::"Role_new";

-- 4. Устанавливаем роль ADMIN для merkurov@gmail.com
UPDATE "User" SET "role_new" = 'ADMIN' WHERE email = 'merkurov@gmail.com';

-- 5. Удаляем старую колонку
ALTER TABLE "User" DROP COLUMN "role";

-- 6. Переименовываем новую колонку
ALTER TABLE "User" RENAME COLUMN "role_new" TO "role";

-- 7. Устанавливаем DEFAULT значение
ALTER TABLE "User" ALTER COLUMN "role" SET DEFAULT 'USER';

-- 8. Добавляем NOT NULL ограничение
ALTER TABLE "User" ALTER COLUMN "role" SET NOT NULL;

-- 9. Удаляем старый enum
DROP TYPE "Role";

-- 10. Переименовываем новый enum
ALTER TYPE "Role_new" RENAME TO "Role";

-- Проверка результата:
SELECT email, role FROM "User" ORDER BY role;

-- Вы должны увидеть:
-- merkurov@gmail.com | ADMIN
-- другие пользователи | USER или ADMIN