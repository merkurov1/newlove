
# merkurov.love — Современный блог/портал с интеграциями

Многофункциональный сайт на Next.js 14 с поддержкой:
- 🦋 Bluesky (AT Protocol) интеграции
- Medium RSS-ленты
- YouTube Shorts
- Проектов с Editor.js (Notion-style)
- Адаптивного дизайна на TailwindCSS
- Supabase Auth,  Supabase Storage

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

Note: trivial whitespace/tiny-note change (auto-commit).

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
dd
sadasd
### Как добавить проект
1. Создайте проект через API или напрямую в базе (укажите title, slug, authorId).
2. Перейдите в `/admin/projects/edit/[id]` для наполнения контентом.
3. Сохраняйте — данные отправляются в API и сохраняются в JSON.sadasd



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
