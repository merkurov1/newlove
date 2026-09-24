import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

export const revalidate = 0;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function getAuctionHouseName(lot: any): string {
  const url = (lot.source_url || '').toLowerCase();
  if (url.includes('sothebys.com')) return "Sotheby's";
  if (url.includes('christies.com')) return "Christie's";
  if (url.includes('phillips.com')) return "Phillips";
  if (url.includes('bonhams.com')) return "Bonhams";
  return lot.auction_house || "Auction House";
}

export async function generateMetadata({ params }: { params: { id: string } }) {
  const { data: lot } = await supabase
    .from('lots')
    .select('artist, title')
    .eq('id', params.id)
    .maybeSingle();

  if (!lot) return { title: 'Lot Not Found' };

  const displayTitle = [lot.artist, lot.title].filter(Boolean).join(' — ');
  return {
    title: `${displayTitle} | Curator Vault`,
  };
}

export default async function LotDetailPage({ params }: { params: { id: string } }) {
  const { data: lot, error } = await supabase
    .from('lots')
    .select('*')
    .eq('id', params.id)
    .maybeSingle();

  if (error || !lot) notFound();

  const ai = lot.ai_content || {};
  const auctionHouse = getAuctionHouseName(lot);
  const publicImg = lot.image_path?.startsWith('http')
    ? lot.image_path
    : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/artifacts/${lot.image_path}`;

  return (
    <div className="min-h-screen bg-black text-white font-sans pt-24 sm:pt-32 pb-24 px-4 sm:px-8">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* NAV & AUCTION BADGE */}
        <div className="flex justify-between items-center border-b border-zinc-800 pb-6 font-mono text-xs sm:text-sm text-zinc-400">
          <Link href="/art-engine" className="hover:text-white transition flex items-center gap-2">
            ← BACK TO ART ENGINE
          </Link>
          <a 
            href={lot.source_url} 
            target="_blank" 
            rel="noreferrer" 
            className="text-emerald-400 hover:underline uppercase tracking-widest font-mono text-xs"
          >
            VIEW AT {auctionHouse} ↗
          </a>
        </div>

        {/* MAIN HERO & DOSSIER GRID */}
        <div className="grid lg:grid-cols-12 gap-12 items-start">
          
          {/* IMAGE CONTAINER */}
          <div className="lg:col-span-5 space-y-6 sticky top-28">
            <div className="w-full bg-zinc-950 border border-zinc-800/80 rounded-2xl p-6 overflow-hidden flex items-center justify-center min-h-[400px]">
              {lot.image_path ? (
                <img 
                  src={publicImg} 
                  alt={lot.title || lot.artist} 
                  className="object-contain max-h-[600px] w-full"
                />
              ) : (
                <div className="text-sm font-mono text-zinc-600">NO IMAGE AVAILABLE</div>
              )}
            </div>

            <div className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-5 space-y-3 font-mono text-xs sm:text-sm">
              <div className="flex justify-between border-b border-zinc-800/60 pb-2 text-zinc-400">
                <span>AUCTION HOUSE</span>
                <span className="text-white font-medium">{auctionHouse}</span>
              </div>
              {ai.lot_number && (
                <div className="flex justify-between border-b border-zinc-800/60 pb-2 text-zinc-400">
                  <span>LOT NUMBER</span>
                  <span className="text-zinc-300">{ai.lot_number}</span>
                </div>
              )}
              <div className="flex justify-between text-zinc-400">
                <span>ESTIMATE</span>
                <span className="text-emerald-400 font-medium">{lot.estimate || ai.estimate_raw || 'On Request'}</span>
              </div>
            </div>
          </div>

          {/* ESSAY & CATALOG DETAILS */}
          <div className="lg:col-span-7 space-y-10 bg-zinc-900/20 border border-zinc-800/80 rounded-2xl p-6 sm:p-10">
            
            <div className="border-b border-zinc-800 pb-8 space-y-3">
              <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest block">
                CURATOR DOSSIER
              </span>
              <h1 className="font-serif text-3xl sm:text-5xl text-white leading-tight">
                {lot.artist}
              </h1>
              {ai.artist_dates && (
                <p className="text-sm font-mono text-zinc-500">{ai.artist_dates}</p>
              )}
              
              <div className="pt-4">
                <h2 className="font-serif italic text-xl sm:text-2xl text-zinc-200">
                  {lot.title} {lot.year && <span className="not-italic text-zinc-500 text-base">({lot.year})</span>}
                </h2>
                {lot.medium && <p className="text-sm text-zinc-400 mt-2 font-sans">{lot.medium}</p>}
                {lot.dimensions && <p className="text-xs font-mono text-zinc-500 mt-1">{lot.dimensions}</p>}
              </div>
            </div>

            {ai.artist_biography_summary && (
              <div className="space-y-3 bg-zinc-950/80 p-6 rounded-xl border border-zinc-800/80">
                <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-wider">Artist Bio & Context</h3>
                <p className="text-sm text-zinc-300 leading-relaxed font-sans">{ai.artist_biography_summary}</p>
              </div>
            )}

            {ai.curatorial_essay && (
              <div className="space-y-4">
                <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-3">
                  Curatorial Analysis
                </h3>
                <div className="font-serif text-base sm:text-lg text-zinc-300 leading-relaxed whitespace-pre-line space-y-4">
                  {ai.curatorial_essay}
                </div>
              </div>
            )}

            {ai.market_analysis && (
              <div className="space-y-3 bg-emerald-950/20 border border-emerald-900/40 p-6 rounded-xl">
                <h3 className="text-xs font-mono text-emerald-400 uppercase tracking-wider">Market Intelligence</h3>
                <p className="text-sm font-sans text-zinc-300 leading-relaxed">{ai.market_analysis}</p>
              </div>
            )}

            {ai.provenance && ai.provenance.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-xs font-mono text-zinc-400 uppercase tracking-wider border-b border-zinc-800 pb-3">Provenance</h3>
                <ul className="space-y-2 font-mono text-xs sm:text-sm text-zinc-400">
                  {ai.provenance.map((p: string, i: number) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-zinc-600">•</span>
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </div>

        </div>

      </div>
    </div>
  );
}
