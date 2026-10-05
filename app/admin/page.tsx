import Link from 'next/link';
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
        .select('id,title,slug,published,updatedAt')
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
    <div className="min-h-screen bg-[#FAF8F5] text-zinc-900 font-sans px-6 md:px-12 py-8 selection:bg-black selection:text-white relative">
      
      {/* Paper texture overlay */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="max-w-7xl mx-auto space-y-12 relative z-20">

        {dataUnavailable && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 font-mono text-xs uppercase">
            &gt; Database stats unavailable. Check service-role credentials.
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          <Link
            href="/admin/selection"
            className="group bg-white/80 backdrop-blur-2xl border border-zinc-200/80 rounded-3xl p-8 hover:border-black transition-all duration-300 shadow-sm"
          >
            <div className="font-serif text-4xl font-light text-zinc-900 group-hover:scale-105 transition-transform origin-left">{stats.articles}</div>
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400 mt-2">Articles</div>
          </Link>
          <Link
            href="/admin/projects"
            className="group bg-white/80 backdrop-blur-2xl border border-zinc-200/80 rounded-3xl p-8 hover:border-black transition-all duration-300 shadow-sm"
          >
            <div className="font-serif text-4xl font-light text-zinc-900 group-hover:scale-105 transition-transform origin-left">{stats.projects}</div>
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400 mt-2">Projects</div>
          </Link>
          <Link
            href="/admin/letters"
            className="group bg-white/80 backdrop-blur-2xl border border-zinc-200/80 rounded-3xl p-8 hover:border-black transition-all duration-300 shadow-sm"
          >
            <div className="font-serif text-4xl font-light text-zinc-900 group-hover:scale-105 transition-transform origin-left">{stats.letters}</div>
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400 mt-2">Letters</div>
          </Link>
          <Link
            href="/admin/postcards"
            className="group bg-white/80 backdrop-blur-2xl border border-zinc-200/80 rounded-3xl p-8 hover:border-black transition-all duration-300 shadow-sm"
          >
            <div className="font-serif text-4xl font-light text-zinc-900 group-hover:scale-105 transition-transform origin-left">{stats.postcards}</div>
            <div className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400 mt-2">Postcards</div>
          </Link>
        </div>

        {/* Quick Actions */}
        <div className="bg-white/80 backdrop-blur-2xl border border-zinc-200/80 rounded-3xl p-8 space-y-6 shadow-sm">
          <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">Quick Actions</h2>
          <div className="flex flex-wrap gap-3 font-mono text-xs uppercase tracking-wider">
            <Link
              href="/admin/selection/new"
              className="px-6 py-3 rounded-full bg-zinc-900 hover:bg-zinc-800 text-white font-bold transition shadow-sm"
            >
              + New Publication
            </Link>
            <Link
              href="/admin/projects/new"
              className="px-6 py-3 rounded-full bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-300 font-bold transition shadow-sm"
            >
              + New Project
            </Link>
            <Link
              href="/admin/letters/new"
              className="px-6 py-3 rounded-full bg-white hover:bg-zinc-50 text-zinc-900 border border-zinc-300 font-bold transition shadow-sm"
            >
              + New Letter
            </Link>
            <Link
              href="/admin/users"
              className="px-6 py-3 rounded-full bg-white hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900 border border-zinc-300 font-bold transition shadow-sm"
            >
              Users &amp; Access
            </Link>
          </div>
        </div>

        {revalidated && (
          <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 font-mono text-xs uppercase">
            &gt; Revalidation requested for /letters.
          </div>
        )}

        {/* Reindexing Box */}
        <div className="bg-white/80 backdrop-blur-2xl border border-zinc-200/80 rounded-3xl p-8 space-y-6 shadow-sm">
          <div>
            <h2 className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">Manual Reindexing</h2>
            <p className="font-serif text-sm text-zinc-600 mt-1">
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
              className="px-6 py-3 bg-zinc-100 hover:bg-zinc-200 text-zinc-900 border border-zinc-300 rounded-full font-mono text-xs uppercase tracking-widest font-bold transition cursor-pointer shadow-sm"
            >
              Revalidate /letters Cache
            </button>
          </form>
        </div>

        {/* Recent Content Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white/80 backdrop-blur-2xl border border-zinc-200/80 rounded-3xl p-8 space-y-6 shadow-sm">
            <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">Recent Articles</h3>
            <div className="divide-y divide-zinc-100">
              {recentArticles.length === 0 ? (
                <div className="py-8 font-mono text-xs text-zinc-400 uppercase">No articles found.</div>
              ) : (
                recentArticles.map((a) => (
                  <div key={a.id} className="py-4 flex items-center justify-between">
                    <div className="space-y-1 truncate pr-4">
                      <Link
                        href={`/admin/selection/edit/${a.id}`}
                        className="font-serif text-lg text-zinc-900 hover:underline block truncate"
                      >
                        {a.title}
                      </Link>
                      <span className="font-mono text-[10px] text-zinc-400">/{a.slug}</span>
                    </div>
                    <div className="shrink-0 font-mono text-[10px] uppercase tracking-wider">
                      {a.published ? (
                        <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">published</span>
                      ) : (
                        <span className="px-3 py-1 rounded-full bg-zinc-100 text-zinc-500">draft</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white/80 backdrop-blur-2xl border border-zinc-200/80 rounded-3xl p-8 space-y-6 shadow-sm">
            <h3 className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400">Recent Projects</h3>
            <div className="divide-y divide-zinc-100">
              {recentProjects.length === 0 ? (
                <div className="py-8 font-mono text-xs text-zinc-400 uppercase">No projects found.</div>
              ) : (
                recentProjects.map((p) => (
                  <div key={p.id} className="py-4 flex items-center justify-between">
                    <div className="space-y-1 truncate pr-4">
                      <Link
                        href={`/admin/projects/edit/${p.id}`}
                        className="font-serif text-lg text-zinc-900 hover:underline block truncate"
                      >
                        {p.title}
                      </Link>
                      <span className="font-mono text-[10px] text-zinc-400">/{p.slug}</span>
                    </div>
                    <div className="shrink-0 font-mono text-[10px] uppercase tracking-wider">
                      {p.published ? (
                        <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">published</span>
                      ) : (
                        <span className="px-3 py-1 rounded-full bg-zinc-100 text-zinc-500">draft</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
