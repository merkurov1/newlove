import Link from 'next/link';
import prisma from '@/lib/prisma';
import { deleteArticle } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminArticlesPage() {
  const articles = await prisma.article.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      author: {
        select: { name: true },
      },
    },
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Ваши публикации</h1>
        {/* === ИСПРАВЛЕНИЕ ЗДЕСЬ === */}
        <Link 
          href="/admin/articles/new" // Старый путь был "/admin/artcles/new"
          className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
        >
          + Написать новую
        </Link>
      </div>
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <ul className="divide-y divide-gray-200">
          {articles.length === 0 ? (
            <li className="p-4 text-center text-gray-500">Пока нет ни одной публикации.</li>
          ) : (
            articles.map((article) => (
              <li key={article.id} className="p-4 flex justify-between items-center">
                <div className="flex-grow">
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${article.published ? 'bg-green-500' : 'bg-gray-400'}`} title={article.published ? 'Опубликовано' : 'Черновик'}></span>
                    <h3 className="text-lg font-semibold text-gray-800">{article.title}</h3>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    /{article.slug} &middot; Автор: {article.author.name || 'Неизвестен'}
                  </p>
                </div>
                <div className="flex items-center space-x-4">
                  {/* TODO: Создать страницу редактирования */}
                  <Link href={`/admin/articles/edit/${article.id}`} className="text-blue-500 hover:underline">
                    Редактировать
                  </Link>
                  <form action={deleteArticle}>
                    <input type="hidden" name="id" value={article.id} />
                    <button type="submit" className="text-red-500 hover:underline">
                      Удалить
                    </button>
                  </form>
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

