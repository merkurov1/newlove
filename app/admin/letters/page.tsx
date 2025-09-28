import Link from 'next/link';
import prisma from '@/lib/prisma';
import { deleteLetter } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminLettersPage() {
  const letters = await prisma.letter.findMany({
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
        <h1 className="text-3xl font-bold text-gray-900">Выпуски рассылки</h1>
        <Link 
          href="/admin/letters/new"
          className="bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700"
        >
          + Написать новый выпуск
        </Link>
      </div>
      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <ul className="divide-y divide-gray-200">
          {letters.length === 0 ? (
            <li className="p-4 text-center text-gray-500">Пока нет ни одного письма.</li>
          ) : (
            letters.map((letter) => (
              <li key={letter.id} className="p-4 flex justify-between items-center">
                <div className="flex-grow">
                  <div className="flex items-center gap-3">
                    <span className={`h-2.5 w-2.5 rounded-full ${letter.published ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                    <h3 className="text-lg font-semibold text-gray-800">{letter.title}</h3>
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    /{letter.slug} &middot; Автор: {letter.author.name || 'Неизвестен'}
                  </p>
                </div>
                <div className="flex items-center space-x-4">
                  <Link href={`/admin/letters/edit/${letter.id}`} className="text-blue-500 hover:underline">
                    Редактировать
                  </Link>
                  <form action={deleteLetter}>
                    <input type="hidden" name="id" value={letter.id} />
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

