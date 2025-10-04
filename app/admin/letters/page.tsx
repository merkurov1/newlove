import Link from 'next/link';
import prisma from '@/lib/prisma';
import { deleteLetter } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminLettersPage() {
  let letters = [];
  let error = null;

  try {
    letters = await prisma.letter.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        author: {
          select: { name: true },
        },
      },
    });
  } catch (err) {
    console.error('Error fetching letters:', err);
    error = 'База данных писем пока не настроена. Выполните миграцию migrate_letters_fix.sql';
    
    // Используем моковые данные для демонстрации
    letters = [
      {
        id: 'demo_1',
        title: 'Демо письмо 1 (из моковых данных)',
        slug: 'demo-letter-1',
        published: true,
        sentAt: null,
        createdAt: new Date(),
        author: { name: 'Demo Author' }
      },
      {
        id: 'demo_2', 
        title: 'Демо письмо 2 (из моковых данных)',
        slug: 'demo-letter-2',
        published: false,
        sentAt: null,
        createdAt: new Date(),
        author: { name: 'Demo Author' }
      }
    ];
  }

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

      {error && (
        <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </div>
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                База данных требует настройки
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                <p>{error}</p>
                <p className="mt-1">Выполните миграцию <code className="bg-yellow-100 px-1 rounded">migrate_letters_fix.sql</code> в Supabase SQL Editor</p>
              </div>
            </div>
          </div>
        </div>
      )}

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
                    {letter.sentAt && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        📧 Отправлено
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mt-1">
                    /{letter.slug} &middot; Автор: {letter.author.name || 'Неизвестен'}
                    {letter.sentAt && (
                      <span className="ml-2">
                        &middot; Отправлено: {new Date(letter.sentAt).toLocaleString('ru-RU')}
                      </span>
                    )}
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

