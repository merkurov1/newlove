# newlove — локальные операции и миграции

Кратко: в этой ветке выполнена миграция на Supabase + Onboard, добавлены утилиты для безопасного применения SQL-скриптов, дампы таблиц и вспомогательные скрипты для восстановления данных.

Важно: все действия выполнены локально. Я создал локальный snapshot-коммит и не выполнял push в remote (по вашему требованию).

## Полезные скрипты

- `scripts/run-sql.js` — унифицированный раннер для исполнения SQL-файлов с подтверждением перед опасными операциями (поддерживает `AUTO_YES=1` для non-interactive).
- `scripts/dump-tables.js` — делает CSV и SQL дампы таблиц `articles` и `letters` в папке `dumps/`.
- `scripts/import-dumps.js` — безопасно импортирует `dumps/articles.sql` и `dumps/letters.sql`, преобразует timestamp и пропускает дубликаты.
- `scripts/find-admin.js` — находит подходящий `User.id` (использовался для seed).

Примеры запуска:

```bash
# Прогнать линтер
npm run lint

# Прогнать production build (делает тайпчек)
NODE_OPTIONS=--max-old-space-size=6144 SKIP_SENTRY=1 DISABLE_OPTIMIZE_CSS=1 npm run build

# Применить набор миграций интерактивно
node scripts/run-sql.js migrate_roles.sql migrate_letters_fix.sql ...

# Применить миграции без подтверждений
AUTO_YES=1 node scripts/run-sql.js migrate_roles.sql migrate_letters_fix.sql ...

# Создать дампы
node scripts/dump-tables.js

# Импортировать дампы обратно
node scripts/import-dumps.js
```

## Переменные окружения

Файл `.env` должен содержать как минимум:

- `DATABASE_URL` — Postgres connection string (используется `pg` в скриптах)
- `SUPABASE_URL` и `SUPABASE_SERVICE_ROLE_KEY` — для работы с Supabase в рантайме (если нужно)

Не коммитите секреты в публичные репозитории. В `docs/SECRET_ROTATION.md` есть заметки по ротации ключей.

## Безопасность миграций

- Скрипты и миграции были сделаны более идемпотентными: `CREATE TYPE` обернут в DO/EXCEPTION, `CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING` для seed.
- `scripts/run-sql.js` умеет запрашивать подтверждение перед DROP/DELETE; для автоматического выполнения установите `AUTO_YES=1`.
- Я заранее сделал дампы `articles` и `letters` в `dumps/` перед destructive-операциями.

## Что сделано локально

- Применены миграции: roles, letters, postcards (с исправлениями), articles (recreate), fix id type, seed (с upsert-логикой).
- Дампнуты `articles` и `letters`, затем восстановлены из `dumps/`.
- Локальный snapshot-коммит создан и локальная ветка `main` указывает на него.

## Следующие шаги

- Обсудить и утвердить стратегию для CI/Prisma (workflow: оставить условную проверку schema или добавить реальный `prisma/schema.prisma`).
- При необходимости я могу подготовить zip архива `dumps/` для скачивания или отправить дампы в безопасное хранилище по вашему указанию.

Если нужно — могу автоматически привести остальные миграции к единому идемпотентному стилю и добавить `README` секцию с подробным порядком выполнения миграций для продакшн-руна.

---
Файлы с инструкциями и скриптами находятся в корне репозитория. Если хотите — начну работу над CI/Prisma (обновление workflow) или упакую `dumps/` в zip.

# merkurov.love — Современный блог/портал с интеграциями

Многофункциональный сайт на Next.js 14 с поддержкой:
- 🦋 Bluesky (AT Protocol) интеграции
- Medium RSS-ленты
- YouTube Shorts
- Проектов с Editor.js (Notion-style)
- Адаптивного дизайна на TailwindCSS
- Supabase Auth, Prisma ORM, Sentry, Supabase Storage

## 🚀 Быстрый старт

```bash
git clone https://github.com/merkurov1/newlove.git
cd newlove
npm install
cp .env.example .env.local # настройте переменные окружения
npm run dev
```

