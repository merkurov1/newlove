This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or


```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.


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
