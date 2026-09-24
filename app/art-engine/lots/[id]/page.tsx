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
    title: `${displayTitle} | Vault Catalog`,
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
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans pt-24 sm:pt-32 pb-32 px-6 sm:px-12">
      <div className="max-w-6xl mx-auto space-y-12">
        
        {/* NAV & LINK */}
        <div className="flex justify-between items-center border-b border-neutral-200 pb-6 font-mono text-xs text-neutral-500">
          <Link href="/art-engine" className="hover:text-neutral-900 transition flex items-center gap-2">
            ← ART ENGINE TERMINAL
          </Link>
          <a 
            href={lot.source_url} 
            target="_blank" 
            rel="noreferrer" 
            className="text-neutral-900 hover:underline uppercase tracking-widest font-mono text-xs"
          >
            ORIGINAL CATALOG AT {auctionHouse} ↗
          </a>
        </div>

        {/* MAIN DOSSIER GRID */}
        <div className="grid lg:grid-cols-12 gap-12 items-start">
          
          {/* IMAGE CONTAINER */}
          <div className="lg:col-span-5 space-y-6 sticky top-28">
            <div className="w-full bg-white border border-neutral-200 p-6 flex items-center justify-center min-h-[400px]">
              {lot.image_path ? (
                <img 
                  src={publicImg} 
                  alt={lot.title || lot.artist} 
                  className="object-contain max-h-[550px] w-full"
                />
              ) : (
                <div className="text-xs font-mono text-neutral-300">NO VISUAL AVAILABLE</div>
              )}
            </div>

            <div className="bg-white border border-neutral-200 p-6 space-y-3 font-mono text-xs text-neutral-600">
              <div className="flex justify-between border-b border-neutral-100 pb-2">
                <span>AUCTION HOUSE</span>
                <span className="text-neutral-900 font-bold">{auctionHouse}</span>
              </div>
              {ai.lot_number && (
                <div className="flex justify-between border-b border-neutral-100 pb-2">
                  <span>LOT NUMBER</span>
                  <span className="text-neutral-800">{ai.lot_number}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span>ESTIMATE</span>
                <span className="text-neutral-900 font-bold">{lot.estimate || ai.estimate_raw || 'On Request'}</span>
              </div>
            </div>
          </div>

          {/* DOSSIER TEXT */}
          <div className="lg:col-span-7 space-y-10 bg-white border border-neutral-200 p-8 sm:p-12">
            
            <div className="border-b border-neutral-200 pb-8 space-y-2">
              <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest block">
                CURATOR DOSSIER
              </span>
              <h1 className="font-serif text-3xl sm:text-5xl text-neutral-900 font-normal">
                {lot.artist}
              </h1>
              {ai.artist_dates && (
                <p className="text-xs font-mono text-neutral-400">{ai.artist_dates}</p>
              )}
              
              <div className="pt-4">
                <h2 className="font-serif italic text-xl sm:text-2xl text-neutral-800">
                  {lot.title} {lot.year && <span className="not-italic text-neutral-400 text-sm">({lot.year})</span>}
                </h2>
                {lot.medium && <p className="text-sm text-neutral-600 mt-2">{lot.medium}</p>}
                {lot.dimensions && <p className="text-xs font-mono text-neutral-400 mt-1">{lot.dimensions}</p>}
              </div>
            </div>

            {ai.artist_biography_summary && (
              <div className="space-y-2 bg-neutral-50 p-6 border border-neutral-100">
                <h3 className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">Artist Biography</h3>
                <p className="text-xs text-neutral-700 leading-relaxed font-serif">{ai.artist_biography_summary}</p>
              </div>
            )}

            {ai.curatorial_essay && (
              <div className="space-y-4">
                <h3 className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest border-b border-neutral-100 pb-2">
                  Curatorial Essay
                </h3>
                <div className="font-serif text-base text-neutral-800 leading-relaxed whitespace-pre-line space-y-4">
                  {ai.curatorial_essay}
                </div>
              </div>
            )}

            {ai.market_analysis && (
              <div className="space-y-2 bg-neutral-50 p-6 border border-neutral-100">
                <h3 className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">Market Context</h3>
                <p className="text-xs text-neutral-700 leading-relaxed">{ai.market_analysis}</p>
              </div>
            )}

            {ai.provenance && ai.provenance.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-neutral-100">
                <h3 className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">Provenance</h3>
                <ul className="space-y-2 font-mono text-xs text-neutral-600">
                  {ai.provenance.map((p: string, i: number) => (
                    <li key={i} className="flex gap-2">
                      <span className="text-neutral-300">•</span>
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
