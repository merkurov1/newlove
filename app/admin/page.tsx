import Link from 'next/link';
import PasskeyAuth from '@/components/PasskeyAuth';
import { revalidateLetters } from './actions';

export const dynamic = 'force-dynamic';

interface AdminDashboardProps {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }> | { [key: string]: string | string[] | undefined };
}

export default async function AdminDashboard({ searchParams }: AdminDashboardProps) {
  const resolvedSearchParams = searchParams instanceof Promise ? await searchParams : searchParams;
  const revalidated = resolvedSearchParams?.revalidated === '1';

  let stats = { articles: 0, projects: 0, letters: 0, postcards: 0 };
  let recentArticles: any[] = [];
  let recentProjects: any[] = [];
  let dataUnavailable = false;

  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const serverSupabase = getServerSupabaseClient({ useServiceRole: true });

    const [
      articlesCount,
      projectsCount,
      lettersCount,
      postcardsCount,
      articlesData,
      projectsData,
    ] = await Promise.all([
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

  return (
    <div className="min-h-screen bg-neutral-50/60 text-neutral-900 p-6 md:p-12 space-y-10 max-w-7xl mx-auto selection:bg-neutral-900 selection:text-white font-sans">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 border-b border-neutral-200 pb-6">
        <div>
          <span className="text-xs uppercase tracking-widest text-neutral-400 font-mono font-medium">Control Center</span>
          <h1 className="text-3xl font-extrabold tracking-tight mt-1 text-neutral-900">Admin Dashboard</h1>
        </div>
        
        {/* Passkey management widget */}
        <div className="w-full md:w-auto bg-white p-3 rounded-2xl border border-neutral-200 shadow-xs">
          <PasskeyAuth />
        </div>
      </div>

      {dataUnavailable && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm">
          ⚠️ Database stats are temporarily unavailable. Check service-role credentials.
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Link
          href="/admin/selection"
          className="group bg-white border border-neutral-200/80 rounded-2xl p-6 hover:border-neutral-300 hover:shadow-md transition duration-200"
        >
          <div className="text-3xl font-extrabold text-neutral-900 group-hover:scale-105 transition-transform origin-left">{stats.articles}</div>
          <div className="text-neutral-500 text-sm mt-2 font-medium">Articles</div>
        </Link>
        <Link
          href="/admin/projects"
          className="group bg-white border border-neutral-200/80 rounded-2xl p-6 hover:border-neutral-300 hover:shadow-md transition duration-200"
        >
          <div className="text-3xl font-extrabold text-neutral-900 group-hover:scale-105 transition-transform origin-left">{stats.projects}</div>
          <div className="text-neutral-500 text-sm mt-2 font-medium">Projects</div>
        </Link>
        <Link
          href="/admin/letters"
          className="group bg-white border border-neutral-200/80 rounded-2xl p-6 hover:border-neutral-300 hover:shadow-md transition duration-200"
        >
          <div className="text-3xl font-extrabold text-neutral-900 group-hover:scale-105 transition-transform origin-left">{stats.letters}</div>
          <div className="text-neutral-500 text-sm mt-2 font-medium">Letters</div>
        </Link>
        <Link
          href="/admin/postcards"
          className="group bg-white border border-neutral-200/80 rounded-2xl p-6 hover:border-neutral-300 hover:shadow-md transition duration-200"
        >
          <div className="text-3xl font-extrabold text-neutral-900 group-hover:scale-105 transition-transform origin-left">{stats.postcards}</div>
          <div className="text-neutral-500 text-sm mt-2 font-medium">Postcards</div>
        </Link>
      </div>

      {/* Quick Actions */}
      <div className="space-y-3">
        <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400 font-mono">Quick Actions</h2>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/admin/selection/new"
            className="px-4 py-2.5 rounded-xl bg-neutral-900 text-white font-medium text-sm hover:bg-neutral-800 transition shadow-xs"
          >
            + New Publication
          </Link>
          <Link
            href="/admin/projects/new"
            className="px-4 py-2.5 rounded-xl bg-white text-neutral-800 font-medium text-sm hover:bg-neutral-100 transition border border-neutral-200 shadow-xs"
          >
            + New Project
          </Link>
          <Link
            href="/admin/letters/new"
            className="px-4 py-2.5 rounded-xl bg-white text-neutral-800 font-medium text-sm hover:bg-neutral-100 transition border border-neutral-200 shadow-xs"
          >
            + New Letter
          </Link>
          <Link
            href="/admin/users"
            className="px-4 py-2.5 rounded-xl bg-white text-neutral-600 font-medium text-sm hover:bg-neutral-100 hover:text-neutral-900 transition border border-neutral-200 shadow-xs"
          >
            Users & Access
          </Link>
        </div>
      </div>

      {revalidated && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
          ✅ Revalidation requested for /letters. Check public archive shortly.
        </div>
      )}

      {/* Reindexing Box */}
      <div className="bg-white border border-neutral-200/80 rounded-2xl p-6 space-y-4 shadow-xs">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-neutral-400 font-mono">Manual Reindexing</h2>
          <p className="text-sm text-neutral-500 mt-1">
            Force clear cache and revalidate public letter feeds immediately after updates.
          </p>
        </div>
        <form
          action={async () => {
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
            className="px-4 py-2 bg-neutral-100 text-neutral-700 hover:text-neutral-900 border border-neutral-200 rounded-xl text-sm font-medium hover:bg-neutral-200/60 transition cursor-pointer"
          >
            Revalidate /letters Cache
          </button>
        </form>
      </div>

      {/* Recent Content Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4 border-t border-neutral-200">
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 font-mono">Recent Articles</h3>
          <div className="bg-white border border-neutral-200/80 rounded-2xl overflow-hidden divide-y divide-neutral-100 shadow-xs">
            {recentArticles.length === 0 ? (
              <div className="p-4 text-sm text-neutral-400">No articles found.</div>
            ) : (
              recentArticles.map((a) => (
                <div key={a.id} className="p-4 flex items-center justify-between hover:bg-neutral-50 transition">
                  <div className="space-y-1 truncate pr-4">
                    <Link
                      href={`/admin/selection/edit/${a.id}`}
                      className="text-neutral-900 hover:text-blue-600 font-medium text-sm block truncate transition-colors"
                    >
                      {a.title}
                    </Link>
                    <span className="text-xs text-neutral-400 font-mono">/{a.slug}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {a.published ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">published</span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500 text-xs font-medium">draft</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-400 font-mono">Recent Projects</h3>
          <div className="bg-white border border-neutral-200/80 rounded-2xl overflow-hidden divide-y divide-neutral-100 shadow-xs">
            {recentProjects.length === 0 ? (
              <div className="p-4 text-sm text-neutral-400">No projects found.</div>
            ) : (
              recentProjects.map((p) => (
                <div key={p.id} className="p-4 flex items-center justify-between hover:bg-neutral-50 transition">
                  <div className="space-y-1 truncate pr-4">
                    <Link
                      href={`/admin/projects/edit/${p.id}`}
                      className="text-neutral-900 hover:text-blue-600 font-medium text-sm block truncate transition-colors"
                    >
                      {p.title}
                    </Link>
                    <span className="text-xs text-neutral-400 font-mono">/{p.slug}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    {p.published ? (
                      <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200">published</span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full bg-neutral-100 text-neutral-500 text-xs font-medium">draft</span>
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
