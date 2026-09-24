import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

export const revalidate = 0;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export default async function LotDetailPage({ params }: { params: { id: string } }) {
  const { data: lot, error } = await supabase
    .from('lots')
    .select('*')
    .eq('id', params.id)
    .single();

  if (error || !lot) notFound();

  const ai = lot.ai_content || {};
  const publicImg = lot.image_path?.startsWith('http')
    ? lot.image_path
    : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/artifacts/${lot.image_path}`;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 font-sans pt-12 pb-24 px-6">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* TOP NAV */}
        <div className="flex justify-between items-center border-b border-zinc-800 pb-4 font-mono text-xs text-zinc-400">
          <Link href="/lots" className="hover:text-white transition">← BACK TO VAULT ARCHIVE</Link>
          <a href={lot.source_url} target="_blank" rel="noreferrer" className="text-emerald-400 hover:underline">
            ORIGINAL AUCTION LOT ↗
          </a>
        </div>

        <div className="grid lg:grid-cols-12 gap-8 items-start">
          
          {/* IMAGE PREVIEW (5 COLS) */}
          <div className="lg:col-span-5 bg-zinc-900/40 border border-zinc-800 rounded-xl p-4 sticky top-12">
            <div className="aspect-[4/3] bg-zinc-950 rounded-lg overflow-hidden flex items-center justify-center p-2">
              <img src={publicImg} alt={lot.title} className="object-contain max-h-full max-w-full" />
            </div>
            
            <div className="mt-4 p-3 bg-zinc-950 rounded-lg border border-zinc-800/80 space-y-2 text-xs font-mono">
              <div className="flex justify-between text-zinc-400">
                <span>AUCTION HOUSE:</span>
                <span className="text-zinc-200">{lot.auction_house || "Christie's"}</span>
              </div>
              <div className="flex justify-between text-zinc-400">
                <span>ESTIMATE:</span>
                <span className="text-emerald-400">{lot.estimate || 'On Request'}</span>
              </div>
            </div>
          </div>

          {/* DOSSIER & ANALYSIS (7 COLS) */}
          <div className="lg:col-span-7 space-y-8 bg-zinc-900/20 border border-zinc-800/80 rounded-xl p-8">
            
            {/* ARTWORK HEADER */}
            <div className="border-b border-zinc-800 pb-6 space-y-2">
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest">CURATOR DOSSIER</span>
              <h1 className="text-3xl font-serif text-white">{lot.artist}</h1>
              {ai.artist_dates && <p className="text-xs font-mono text-zinc-500">{ai.artist_dates}</p>}
              
              <div className="pt-2">
                <h2 className="text-xl font-serif italic text-zinc-200">{lot.title} {lot.year && `(${lot.year})`}</h2>
                <p className="text-xs text-zinc-400 mt-1">{lot.medium}</p>
                <p className="text-xs font-mono text-zinc-500">{lot.dimensions}</p>
              </div>
            </div>

            {/* ARTIST BIOGRAPHY */}
            {ai.artist_biography_summary && (
              <div className="space-y-2 bg-zinc-950/60 p-4 rounded-lg border border-zinc-800/60">
                <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Artist Bio & Context</h3>
                <p className="text-xs text-zinc-300 leading-relaxed font-sans">{ai.artist_biography_summary}</p>
              </div>
            )}

            {/* ESSAY */}
            {ai.curatorial_essay && (
              <div className="space-y-3">
                <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-2">Curatorial Analysis</h3>
                <p className="text-sm font-serif text-zinc-300 leading-relaxed whitespace-pre-line">{ai.curatorial_essay}</p>
              </div>
            )}

            {/* MARKET ANALYSIS */}
            {ai.market_analysis && (
              <div className="space-y-3 bg-emerald-950/20 border border-emerald-900/40 p-5 rounded-lg">
                <h3 className="text-xs font-mono text-emerald-400 uppercase tracking-wider">Market Intelligence & Thesis</h3>
                <p className="text-xs font-sans text-zinc-300 leading-relaxed">{ai.market_analysis}</p>
              </div>
            )}

            {/* PROVENANCE */}
            {ai.provenance && ai.provenance.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-2">Provenance</h3>
                <ul className="space-y-1 font-mono text-xs text-zinc-400">
                  {ai.provenance.map((p: string, i: number) => (
                    <li key={i}>• {p}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* TAGS */}
            {ai.tags && (
              <div className="flex flex-wrap gap-1.5 pt-4 border-t border-zinc-800">
                {ai.tags.map((tag: string, i: number) => (
                  <span key={i} className="text-[10px] font-mono bg-zinc-800 text-zinc-400 px-2.5 py-1 rounded-full">
                    #{tag}
                  </span>
                ))}
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
}
