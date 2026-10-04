import Link from 'next/link';
import { revalidatePath } from 'next/cache';

export const dynamic = 'force-dynamic';

async function deleteLetter(formData: FormData) {
  'use server';
  const id = formData.get('id');
  if (!id) return;

  try {
    const { getServerSupabaseClient } = await import('@/lib/serverAuth');
    const serverSupabase = getServerSupabaseClient({ useServiceRole: true });

    const { error } = await serverSupabase.from('letters').delete().eq('id', id);

    if (error) {
      console.error('Error deleting letter:', error);
      throw error;
    }
  } catch (e) {
    console.error('Failed to delete letter server action:', e);
  }

  revalidatePath('/journal');
  revalidatePath('/admin/letters');
}

export default async function AdminLettersPage() {
  let letters: any[] = [];
  let error: string | null = null;

  try {
    const globalReq = ((globalThis as any)?.request) || new Request('http://localhost');
    const { getUserAndSupabaseForRequest } = await import('@/lib/getUserAndSupabaseForRequest');
    const _ctx = await getUserAndSupabaseForRequest(globalReq);

    let supabase: any = _ctx?.supabase;
    if (!_ctx?.isServer || !supabase) {
      const { getServerSupabaseClient } = await import('@/lib/serverAuth');
      supabase = getServerSupabaseClient({ useServiceRole: true });
    }

    const { data, error: lErr } = await supabase
      .from('letters')
      .select('id,title,slug,published,sentAt,createdAt,author:authorId(name)')
      .order('createdAt', { ascending: false });

    if (lErr) throw lErr;
    letters = data || [];
  } catch (err) {
    console.error('Error fetching letters:', err);
    error = 'Database schema requires setup. Please run migration migrate_letters_fix.sql';
    letters = [
      {
        id: 'demo_1',
        title: 'Demo Letter 1 (Mock Data)',
        slug: 'demo-letter-1',
        published: true,
        sentAt: null,
        createdAt: new Date(),
        author: { name: 'Demo Author' }
      }
    ];
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] text-zinc-900 font-sans px-6 md:px-12 py-36 md:py-44 selection:bg-black selection:text-white relative">
      
      {/* Paper texture overlay */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      <div className="max-w-7xl mx-auto space-y-12 relative z-20">
        
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6 border-b border-zinc-200 pb-8">
          <div>
            <span className="font-mono text-xs uppercase tracking-[0.2em] text-zinc-400 block mb-2">Editorial Management</span>
            <h1 className="font-serif text-3xl sm:text-5xl font-light text-zinc-900 tracking-tight">
              Letters
            </h1>
          </div>
          <Link
            href="/admin/letters/new"
            className="inline-flex items-center justify-center bg-zinc-900 hover:bg-zinc-800 text-white font-mono text-xs uppercase tracking-widest px-8 py-4 transition-all rounded-full shadow-sm"
          >
            + New Letter
          </Link>
        </div>

        {error && (
          <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 font-mono text-xs uppercase">
            &gt; {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {letters.length === 0 ? (
            <div className="col-span-full border border-zinc-200 bg-white/80 backdrop-blur-2xl p-16 text-center font-mono text-xs text-zinc-400 rounded-3xl">
              No letters found.
            </div>
          ) : (
            letters.map((letter: any) => (
              <div 
                key={letter.id} 
                className="bg-white/80 backdrop-blur-2xl border border-zinc-200/80 p-8 flex flex-col justify-between space-y-6 rounded-3xl hover:border-black transition-all duration-300 shadow-sm"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-widest text-zinc-400">
                    <span className="flex items-center gap-2">
                      <span className={`inline-block h-2 w-2 rounded-full ${letter.published ? 'bg-emerald-600' : 'bg-zinc-300'}`} />
                      {letter.published ? 'Published' : 'Draft'}
                    </span>
                    <span>
                      {new Date(letter.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  
                  <h3 className="font-serif text-xl font-light text-zinc-900 leading-snug line-clamp-2">
                    {letter.title}
                  </h3>
                  
                  <p className="font-mono text-xs text-zinc-500 truncate">
                    /{letter.slug} &middot; Author: {letter.author?.name || 'Unknown'}
                  </p>
                </div>

                <div className="flex items-center justify-between pt-6 border-t border-zinc-100 font-mono text-xs uppercase tracking-widest">
                  <Link 
                    href={`/admin/letters/edit/${letter.id}`} 
                    className="text-zinc-900 hover:underline font-bold"
                  >
                    Edit →
                  </Link>
                  <form action={deleteLetter} className="inline">
                    <input type="hidden" name="id" value={letter.id} />
                    <button 
                      type="submit" 
                      className="text-zinc-400 hover:text-rose-600 transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  </form>
                </div>
              </div>
            ))
          )}
        </div>

      </div>
    </div>
  );
}
