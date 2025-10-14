import Link from 'next/link';
import { safeData } from '@/lib/safeSerialize';

export const dynamic = 'force-dynamic';

import { requireAdminFromRequest } from '@/lib/serverAuth';

export default async function AdminDashboard({ searchParams }: { searchParams?: any }) {
  // SSR RBAC: only allow admins
  const globalReq = ((globalThis as any)?.request) || new Request('http://localhost');
  try {
    await requireAdminFromRequest(globalReq);
  } catch {
    // SSR: return 403 page or redirect
    return <div className="p-8 text-center text-red-600 font-bold text-xl">403 Forbidden — Admins only</div>;
  }
  // Получаем статистику по основным сущностям
  const { getUserAndSupabaseForRequest } = await import('@/lib/getUserAndSupabaseForRequest');
  const { supabase } = await getUserAndSupabaseForRequest(globalReq);
  let stats = { articles: 0, projects: 0, letters: 0, postcards: 0 };
  let recentArticles: any[] = [];
  let recentProjects: any[] = [];
  if (supabase) {
    try {
      const [articlesCount, projectsCount, lettersCount, postcardsCount, articlesData, projectsData] = await Promise.all([
        supabase.from('articles').select('id', { count: 'exact', head: true }),
        supabase.from('projects').select('id', { count: 'exact', head: true }),
        supabase.from('letter').select('id', { count: 'exact', head: true }),
        supabase.from('postcards').select('id', { count: 'exact', head: true }),
        supabase.from('articles').select('id,title,slug,published,author:authorId(name),updatedAt').order('updatedAt', { ascending: false }).limit(5),
        supabase.from('projects').select('id,title,slug,published,createdAt').order('createdAt', { ascending: false }).limit(5),
      ]);
      stats = {
        articles: articlesCount.count ?? 0,
        projects: projectsCount.count ?? 0,
        letters: lettersCount.count ?? 0,
        postcards: postcardsCount.count ?? 0,
      };
      recentArticles = Array.isArray(articlesData.data) ? articlesData.data : [];
      recentProjects = Array.isArray(projectsData.data) ? projectsData.data : [];
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
      <div className="mt-10 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div>
          <h3 className="text-lg font-bold mb-2">Последние статьи</h3>
          <ul className="space-y-2">
            {recentArticles.map((a) => (
              <li key={a.id} className="flex items-center gap-2">
                <Link href={`/admin/articles/edit/${a.id}`} className="text-blue-700 hover:underline font-medium">{a.title}</Link>
                <span className="text-xs text-gray-400">/{a.slug}</span>
                {a.published ? <span className="ml-2 text-green-600 text-xs">● опубликовано</span> : <span className="ml-2 text-gray-400 text-xs">черновик</span>}
                <span className="ml-2 text-xs text-gray-500">{a.author?.name || ''}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-lg font-bold mb-2">Последние проекты</h3>
          <ul className="space-y-2">
            {recentProjects.map((p) => (
              <li key={p.id} className="flex items-center gap-2">
                <Link href={`/admin/projects/edit/${p.id}`} className="text-purple-700 hover:underline font-medium">{p.title}</Link>
                <span className="text-xs text-gray-400">/{p.slug}</span>
                {p.published ? <span className="ml-2 text-green-600 text-xs">● опубликовано</span> : <span className="ml-2 text-gray-400 text-xs">черновик</span>}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
