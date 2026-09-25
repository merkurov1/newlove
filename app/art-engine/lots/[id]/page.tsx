'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

function getAuctionHouseName(lot: any): string {
  const url = (lot.source_url || '').toLowerCase();
  if (url.includes('sothebys.com')) return "Sotheby's";
  if (url.includes('christies.com')) return "Christie's";
  if (url.includes('phillips.com')) return "Phillips";
  if (url.includes('bonhams.com')) return "Bonhams";
  return lot.auction_house || "Auction House";
}

export default function LotDetailPage({ params }: { params: { id: string } }) {
  const supabase = createClientComponentClient();
  const [lot, setLot] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isZoomed, setIsZoomed] = useState(false);

  // Состояния для внешних открытых данных
  const [wikidataInfo, setWikidataInfo] = useState<any>(null);
  const [metMuseumArtworks, setMetMuseumArtworks] = useState<any[]>([]);
  const [books, setBooks] = useState<any[]>([]);
  const [externalLoading, setExternalLoading] = useState(false);

  useEffect(() => {
    async function fetchLot() {
      const { data, error } = await supabase
        .from('lots')
        .select('*')
        .eq('id', params.id)
        .maybeSingle();

      if (error || !data) {
        setLoading(false);
        return;
      }

      setLot(data);
      setLoading(false);

      // После загрузки лота подтягиваем внешние данные по имени художника
      if (data.artist) {
        fetchExternalData(data.artist);
      }
    }
    fetchLot();
  }, [params.id, supabase]);

  // Функция параллельного запроса ко всем открытым источникам
  async function fetchExternalData(artistName: string) {
    setExternalLoading(true);
    try {
      // 1. Wikidata & Wikipedia API
      const wikiQuery = encodeURIComponent(artistName);
      const wikiRes = await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${wikiQuery}&format=json&origin=*`);
      const wikiData = await wikiRes.json();
      if (wikiData.query?.search?.[0]) {
        const pageTitle = wikiData.query.search[0].title;
        const summaryRes = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`);
        const summaryData = await summaryRes.json();
        setWikidataInfo({
          title: summaryData.title,
          extract: summaryData.extract,
          url: summaryData.content_urls?.desktop?.page
        });
      }

      // 2. The Met Museum Open Access API
      const metRes = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/search?q=${encodeURIComponent(artistName)}`);
      const metData = await metRes.json();
      if (metData.objectIDs && metData.objectIDs.length > 0) {
        // Берем первые 3 объекта для примера
        const topIds = metData.objectIDs.slice(0, 3);
        const objectPromises = topIds.map(async (id: number) => {
          const objRes = await fetch(`https://collectionapi.metmuseum.org/public/collection/v1/objects/${id}`);
          return objRes.json();
        });
        const objects = await Promise.all(objectPromises);
        setMetMuseumArtworks(objects.filter(obj => obj.primaryImageSmall));
      }

      // 3. Open Library API (Каталоги / Книги)
      const bookRes = await fetch(`https://openlibrary.org/search.json?author=${encodeURIComponent(artistName)}&limit=3`);
      const bookData = await bookRes.json();
      if (bookData.docs) {
        setBooks(bookData.docs.map((doc: any) => ({
          title: doc.title,
          year: doc.first_publish_year,
          key: doc.key
        })));
      }

    } catch (e) {
      console.error('Error fetching external enrichment data:', e);
    } finally {
      setExternalLoading(false);
    }
  }

  // Закрытие модалки по клавише Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsZoomed(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleCopyPermalink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50 text-neutral-900 font-mono text-xs pt-32 text-center flex flex-col items-center justify-center space-y-2">
        <div className="w-4 h-4 border-2 border-neutral-300 border-t-neutral-900 rounded-full animate-spin"></div>
        <span>INITIALIZING CURATORIAL DOSSIER...</span>
      </div>
    );
  }

  if (!lot) return notFound();

  const ai = lot.ai_content || {};
  const auctionHouse = getAuctionHouseName(lot);
  const publicImg = lot.image_path?.startsWith('http')
    ? lot.image_path
    : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/artifacts/${lot.image_path}`;

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans pt-20 sm:pt-28 pb-32 px-4 sm:px-8 lg:px-12 selection:bg-neutral-900 selection:text-white">
      <div className="max-w-7xl mx-auto space-y-10">
        
        {/* TOP TERMINAL HEADER */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center border-b border-neutral-200 pb-4 gap-4 font-mono text-xs text-neutral-500">
          <div className="flex items-center gap-3">
            <Link href="/art-engine" className="hover:text-neutral-900 transition flex items-center gap-1.5 uppercase tracking-wider font-medium">
              ← Terminal Vault
            </Link>
            <span className="text-neutral-300">/</span>
            <span className="text-neutral-400">DOSSIER #{lot.id ? lot.id.slice(0, 8) : 'REF'}</span>
          </div>

          <div className="flex flex-wrap gap-4 items-center">
            <button 
              onClick={handleCopyPermalink} 
              className="text-neutral-600 hover:text-neutral-900 transition underline underline-offset-4 cursor-pointer"
            >
              {copiedLink ? 'Link Copied ✓' : 'Share Permalink'}
            </button>
            <span className="text-neutral-300">•</span>
            <a 
              href={lot.source_url} 
              target="_blank" 
              rel="noreferrer" 
              className="bg-neutral-900 text-white px-3 py-1.5 hover:bg-neutral-800 transition uppercase tracking-widest font-mono text-[10px]"
            >
              Original Catalog ({auctionHouse}) ↗
            </a>
          </div>
        </div>

        {/* MAIN DOSSIER GRID */}
        <div className="grid lg:grid-cols-12 gap-10 lg:gap-14 items-start">
          
          {/* LEFT COLUMN: IMAGE & QUICK METRICS */}
          <div className="lg:col-span-5 space-y-6 lg:sticky lg:top-24">
            <div 
              onClick={() => lot.image_path && setIsZoomed(true)}
              className="w-full bg-white border border-neutral-200 p-4 sm:p-6 shadow-sm flex flex-col items-center justify-center min-h-[420px] relative group cursor-zoom-in"
            >
              <div className="absolute top-3 left-3 flex items-center gap-2 font-mono text-[9px] text-neutral-400 uppercase tracking-widest">
                <span>Visual Evidence</span>
                {lot.image_path && <span className="opacity-0 group-hover:opacity-100 transition text-neutral-900">[CLICK TO ZOOM]</span>}
              </div>

              {lot.image_path ? (
                <img 
                  src={publicImg} 
                  alt={lot.title || lot.artist} 
                  className="object-contain max-h-[580px] w-full transition duration-300 group-hover:scale-[1.01]"
                />
              ) : (
                <div className="text-xs font-mono text-neutral-300">NO VISUAL ASSET RECORDED</div>
              )}
            </div>

            {/* QUICK SPECS CARD */}
            <div className="bg-white border border-neutral-200 p-6 space-y-3 font-mono text-xs shadow-sm">
              <div className="text-[10px] text-neutral-400 uppercase tracking-widest border-b border-neutral-100 pb-2 mb-3">
                Market Parameters
              </div>
              
              <div className="flex justify-between items-center py-1 border-b border-neutral-100/60">
                <span className="text-neutral-500">HOUSE</span>
                <span className="text-neutral-900 font-semibold">{auctionHouse}</span>
              </div>

              {ai.lot_number && (
                <div className="flex justify-between items-center py-1 border-b border-neutral-100/60">
                  <span className="text-neutral-500">LOT REF</span>
                  <span className="text-neutral-800">{ai.lot_number}</span>
                </div>
              )}

              <div className="flex justify-between items-center py-1">
                <span className="text-neutral-500">ESTIMATE</span>
                <span className="text-neutral-900 font-bold bg-neutral-100 px-2 py-0.5">
                  {lot.estimate || ai.estimate_raw || 'On Request'}
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: TEXT DOSSIER & ESSAY */}
          <div className="lg:col-span-7 space-y-8 bg-white border border-neutral-200 p-6 sm:p-10 shadow-sm">
            
            {/* TITLE & ARTIST BLOCK */}
            <div className="border-b border-neutral-200 pb-8 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-widest">
                  Primary Authentication
                </span>
                {lot.year && (
                  <span className="font-mono text-xs bg-neutral-100 px-2 py-0.5 text-neutral-600">
                    {lot.year}
                  </span>
                )}
              </div>

              <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl text-neutral-900 font-normal tracking-tight">
                {lot.artist}
              </h1>
              
              {ai.artist_dates && (
                <p className="text-xs font-mono text-neutral-500">{ai.artist_dates}</p>
              )}
              
              <div className="pt-3">
                <h2 className="font-serif italic text-xl sm:text-2xl text-neutral-800 leading-snug">
                  {lot.title}
                </h2>
                
                <div className="mt-3 flex flex-wrap gap-y-1 gap-x-4 text-xs font-mono text-neutral-600">
                  {lot.medium && <span>{lot.medium}</span>}
                  {lot.dimensions && <span className="text-neutral-400">• {lot.dimensions}</span>}
                </div>
              </div>
            </div>

            {/* ARTIST BIO SUMMARY */}
            {ai.artist_biography_summary && (
              <div className="space-y-2 bg-neutral-50/80 p-5 border-l-2 border-neutral-900">
                <h3 className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                  Contextual Profile
                </h3>
                <p className="text-xs sm:text-sm text-neutral-700 leading-relaxed font-serif">
                  {ai.artist_biography_summary}
                </p>
              </div>
            )}

            {/* CURATORIAL ESSAY */}
            {ai.curatorial_essay && (
              <div className="space-y-4 pt-2">
                <div className="flex items-center gap-2 border-b border-neutral-200 pb-2">
                  <span className="w-1.5 h-1.5 bg-neutral-900 rounded-full"></span>
                  <h3 className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest font-semibold">
                    Curatorial Essay & Analysis
                  </h3>
                </div>
                <div className="font-serif text-base sm:text-lg text-neutral-800 leading-relaxed whitespace-pre-line space-y-4 pt-1">
                  {ai.curatorial_essay}
                </div>
              </div>
            )}

            {/* PROVENANCE */}
            {ai.provenance && ai.provenance.length > 0 && (
              <div className="space-y-3 pt-6 border-t border-neutral-100">
                <div className="flex items-center gap-2">
                  <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full"></span>
                  <h3 className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest font-semibold">
                    Provenance Record
                  </h3>
                </div>
                <ul className="space-y-2 font-mono text-xs text-neutral-600 pl-3 border-l border-neutral-200">
                  {ai.provenance.map((p: string, i: number) => (
                    <li key={i} className="leading-relaxed">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* --- OPEN DATA ENRICHMENT BLOCKS --- */}
            
            {/* WIKIPEDIA / WIKIDATA BLOCK */}
            {wikidataInfo && (
              <div className="space-y-2 pt-6 border-t border-neutral-200 bg-neutral-50 p-5">
                <div className="flex justify-between items-center">
                  <h3 className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                    External Academic Index (Wikipedia)
                  </h3>
                  <a href={wikidataInfo.url} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-neutral-900 underline">
                    Read Full Entry ↗
                  </a>
                </div>
                <p className="text-xs text-neutral-700 leading-relaxed font-serif">
                  {wikidataInfo.extract}
                </p>
              </div>
            )}

            {/* THE MET MUSEUM OPEN ACCESS COLLECTION */}
            {metMuseumArtworks.length > 0 && (
              <div className="space-y-3 pt-6 border-t border-neutral-200">
                <h3 className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                  Museum Collections (The Metropolitan Museum of Art)
                </h3>
                <div className="grid grid-cols-3 gap-3">
                  {metMuseumArtworks.map((art: any, i: number) => (
                    <a key={i} href={art.objectURL} target="_blank" rel="noreferrer" className="group block bg-neutral-50 border border-neutral-200 p-2">
                      <div className="h-24 w-full bg-neutral-100 mb-2 overflow-hidden flex items-center justify-center">
                        <img src={art.primaryImageSmall} alt={art.title} className="object-cover h-full w-full group-hover:scale-105 transition duration-300" />
                      </div>
                      <div className="font-mono text-[9px] text-neutral-800 truncate">{art.title}</div>
                      <div className="font-mono text-[8px] text-neutral-400">{art.objectDate}</div>
                    </a>
                  ))}
                </div>
              </div>
            )}

            {/* OPEN LIBRARY BIBLIOGRAPHY */}
            {books.length > 0 && (
              <div className="space-y-2 pt-6 border-t border-neutral-200">
                <h3 className="text-[10px] font-mono text-neutral-500 uppercase tracking-widest">
                  Associated Literature & Catalogues (Open Library)
                </h3>
                <div className="space-y-1.5">
                  {books.map((b: any, i: number) => (
                    <div key={i} className="flex justify-between items-center text-xs font-mono bg-neutral-50 px-3 py-2 border border-neutral-100">
                      <span className="text-neutral-800 truncate max-w-[80%]">{b.title}</span>
                      <span className="text-neutral-400">{b.year || 'N/A'}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {externalLoading && (
              <div className="text-[10px] font-mono text-neutral-400 text-center pt-4">
                Synchronizing external open data feeds...
              </div>
            )}

          </div>

        </div>

      </div>

      {/* FULLSCREEN ZOOM MODAL */}
      {isZoomed && (
        <div 
          onClick={() => setIsZoomed(false)}
          className="fixed inset-0 z-50 bg-neutral-950/90 backdrop-blur-sm flex items-center justify-center p-4 sm:p-10 cursor-zoom-out"
        >
          <div className="relative max-w-7xl max-h-full flex flex-col items-center justify-center">
            <button 
              onClick={() => setIsZoomed(false)}
              className="absolute -top-10 right-0 font-mono text-xs text-neutral-400 hover:text-white uppercase tracking-wider"
            >
              [CLOSE / ESC]
            </button>
            <img 
              src={publicImg} 
              alt={lot.title || lot.artist} 
              className="max-w-[95vw] max-h-[85vh] object-contain border border-neutral-800 shadow-2xl"
            />
            <div className="mt-4 text-center font-mono text-xs text-neutral-400">
              {lot.artist} — {lot.title}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
