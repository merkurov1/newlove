import Link from 'next/link';
import { createClient } from '@supabase/supabase-js';

export const revalidate = 0;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getInitials(name?: string) {
  if (!name) return 'A';
  return name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

export default async function LotsPage() {
  const { data: lots, error } = await supabase
    .from('lots')
    .select('id, artist, title, year, medium, estimate, image_path, source_url, auction_house, created_at')
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
        
        <div className="flex justify-between items-end border-b border-neutral-200 pb-8">
          <div className="space-y-1">
            <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest block">VAULT ARCHIVE</span>
            <h1 className="text-3xl sm:text-4xl font-serif text-neutral-900 font-normal">Cataloged Artifacts</h1>
          </div>
          <Link href="/art-engine" className="text-xs font-mono text-neutral-500 hover:text-neutral-900 transition">
            ← TERMINAL
          </Link>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {lots?.map((lot) => {
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
                      className="object-contain max-h-full max-w-full group-hover:scale-105 transition duration-500"
                    />
                  ) : (
                    <div className="font-serif text-2xl text-neutral-300">{getInitials(lot.artist)}</div>
                  )}
                </div>

                <div className="p-6 flex-1 flex flex-col justify-between space-y-4">
                  <div>
                    <div className="flex justify-between items-start text-neutral-400 font-mono text-[10px] uppercase tracking-wider mb-1">
                      <span>{lot.auction_house || 'AUCTION'}</span>
                      <span>{lot.estimate}</span>
                    </div>
                    <h2 className="text-lg font-serif text-neutral-900 group-hover:underline">{lot.artist}</h2>
                    <p className="text-xs text-neutral-500 italic mt-0.5">{lot.title} {lot.year && `(${lot.year})`}</p>
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

      </div>
    </div>
  );
}
