'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

export default function ArtEngineDashboard() {
  const supabase = createClientComponentClient();
  const [user, setUser] = useState<any>(null);
  const [loadingUser, setLoadingUser] = useState(true);

  // Parser state
  const [url, setUrl] = useState('');
  const [parsing, setParsing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [parsedData, setParsedData] = useState<any>(null);
  const [generatedLot, setGeneratedLot] = useState<any>(null);
  const [statusMessage, setStatusMessage] = useState('');

  // Lots state
  const [lots, setLots] = useState<any[]>([]);
  const [loadingLots, setLoadingLots] = useState(true);

  // Active Tab
  const [activeTab, setActiveTab] = useState<'parser' | 'vault'>('parser');

  useEffect(() => {
    async function getUser() {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setLoadingUser(false);
    }
    getUser();
    fetchLots();
  }, []);

  async function fetchLots() {
    setLoadingLots(true);
    const { data, error } = await supabase
      .from('lots')
      .select('id, artist, title, year, medium, estimate, image_path, source_url, auction_house, created_at')
      .order('created_at', { ascending: false })
      .limit(12);

    if (!error && data) {
      setLots(data);
    }
    setLoadingLots(false);
  }

  // Passkey / Login handler
  async function handlePasskeyLogin() {
    try {
      setLoadingUser(true);
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github', // или текущий настроенный провайдер Passkey
      });
      if (error) throw error;
    } catch (err: any) {
      alert(err.message || 'Auth failed');
    } finally {
      setLoadingUser(false);
    }
  }

  // Step 1: Parse URL
  async function handleParse() {
    if (!url) return;
    setParsing(true);
    setStatusMessage('Fetching lot metadata & images...');
    setParsedData(null);
    setGeneratedLot(null);

    try {
      const res = await fetch('/api/admin/parse-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to parse');

      setParsedData(data);
      setStatusMessage('Parsing complete. Ready to enrich with Curator AI.');
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setParsing(false);
    }
  }

  // Step 2: Enrich via AI + Wiki
  async function handleGenerate() {
    if (!parsedData) return;
    setGenerating(true);
    setStatusMessage('Enriching context via Wikipedia API & OpenRouter AI...');

    try {
      const res = await fetch('/api/admin/generate_lot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist: parsedData.artist,
          title: parsedData.title,
          link: url,
          specs: parsedData.extracted,
          rawData: parsedData.rawData,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate');

      setGeneratedLot(data.lot);
      setStatusMessage('Dossier enriched! Ready to commit to Vault.');
    } catch (err: any) {
      setStatusMessage(`Error: ${err.message}`);
    } finally {
      setGenerating(false);
    }
  }

  // Step 3: Save to Supabase
  async function handleSave() {
    if (!generatedLot) return;
    setSaving(true);
    setStatusMessage('Storing artifact image and records into Supabase Vault...');

    try {
      const res = await fetch('/api/admin/save-lot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artist: generatedLot.artist,
          title: generatedLot.title,
          link: url,
          image_url: parsedData?.image_url,
          ai_content: generatedLot,
          specs: parsedData?.extracted,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save');

      setStatusMessage('Saved successfully!');
      fetchLots(); // Refresh vault list
      setActiveTab('vault');
    } catch (err: any) {
      setStatusMessage(`Save Error: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-black text-zinc-100 font-sans pt-24 sm:pt-28 pb-20 px-4 sm:px-8">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* TOP BAR / ENGINE HEADER */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-zinc-800 pb-6">
          <div>
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-mono text-emerald-400 tracking-widest uppercase">CURATOR ENGINE v2.0</span>
            </div>
            <h1 className="text-3xl font-serif text-white mt-1">Art Intelligence Terminal</h1>
          </div>

          {/* AUTH STATUS & ACTION */}
          <div className="flex items-center gap-4 bg-zinc-900/80 border border-zinc-800 px-4 py-2 rounded-xl text-xs font-mono">
            {loadingUser ? (
              <span className="text-zinc-500">Checking session...</span>
            ) : user ? (
              <div className="flex items-center gap-3">
                <span className="text-zinc-400">Authenticated: <strong className="text-white">{user.email || 'Passkey User'}</strong></span>
                <span className="text-xs bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 rounded">Active</span>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <span className="text-zinc-400">Guest Mode</span>
                <button 
                  onClick={handlePasskeyLogin} 
                  className="bg-white text-black px-3 py-1 rounded font-semibold hover:bg-zinc-200 transition"
                >
                  Passkey Login
                </button>
              </div>
            )}
          </div>
        </div>

        {/* NAVIGATION TABS */}
        <div className="flex gap-2 border-b border-zinc-800/80 pb-3">
          <button
            onClick={() => setActiveTab('parser')}
            className={`px-5 py-2.5 rounded-lg font-mono text-xs uppercase tracking-wider transition ${
              activeTab === 'parser' 
                ? 'bg-zinc-800 text-white border border-zinc-700' 
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            01. Ingestion & AI Enrichment
          </button>
          <button
            onClick={() => setActiveTab('vault')}
            className={`px-5 py-2.5 rounded-lg font-mono text-xs uppercase tracking-wider transition ${
              activeTab === 'vault' 
                ? 'bg-zinc-800 text-white border border-zinc-700' 
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900'
            }`}
          >
            02. Vault Archive ({lots.length})
          </button>
        </div>

        {/* TAB 1: PARSER TERMINAL */}
        {activeTab === 'parser' && (
          <div className="space-y-8">
            
            {/* INPUT PANEL */}
            <div className="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 space-y-4">
              <label className="block font-mono text-xs text-zinc-400 uppercase tracking-wider">
                Auction Lot URL (Sotheby's, Christie's, Phillips)
              </label>
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  type="url"
                  placeholder="https://www.sothebys.com/en/buy/auction/..."
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white font-mono focus:outline-none focus:border-emerald-500 transition"
                />
                <button
                  onClick={handleParse}
                  disabled={parsing || !url}
                  className="bg-white text-black font-semibold text-xs uppercase tracking-wider px-6 py-3 rounded-xl hover:bg-zinc-200 disabled:opacity-50 transition"
                >
                  {parsing ? 'Parsing Lot...' : 'Fetch Metadata'}
                </button>
              </div>

              {statusMessage && (
                <div className="font-mono text-xs text-emerald-400 bg-emerald-950/30 border border-emerald-900/50 px-4 py-2.5 rounded-lg">
                  &gt; {statusMessage}
                </div>
              )}
            </div>

            {/* PREVIEW & GENERATION GRID */}
            {parsedData && (
              <div className="grid lg:grid-cols-12 gap-8 items-start">
                
                {/* PARSED SUMMARY (5 COLS) */}
                <div className="lg:col-span-5 bg-zinc-900/30 border border-zinc-800 rounded-2xl p-6 space-y-4">
                  <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block">EXTRACTED METADATA</span>
                  
                  {parsedData.image_url && (
                    <div className="aspect-[4/3] bg-zinc-950 rounded-xl overflow-hidden flex items-center justify-center border border-zinc-800 p-2">
                      <img src={parsedData.image_url} alt="Lot preview" className="object-contain max-h-full" />
                    </div>
                  )}

                  <div className="space-y-2 font-mono text-xs">
                    <div>
                      <span className="text-zinc-500">ARTIST:</span> <span className="text-white font-bold">{parsedData.artist || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">TITLE:</span> <span className="text-zinc-200">{parsedData.title || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-zinc-500">HOUSE:</span> <span className="text-emerald-400">{parsedData.auction_house}</span>
                    </div>
                  </div>

                  {!generatedLot && (
                    <button
                      onClick={handleGenerate}
                      disabled={generating}
                      className="w-full bg-emerald-500 text-black font-semibold font-mono text-xs uppercase tracking-wider py-3 rounded-xl hover:bg-emerald-400 transition"
                    >
                      {generating ? 'Enriching with AI...' : 'Generate Dossier & Market Analysis →'}
                    </button>
                  )}
                </div>

                {/* AI DOSSIER REVIEW (7 COLS) */}
                {generatedLot && (
                  <div className="lg:col-span-7 bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 sm:p-8 space-y-6">
                    <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
                      <span className="text-xs font-mono text-emerald-400 uppercase tracking-widest">AI DOSSIER PREVIEW</span>
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-emerald-400 text-black font-semibold font-mono text-xs uppercase tracking-wider px-5 py-2 rounded-lg hover:bg-emerald-300 transition"
                      >
                        {saving ? 'Saving...' : 'Commit to Vault'}
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <h2 className="text-2xl font-serif text-white">{generatedLot.artist}</h2>
                        <p className="text-sm font-serif italic text-zinc-300">{generatedLot.title} ({generatedLot.year})</p>
                      </div>

                      {generatedLot.artist_biography_summary && (
                        <div className="p-4 bg-zinc-950 rounded-xl border border-zinc-800 text-xs text-zinc-300 space-y-1">
                          <span className="font-mono text-[10px] text-zinc-500 uppercase block">Artist Bio</span>
                          <p>{generatedLot.artist_biography_summary}</p>
                        </div>
                      )}

                      {generatedLot.curatorial_essay && (
                        <div className="space-y-1">
                          <span className="font-mono text-[10px] text-zinc-500 uppercase block">Curatorial Essay</span>
                          <p className="text-xs font-serif text-zinc-300 leading-relaxed whitespace-pre-line">{generatedLot.curatorial_essay}</p>
                        </div>
                      )}

                      {generatedLot.market_analysis && (
                        <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-xl text-xs text-zinc-300 space-y-1">
                          <span className="font-mono text-[10px] text-emerald-400 uppercase block">Market Intelligence</span>
                          <p>{generatedLot.market_analysis}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

              </div>
            )}

          </div>
        )}

        {/* TAB 2: VAULT GALLERY */}
        {activeTab === 'vault' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center border-b border-zinc-800 pb-4">
              <span className="text-xs font-mono text-zinc-400 uppercase tracking-widest">INDEXED ARTIFACTS</span>
              <button onClick={fetchLots} className="text-xs font-mono text-emerald-400 hover:underline">
                REFRESH GALLERY ↻
              </button>
            </div>

            {loadingLots ? (
              <div className="py-12 text-center font-mono text-xs text-zinc-500">Loading cataloged lots...</div>
            ) : lots.length === 0 ? (
              <div className="py-12 text-center font-mono text-xs text-zinc-500">No lots in vault yet. Use the parser tab to enrich and add works.</div>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {lots.map((lot) => {
                  const publicImg = lot.image_path?.startsWith('http')
                    ? lot.image_path
                    : `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/artifacts/${lot.image_path}`;

                  return (
                    <Link
                      key={lot.id}
                      href={`/lots/${lot.id}`}
                      className="group bg-zinc-900/40 border border-zinc-800 rounded-xl overflow-hidden hover:border-zinc-600 transition flex flex-col"
                    >
                      <div className="aspect-[4/3] bg-zinc-950 relative overflow-hidden flex items-center justify-center p-4 border-b border-zinc-800/60">
                        {lot.image_path ? (
                          <img
                            src={publicImg}
                            alt={lot.title}
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
            )}
          </div>
        )}

      </div>
    </div>
  );
}
