import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { requireAdmin } from '@/lib/serverAuth';

export const revalidate = 0;
export const metadata = {
  title: 'Vault Archive // Art Engine',
  description: 'Restricted catalog of institutional art dossiers.',
  robots: { index: false, follow: false },
};

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getInitials(name?: string) {
  if (!name) return 'A';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

export default async function LotsPage() {
  try {
    await requireAdmin();
  } catch {
    redirect('/art-engine?access=required');
  }

  const { data: lots, error } = await supabase
    .from('lots')
    .select('id, artist, title, year, medium, dimensions, estimate, image_path, source_url, auction_house, ai_content, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900 p-8 pt-32 font-mono text-sm">
        Unable to load catalog from database.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans pt-24 sm:pt-32 pb-32 px-6 sm:px-12">
      <div className="max-w-7xl mx-auto space-y-12">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-5 border-b border-neutral-200 pb-8">
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest block">VAULT ARCHIVE</span>
            <h1 className="text-3xl sm:text-4xl font-serif text-neutral-900 font-normal">Cataloged Artifacts</h1>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400">{lots?.length || 0} records</span>
            <Link href="/art-engine" className="text-xs font-mono text-neutral-500 hover:text-neutral-900 transition">
            ← TERMINAL
            </Link>
          </div>
        </div>

        {lots && lots.length === 0 ? (
          <div className="border border-dashed border-neutral-300 bg-white/60 px-6 py-20 text-center">
            <p className="font-mono text-xs uppercase tracking-widest text-neutral-400">Vault is empty</p>
            <p className="mt-3 font-serif text-xl text-neutral-700">Parse an auction lot to create the first dossier.</p>
            <Link href="/art-engine" className="mt-6 inline-flex bg-neutral-900 px-5 py-3 font-mono text-[10px] uppercase tracking-widest text-white hover:bg-neutral-700">
              Open Terminal
            </Link>
          </div>
        ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {lots?.map((lot) => {
            const ai = (lot.ai_content || {}) as Record<string, any>;
            const publicImg = lot.image_path?.startsWith('http')
              ? lot.image_path
              : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/artifacts/${lot.image_path}`;

            return (
              <Link
                key={lot.id}
                href={`/art-engine/lots/${lot.id}`}
                className="group bg-white border border-neutral-200 overflow-hidden hover:border-neutral-900 transition flex flex-col"
              >
                <div className="aspect-[4/3] bg-neutral-50 relative overflow-hidden flex items-center justify-center p-4 border-b border-neutral-100">
                  {lot.image_path ? (
                    <img
                      src={publicImg}
                      alt={lot.title || lot.artist}
                      loading="lazy"
                      decoding="async"
                      className="object-contain max-h-full max-w-full group-hover:scale-105 transition duration-500"
                    />
                  ) : (
                    <div className="font-serif text-2xl text-neutral-300">{getInitials(lot.artist)}</div>
                  )}
                </div>

                <div className="p-5 sm:p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex flex-wrap justify-between gap-2 items-start text-neutral-400 font-mono text-[10px] uppercase tracking-wider mb-2">
                      <span>{lot.auction_house || 'AUCTION'}</span>
                      <span className="text-neutral-700">{lot.estimate || ai.estimate_raw || 'ON REQUEST'}</span>
                    </div>
                    <h2 className="text-xl font-serif text-neutral-900 group-hover:underline break-words">{lot.artist || 'Unknown Artist'}</h2>
                    <p className="text-sm text-neutral-600 italic mt-1 leading-snug break-words">{lot.title || 'Untitled'} {lot.year && `(${lot.year})`}</p>
                    {(ai.source_confidence || ai.source_description) && (
                      <div className="mt-3 flex flex-wrap gap-2 text-[9px] font-mono uppercase tracking-wider">
                        {ai.source_confidence && <span className="border border-neutral-200 px-2 py-1 text-neutral-500">Source: {ai.source_confidence}</span>}
                        {ai.source_description && <span className="border border-emerald-200 bg-emerald-50 px-2 py-1 text-emerald-700">Description captured</span>}
                      </div>
                    )}
                    {(lot.medium || lot.dimensions || ai.artist_dates) && (
                      <p className="mt-3 text-[10px] font-mono text-neutral-400 leading-relaxed break-words">
                        {[lot.medium, lot.dimensions, ai.artist_dates].filter(Boolean).join(' · ')}
                      </p>
                    )}
                    {ai.source_description && (
                      <p className="mt-3 text-xs text-neutral-500 leading-relaxed line-clamp-3">{ai.source_description}</p>
                    )}
                  </div>

                  <div className="text-[10px] font-mono text-neutral-400 border-t border-neutral-100 pt-3 flex justify-between items-center">
                    <span className="truncate max-w-[180px]">{lot.medium || 'Mixed Media'}</span>
                    <span className="text-neutral-900">Dossier →</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
        )}

      </div>
    </div>
  );
}
