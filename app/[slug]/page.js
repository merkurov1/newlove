import prisma from '@/lib/prisma';
import { notFound } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Image from 'next/image';

async function getContent(slug) {
  try {
    const project = await prisma.project.findUnique({
      where: { slug, published: true },
      include: { author: { select: { name: true, image: true } } },
    });
    if (project) return { type: 'project', data: project };

    const article = await prisma.article.findUnique({
      where: { slug, published: true },
      include: { author: { select: { name: true, image: true } } },
    });
    if (article) return { type: 'article', data: article };
    
    return null;
  } catch (error) {
    // Защита от сбоя при загрузке конкретной страницы
    console.error(`!!! Ошибка при загрузке контента для slug [${slug}]:`, error);
    return null;
  }
}

// ... остальная часть файла (ContentDisplay, SlugPage, generateMetadata) без изменений ...

Шаг 2: Ищем глубинную причину (если проблема останется)
После того как вы примените эти изменения, ваш сайт перестанет падать. Но если статьи так и не появятся, это будет означать, что try...catch срабатывает, и нам нужно найти, почему он срабатывает.
Следующий самый вероятный "подозреваемый" — это то, как инициализируется клиент Prisma. В серверных средах, таких как Vercel, важно использовать "синглтон" — один-единственный экземпляр Prisma на все запросы, чтобы не создавать лишние подключения к базе.
Пожалуйста, покажите мне содержимое файла lib/prisma.ts (или .js). Это позволит мне проверить, используется ли у вас правильный паттерн для инициализации Prisma.
cat lib/prisma.ts


