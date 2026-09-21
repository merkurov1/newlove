import Link from 'next/link';
import PasskeyAuth from '@/components/PasskeyAuth';

export const dynamic = 'force-dynamic';

import { revalidateLetters } from './actions';

export default async function AdminDashboard({ searchParams }: { searchParams?: any }) {
  let stats = { articles: 0, projects: 0, letters: 0, postcards: 0 };
  let recentArticles: any[] = [];
  let recentProjects: any[] = [];
  let dataUnavailable = false;

  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const serverSupabase = getServerSupabaseClient({ useServiceRole: true });
    const [articlesCount, projectsCount, lettersCount, postcardsCount, articlesData, projectsData] =
      await Promise.all([
        serverSupabase.from('articles').select('id', { count: 'exact', head: true }),
        serverSupabase.from('projects').select('id', { count: 'exact', head: true }),
        serverSupabase.from('letters').select('id', { count: 'exact', head: true }),
        serverSupabase.from('postcards').select('id', { count: 'exact', head: true }),
        serverSupabase
          .from('articles')
          .select('id,title,slug,published,author:authorId(name),updatedAt')
          .order('updatedAt', { ascending: false })
          .limit(5),
        serverSupabase
          .from('projects')
          .select('id,title,slug,published,createdAt')
          .order('createdAt', { ascending: false })
          .limit(5),
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
    console.error('Admin dashboard data fetch error:', e);
    dataUnavailable = true;
  }
  const revalidated = searchParams?.revalidated === '1';

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-12 space-y-12 max-w-7xl mx-auto selection:bg-white selection:text-black">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-white/10 pb-6">
        <div>
          <span className="text-xs uppercase tracking-widest text-neutral-500 font-mono">Control Center</span>
          <h1 className="text-3xl font-bold tracking-tight mt-1 text-white">Admin Dashboard</h1>
        </div>
        
        {/* Passkey management widget */}
        <div className="w-full md:w-auto bg-neutral-900/50 p-2 rounded-xl border border-white/10">
          <PasskeyAuth />
        </div>
      </div>

      {dataUnavailable && (
        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400 text-sm">
          ⚠️ Database stats are temporarily unavailable. Check service-role credentials.
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Link
          href="/admin/selection"
          className="group bg-neutral-900/40 border border-white/10 rounded-2xl p-6 hover:border-white/30 hover:bg-neutral-900 transition"
        >
          <div className="text-3xl font-bold text-white group-hover:scale-105 transition-transform origin-left">{stats.articles}</div>
          <div className="text-neutral-400 text-sm mt-2 font-medium">Articles</div>
        </Link>
        <Link
          href="/admin/projects"
          className="group bg-neutral-900/40 border border-white/10 rounded-2xl p-6 hover:border-white/30 hover:bg-neutral-900 transition"
        >
          <div className="text-3xl font-bold text-white group-hover:scale-105 transition-transform origin-left">{stats.projects}</div>
          <div className="text-neutral-400 text-sm mt-2 font-medium">Projects</div>
        </Link>
        <Link
          href="/admin/letters"
          className="group bg-neutral-900/40 border border-white/10 rounded-2xl p-6 hover:border-white/30 hover:bg-neutral-900 transition"
        >
          <div className="text-3xl font-bold text-white group-hover:scale-105 transition-transform origin-left">{stats.letters}</div>
          <div className="text-neutral-400 text-sm mt-2 font-medium">Letters</div>
        </Link>
        <Link
          href="/admin/postcards"
          className="group bg-neutral-900/40 border border-white/10 rounded-2xl p-6 hover:border-white/30 hover:bg-neutral-900 transition"
        >
          <div className="text-3xl font-bold text-white group-hover:scale-105 transition-transform origin-left">{stats.postcards}</div>
          <div className="text-neutral-400 text-sm mt-2 font-medium">Postcards</div>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/selection/new"
            className="px-4 py-2.5 rounded-xl bg-white text-black font-semibold text-sm hover:bg-neutral-200 transition shadow-sm"
          >
            + New Publication
          </Link>
          <Link
            href="/admin/projects/new"
            className="px-4 py-2.5 rounded-xl bg-neutral-800 text-white font-semibold text-sm hover:bg-neutral-700 transition border border-white/10"
          >
            + New Project
          </Link>
          <Link
            href="/admin/letters/new"
            className="px-4 py-2.5 rounded-xl bg-neutral-800 text-white font-semibold text-sm hover:bg-neutral-700 transition border border-white/10"
          >
            + New Letter
          </Link>
          <Link
            href="/admin/users"
            className="px-4 py-2.5 rounded-xl bg-neutral-800 text-neutral-300 font-semibold text-sm hover:bg-neutral-700 hover:text-white transition border border-white/10"
          >
            Users & Access
          </Link>
        </div>
      </div>

      {revalidated && (
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
          ✅ Revalidation requested for /letters. Check public archive shortly.
        </div>
      )}

      {/* Reindexing Box */}
      <div className="bg-neutral-900/40 border border-white/10 rounded-2xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Manual Reindexing</h2>
        </div>
        <p className="text-sm text-neutral-400">
          Force clear cache and revalidate public letter feeds immediately after updates.
        </p>
        <form
          action={async (formData: FormData) => {
            'use server';
            try {
              await revalidateLetters();
            } catch (e) {
              console.error('Admin revalidate button failed:', e);
            }
          }}
        >
          <button
            type="submit"
            className="px-4 py-2 bg-neutral-800 text-neutral-200 hover:text-white border border-white/10 rounded-xl text-sm font-medium hover:bg-neutral-700 transition cursor-pointer"
          >
            Revalidate /letters Cache
          </button>
        </form>
      </div>

      {/* Recent Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-white/10">
        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Recent Articles</h3>
          <div className="bg-neutral-900/40 border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5">
            {recentArticles.length === 0 ? (
              <div className="p-4 text-sm text-neutral-500">No articles found.</div>
            ) : (
              recentArticles.map((a) => (
                <div key={a.id} className="p-4 flex items-center justify-between hover:bg-neutral-900/80 transition">
                  <div className="space-y-1 truncate pr-4">
                    <Link
                      href={`/admin/selection/edit/${a.id}`}
                      className="text-white hover:underline font-medium text-sm block truncate"
                    >
                      {a.title}
                    </Link>
                    <span className="text-xs text-neutral-500 font-mono">/{a.slug}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {a.published ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">published</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 text-xs font-medium">draft</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-neutral-400">Recent Projects</h3>
          <div className="bg-neutral-900/40 border border-white/10 rounded-2xl overflow-hidden divide-y divide-white/5">
            {recentProjects.length === 0 ? (
              <div className="p-4 text-sm text-neutral-500">No projects found.</div>
            ) : (
              recentProjects.map((p) => (
                <div key={p.id} className="p-4 flex items-center justify-between hover:bg-neutral-900/80 transition">
                  <div className="space-y-1 truncate pr-4">
                    <Link
                      href={`/admin/projects/edit/${p.id}`}
                      className="text-white hover:underline font-medium text-sm block truncate"
                    >
                      {p.title}
                    </Link>
                    <span className="text-xs text-neutral-500 font-mono">/{p.slug}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {p.published ? (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-xs font-medium border border-emerald-500/20">published</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-400 text-xs font-medium">draft</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
