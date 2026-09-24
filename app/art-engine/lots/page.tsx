import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

export const revalidate = 0;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function LotsPage() {
  const { data: lots, error } = await supabase
    .from('lots')
    .select('id, artist, title, year, medium, estimate, image_path, source_url, auction_house, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    return (
      <div className="min-h-screen bg-black text-white p-8 pt-32 font-mono text-sm">
        Error loading lots from database.
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white font-sans pt-24 sm:pt-32 pb-24 px-4 sm:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        <div className="flex justify-between items-center border-b border-zinc-800 pb-6">
          <div>
            <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest block">VAULT ARCHIVE</span>
            <h1 className="text-3xl font-serif text-white mt-1">Curated Auction Catalog</h1>
          </div>
          <Link href="/art-engine" className="text-xs font-mono text-zinc-400 hover:text-white transition">
            ← ART ENGINE TERMINAL
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {lots?.map((lot) => {
            const publicImg = lot.image_path?.startsWith('http')
              ? lot.image_path
              : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/artifacts/${lot.image_path}`;

            return (
              <Link
                key={lot.id}
                href={`/art-engine/lots/${lot.id}`}
                className="group bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 transition flex flex-col"
              >
                <div className="aspect-[4/3] bg-zinc-950 relative overflow-hidden flex items-center justify-center p-4 border-b border-zinc-800/60">
                  {lot.image_path ? (
                    <img
                      src={publicImg}
                      alt={lot.title || lot.artist}
                      className="object-contain max-h-full max-w-full group-hover:scale-105 transition duration-500"
                    />
                  ) : (
                    <div className="text-xs font-mono text-zinc-600">NO IMAGE</div>
                  )}
                </div>

                <div className="p-5 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex justify-between items-start">
                      <span className="text-[10px] font-mono text-emerald-400 uppercase tracking-wider">{lot.auction_house || 'AUCTION'}</span>
                      {lot.estimate && <span className="text-[11px] font-mono text-zinc-400">{lot.estimate}</span>}
                    </div>
                    <h2 className="text-base font-serif text-white group-hover:text-emerald-400 transition mt-1">{lot.artist}</h2>
                    <p className="text-xs text-zinc-400 italic">{lot.title} {lot.year && `(${lot.year})`}</p>
                  </div>

                  <div className="text-[10px] font-mono text-zinc-500 border-t border-zinc-800/60 pt-3 flex justify-between items-center">
                    <span className="truncate max-w-[180px]">{lot.medium || 'Mixed Media'}</span>
                    <span>DOSSIER →</span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

      </div>
    </div>
  );
}
