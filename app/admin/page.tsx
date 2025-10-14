import Link from 'next/link';
import { safeData } from '@/lib/safeSerialize';

export const dynamic = 'force-dynamic';

export default async function AdminDashboard() {
  // Получаем статистику по основным сущностям
  const globalReq = ((globalThis as any)?.request) || new Request('http://localhost');
  const { getUserAndSupabaseForRequest } = await import('@/lib/getUserAndSupabaseForRequest');
  const { supabase } = await getUserAndSupabaseForRequest(globalReq);
  let stats = { articles: 0, projects: 0, letters: 0, postcards: 0 };
  if (supabase) {
    try {
      const [{ count: articles }, { count: projects }, { count: letters }, { count: postcards }] = await Promise.all([
        supabase.from('articles').select('id', { count: 'exact', head: true }),
        supabase.from('project').select('id', { count: 'exact', head: true }),
        supabase.from('letter').select('id', { count: 'exact', head: true }),
        supabase.from('postcards').select('id', { count: 'exact', head: true }),
      ]);
      stats = {
        articles: articles ?? 0,
        projects: projects ?? 0,
        letters: letters ?? 0,
        postcards: postcards ?? 0,
      };
    } catch (e) {
      // ignore, fallback to zeros
    }
  }
  return (
    <div className="p-6 space-y-8">
      <h1 className="text-3xl font-bold mb-2">Admin Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Link href="/admin/articles" className="block bg-blue-50 border border-blue-200 rounded-lg p-4 hover:bg-blue-100 transition">
          <div className="text-2xl font-bold text-blue-700">{stats.articles}</div>
          <div className="text-gray-700 mt-1">Статьи</div>
        </Link>
        <Link href="/admin/projects" className="block bg-purple-50 border border-purple-200 rounded-lg p-4 hover:bg-purple-100 transition">
          <div className="text-2xl font-bold text-purple-700">{stats.projects}</div>
          <div className="text-gray-700 mt-1">Проекты</div>
        </Link>
        <Link href="/admin/letters" className="block bg-yellow-50 border border-yellow-200 rounded-lg p-4 hover:bg-yellow-100 transition">
          <div className="text-2xl font-bold text-yellow-700">{stats.letters}</div>
          <div className="text-gray-700 mt-1">Письма</div>
        </Link>
        <Link href="/admin/postcards" className="block bg-pink-50 border border-pink-200 rounded-lg p-4 hover:bg-pink-100 transition">
          <div className="text-2xl font-bold text-pink-700">{stats.postcards}</div>
          <div className="text-gray-700 mt-1">Открытки</div>
        </Link>
      </div>
      <div className="mt-8 space-y-2">
        <h2 className="text-lg font-semibold">Быстрые ссылки</h2>
        <div className="flex flex-wrap gap-3">
          <Link href="/admin/articles/new" className="px-4 py-2 rounded bg-blue-600 text-white font-semibold hover:bg-blue-700 transition">✍️ Новая статья</Link>
          <Link href="/admin/projects/new" className="px-4 py-2 rounded bg-purple-600 text-white font-semibold hover:bg-purple-700 transition">🚀 Новый проект</Link>
          <Link href="/admin/letters/new" className="px-4 py-2 rounded bg-yellow-500 text-white font-semibold hover:bg-yellow-600 transition">💌 Новое письмо</Link>
        </div>
      </div>
    </div>
  );
}
