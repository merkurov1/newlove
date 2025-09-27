// app/admin/articles/page.tsx
import Link from 'next/link';
import prisma from '@/lib/prisma';
import { deleteArticle } from '../actions'; // Эта функция будет работать с моделью Article

export const dynamic = 'force-dynamic';

export default async function AdminArticlesPage() {
  // <<< ИЗМЕНЕНИЕ: Запрашиваем данные из `article`, а не `newsArticle`
  const articles = await prisma.article.findMany({
    orderBy: { createdAt: 'desc' },
  });

  return (
    <div>
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Ваши публикации (Articles)</h1>
        <Link 
          href="/admin/articles/new" // Ссылка на страницу создания статьи
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
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">{article.title}</h3>
                  <p className="text-sm text-gray-500">/{article.slug}</p>
                </div>
                <div className="flex items-center space-x-4">
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
