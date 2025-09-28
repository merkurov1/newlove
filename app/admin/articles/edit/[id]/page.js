import prisma from '@/lib/prisma';
import { updateArticle } from '../../../actions'; // Импортируем новую функцию
import { notFound } from 'next/navigation';

export default async function EditArticlePage({ params }) {
  const articleId = params.id;
  const article = await prisma.article.findUnique({
    where: { id: articleId },
  });

  if (!article) {
    notFound(); // Если статья не найдена, показать 404
  }

  return (
    <div>
      <h1 className="text-3xl font-bold text-gray-900 mb-8">Редактирование публикации</h1>
      <form action={updateArticle} className="space-y-6 bg-white p-8 rounded-lg shadow-md">
        {/* ВАЖНО: Скрытое поле с ID для передачи в Server Action */}
        <input type="hidden" name="id" value={article.id} />
        
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700">Заголовок</label>
          <input type="text" name="title" id="title" required defaultValue={article.title} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
        </div>
        <div>
          <label htmlFor="slug" className="block text-sm font-medium text-gray-700">URL (slug)</label>
          <input type="text" name="slug" id="slug" required defaultValue={article.slug} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm" />
        </div>
        <div>
          <label htmlFor="content" className="block text-sm font-medium text-gray-700">Содержимое (Markdown)</label>
          <textarea name="content" id="content" rows="10" required defaultValue={article.content} className="mt-1 block w-full rounded-md border-gray-300 shadow-sm"></textarea>
        </div>
        <div className="flex items-center">
          <input id="published" name="published" type="checkbox" defaultChecked={article.published} className="h-4 w-4 rounded border-gray-300 text-blue-600" />
          <label htmlFor="published" className="ml-2 block text-sm text-gray-900">Опубликовано</label>
        </div>
        <div>
          <button type="submit" className="w-full flex justify-center py-2 px-4 border rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
            Сохранить изменения
          </button>
        </div>
      </form>
    </div>
  );
}

Редактирование проектов
Абсолютно то же самое нужно проделать для проектов.
Шаг 3: Добавляем updateProject в actions.js
Вернитесь в app/admin/actions.js и добавьте функцию updateProject (можно прямо перед deleteProject).
// ... добавьте этот код в app/admin/actions.js

// <<< НОВАЯ ФУНКЦИЯ ДЛЯ ОБНОВЛЕНИЯ ПРОЕКТА >>>
export async function updateProject(formData) {
  await verifyAdmin();

  const id = formData.get('id')?.toString();
  const title = formData.get('title')?.toString();
  const content = formData.get('content')?.toString();
  const slug = formData.get('slug')?.toString();
  const published = formData.get('published') === 'on';

  if (!id || !title || !content || !slug) {
    throw new Error('ID, Title, content, and slug are required.');
  }

  await prisma.project.update({
    where: { id: id },
    data: {
      title,
      content,
      slug,
      published,
      publishedAt: published ? new Date() : null,
    },
  });

  revalidatePath('/admin/projects');
  revalidatePath(`/projects/${slug}`);
  redirect('/admin/projects');
}

