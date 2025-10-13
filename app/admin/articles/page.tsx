import Link from 'next/link';
// dynamic import to avoid circular/interop build issues
import { safeData } from '@/lib/safeSerialize';
import { deleteArticle } from '../actions';

export const dynamic = 'force-dynamic';

export default async function AdminArticlesPage() {
  // Use server service-role client for admin pages to avoid relying on
  // request-bound client at render time (stable for builds and admin ops).
  const { getServerSupabaseClient } = await import('@/lib/serverAuth');
  const serverSupabase = getServerSupabaseClient();
  let articles: any[] = [];
  if (serverSupabase) {
    const { data, error } = await serverSupabase.from('article').select('id,title,slug,published,author:authorId(name)').order('createdAt', { ascending: false });
    if (error) console.error('Supabase fetch admin articles error', error);
    articles = safeData(data || []);
  }

  return (
    <div className="space-y-8 pb-10">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-2 md:gap-6 mb-2">
        <div>
          <h1 className="text-3xl font-extrabold text-blue-800 tracking-tight mb-1">Статьи</h1>
          <p className="text-gray-500 text-base">Все ваши публикации и черновики.</p>
        </div>
        <Link
          href="/admin/articles/new"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold shadow hover:bg-blue-700 transition-all"
        >
          ✍️ Новая статья
        </Link>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {articles.length === 0 ? (
          <div className="col-span-full p-6 text-center text-gray-400 bg-white rounded-xl border shadow-sm">Пока нет ни одной публикации.</div>
        ) : (
          articles.map((article: any) => (
            <div key={article.id} className="bg-white rounded-xl border shadow-sm p-5 flex flex-col gap-2 hover:shadow-md transition-shadow group">
              <div className="flex items-center gap-2 mb-1">
                <span className={`h-2.5 w-2.5 rounded-full ${article.published ? 'bg-green-500' : 'bg-gray-400'}`} title={article.published ? 'Опубликовано' : 'Черновик'}></span>
                <h3 className="text-lg font-semibold text-gray-900 truncate group-hover:text-blue-700 transition-colors">{article.title}</h3>
              </div>
              <p className="text-xs text-gray-500 truncate">/{article.slug} &middot; Автор: {article.author.name || 'Неизвестен'}</p>
              <div className="flex items-center gap-3 mt-2">
                <Link href={`/admin/articles/edit/${article.id}`} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md bg-blue-50 text-blue-700 font-medium hover:bg-blue-100 transition-all text-sm">
                  ✏️ Редактировать
                </Link>
                <form action={deleteArticle} className="inline">
                  <input type="hidden" name="id" value={article.id} />
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


