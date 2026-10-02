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
    <div className="max-w-5xl mx-auto space-y-8 pb-16 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 border-b border-neutral-200 pb-6">
        <div>
          <h1 className="font-serif text-2xl sm:text-3xl tracking-tight text-neutral-900 mb-1">
            Letters & Editions
          </h1>
          <p className="font-mono text-xs text-neutral-500 uppercase tracking-wider">
            Manage newsletters, dispatches, and drafts
          </p>
        </div>
        <Link
          href="/admin/letters/new"
          className="inline-flex items-center justify-center bg-neutral-900 hover:bg-black text-white font-mono text-xs uppercase tracking-widest px-6 py-3 transition-all rounded-none"
        >
          + New Letter
        </Link>
      </div>

      {error && (
        <div className="border-l-2 border-neutral-900 bg-neutral-50 p-4 font-mono text-xs text-neutral-900">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {letters.length === 0 ? (
          <div className="col-span-full border border-neutral-200 bg-white p-12 text-center font-mono text-xs text-neutral-400">
            No letters found.
          </div>
        ) : (
          letters.map((letter: any) => (
            <div 
              key={letter.id} 
              className="bg-white border border-neutral-200 p-6 flex flex-col justify-between space-y-6 rounded-none hover:border-neutral-900 transition-colors"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-neutral-500 flex items-center gap-2">
                    <span className={`inline-block h-1.5 w-1.5 ${letter.published ? 'bg-neutral-900' : 'bg-neutral-300'}`} />
                    {letter.published ? 'Published' : 'Draft'} {letter.sentAt && '· Dispatched'}
                  </span>
                  <span className="font-mono text-[10px] text-neutral-400">
                    {new Date(letter.createdAt).toLocaleDateString()}
                  </span>
                </div>
                
                <h3 className="font-serif text-lg text-neutral-900 leading-snug line-clamp-2">
                  {letter.title}
                </h3>
                
                <p className="font-mono text-xs text-neutral-500 truncate">
                  /{letter.slug} &middot; Author: {letter.author?.name || 'Unknown'}
                </p>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-neutral-100">
                <Link 
                  href={`/admin/letters/edit/${letter.id}`} 
                  className="font-mono text-xs text-neutral-900 hover:underline uppercase tracking-wider"
                >
                  Edit →
                </Link>
                <form action={deleteLetter} className="inline">
                  <input type="hidden" name="id" value={letter.id} />
                  <button 
                    type="submit" 
                    className="font-mono text-xs text-neutral-400 hover:text-rose-600 uppercase tracking-wider transition-colors"
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
  );
}