Откройте [http://localhost:3000](http://localhost:3000)

## 🗂️ Структура проекта

```
├── app/                # Next.js App Router, страницы и API
│   ├── api/            # Серверные endpoints (Bluesky, Medium, YouTube, проекты, статьи)
│   ├── admin/          # Админка (редактирование, проекты, письма)
│   ├── projects/       # Публичные проекты
│   ├── articles/       # Статьи
│   ├── profile/        # Профиль пользователя
│   └── ...
├── components/         # UI-компоненты (Feed, Editor, Auth, BlockRenderer и др.)
├── lib/                # Утилиты, API, Prisma, Supabase
├── prisma/             # Prisma schema и миграции
├── public/             # Статика и загруженные файлы
├── scripts/            # Скрипты миграций и вспомогательные
├── types/              # Типы TypeScript
├── docs/               # Документация по интеграциям
├── ...
```

## 🛠️ Технологии

- **Next.js 14** (App Router, SSR, API routes)
- **Prisma ORM** + PostgreSQL
- **Supabase** (Auth, Storage)
- **TailwindCSS** (адаптивный дизайн)
- **Editor.js** (блоковый редактор для проектов)
- **Sentry** (мониторинг)
- **node-fetch**, **rss-parser** (OG preview, Medium)
- **@atproto/api** (Bluesky)

## 📦 Основные фичи

- Универсальная лента (Flow): Bluesky, Medium, YouTube — с OG превью
- Проекты с Editor.js (Notion-style)
- Аутентификация через Supabase
- Адаптивный UI (Tailwind)
- Админка для управления контентом
- Загрузка изображений (Supabase Storage или локально)
- Интеграция Sentry для мониторинга

## 🦋 Bluesky интеграция
- Получение и публикация постов через AT Protocol
- OG preview для ссылок в постах
- Демо: `/lab/bluesky`

## 📝 Medium интеграция
- RSS-парсинг, превью, категории, время чтения
- Демо: `/lab/medium`

## 🎬 YouTube Shorts интеграция
- Получение последних Shorts, превью, статистика
- Демо: `/lab/youtube`

## 🏗️ Проекты с Editor.js
- Блоковый редактор (текст, списки, изображения, код)
- Публичные страницы `/projects/[slug]`
- Админка `/admin/projects/edit/[id]`

## ⚙️ Миграции и деплой
- Prisma миграции: `npx prisma migrate dev` (локально), `npx prisma migrate deploy` (Vercel)
- Все переменные окружения — в `.env.local`

## 📄 Документация
- [Bluesky интеграция](docs/BLUESKY-INTEGRATION-COMPLETE.md)
- [Medium интеграция](docs/MEDIUM-INTEGRATION-COMPLETE.md)
- [Архитектура Edit Button](docs/EDIT-BUTTON-ARCHITECTURE.md)
- [Миграции на Vercel](VERCEL_PRISMA_MIGRATION.md)

---

**Автор:** [@merkurov](https://merkurov.love) — Fork, contribute, enjoy!



## Projects Block Editor (Notion-style)

### Как работает
- В админке `/admin/projects/edit/[id]` используется Editor.js с поддержкой блоков: текст, список, заголовок, изображение, код.
- Контент сохраняется в формате JSON (Editor.js OutputData) в поле `content` модели Project.
- Для загрузки изображений используется API `/api/upload` (загружает в `/public/uploads`).
- Публичная страница `/projects/[slug]` рендерит блоки через компоненты `BlockRenderer` и отдельные блоки.

### Как добавить проект
1. Создайте проект через API или напрямую в базе (укажите title, slug, authorId).
2. Перейдите в `/admin/projects/edit/[id]` для наполнения контентом.
3. Сохраняйте — данные отправляются в API и сохраняются в JSON.

### Загрузка изображений
- Файлы сохраняются в `/public/uploads` (локально). На проде рекомендуется интеграция с Supabase Storage или S3.
- API `/api/upload` принимает POST с FormData (ключ image).

### Требования
- Node.js >= 18
- Переменная окружения `DATABASE_URL` для Prisma/Supabase

### Установка зависимостей
```bash
npm install @editorjs/editorjs @editorjs/header @editorjs/list @editorjs/image @editorjs/code
```

### Миграции Prisma
- На Vercel миграции применяются автоматически (см. VERCEL_PRISMA_MIGRATION.md)
- Локально: `npx prisma db push` или `npx prisma migrate dev`

---


This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!



## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.


Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
