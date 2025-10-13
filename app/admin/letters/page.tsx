import Link from 'next/link';
// dynamic import to avoid circular/interop build issues
import { deleteLetter } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminLettersPage() {
  let letters = [];
  let error = null;

  try {
  const globalReq = ((globalThis as any)?.request) || new Request('http://localhost');
  const mod = await import('@/lib/supabase-server');
  const { getUserAndSupabaseFromRequest } = mod as any;
  const { supabase } = await getUserAndSupabaseFromRequest(globalReq);
  if (!supabase) throw new Error('Supabase client unavailable');
  const { data, error: lErr } = await supabase.from('letter').select('id,title,slug,published,sentAt,createdAt,author:authorId(name)').order('createdAt', { ascending: false });
  if (lErr) throw lErr;
  letters = data || [];
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
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 md:gap-6 mb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-yellow-700 tracking-tight mb-1">Выпуски рассылки</h1>
          <p className="text-gray-500 text-base">Все ваши письма и черновики.</p>
        </div>
        <Link
          href="/admin/letters/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500 text-white font-semibold shadow hover:bg-yellow-600 transition-all"
        >
          💌 Новое письмо
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {letters.length === 0 ? (
          <div className="col-span-full p-6 text-center text-gray-400 bg-white rounded-xl border shadow-sm">Пока нет ни одного письма.</div>
        ) : (
          letters.map((letter: any) => (
            <div key={letter.id} className="bg-white rounded-xl border shadow-sm p-5 flex flex-col gap-2 hover:shadow-md transition-shadow group">
              <div className="flex items-center gap-2 mb-1">
                <span className={`h-2.5 w-2.5 rounded-full ${letter.published ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-yellow-700 transition-colors">{letter.title}</h3>
                {letter.sentAt && (
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 ml-2">
                    📧 Отправлено
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 truncate">/{letter.slug} &middot; Автор: {letter.author.name || 'Неизвестен'}{letter.sentAt && (<span className="ml-2">&middot; Отправлено: {new Date(letter.sentAt).toLocaleString('ru-RU')}</span>)}</p>
              <div className="flex items-center gap-3 mt-2">
                <Link href={`/admin/letters/edit/${letter.id}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-yellow-50 text-yellow-700 font-medium hover:bg-yellow-100 transition-all text-sm">
                  ✏️ Редактировать
                </Link>
                <form action={deleteLetter} className="inline">
                  <input type="hidden" name="id" value={letter.id} />
                  <button type="submit" className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-red-50 text-red-600 font-medium hover:bg-red-100 transition-all text-sm">
                    🗑️ Удалить
                  </button>
                </form>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

