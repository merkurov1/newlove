import React from 'react';
import { createClient } from '../../../lib/supabase/server';

// --- TYPES ---
type ShareData = {
  slug: string;
  title: string | null;
  dna: any;
  created_at: string;
};

// --- DATA FETCHING ---
async function fetchShares() {
  const supabase = createClient({ useServiceRole: true });
  const { data, error } = await supabase
    .from('liveheart_shares')
    .select('slug, title, dna, created_at')
    .order('created_at', { ascending: false })
    .limit(5000); // Limit for performance

  if (error) throw error;
  return (data || []) as ShareData[];
}

// --- COMPONENTS ---

// 1. The Stat Bar (Visualizing distribution)
const StatGroup = ({ title, data }: { title: string, data: Record<string, number> }) => {
  const sorted = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const maxVal = sorted[0]?.[1] || 1;

  return (
    <div className="border border-white/10 p-6 bg-white/[0.02]">
      <h3 className="text-[10px] uppercase tracking-[0.2em] text-white/40 mb-4 font-mono">
        {title} Distribution
      </h3>
      <div className="space-y-3">
        {sorted.map(([label, count]) => (
          <div key={label} className="group">
            <div className="flex justify-between text-xs text-white/70 mb-1 font-mono">
              <span>{label}</span>
              <span className="opacity-50">{count}</span>
            </div>
            <div className="h-[2px] w-full bg-white/5 relative overflow-hidden">
              <div 
                className="absolute top-0 left-0 h-full bg-white group-hover:bg-cyan-400 transition-colors duration-300"
                style={{ width: `${(count / maxVal) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

// 2. The KPI Box (Big Numbers)
const KpiBox = ({ label, value, sub }: { label: string, value: string | number, sub?: string }) => (
  <div className="border border-white/10 p-6 flex flex-col justify-between h-32 hover:bg-white/[0.02] transition-colors">
    <span className="text-[9px] uppercase tracking-[0.2em] text-white/40 font-mono">{label}</span>
    <div>
      <div className="text-4xl font-light tracking-tight text-white">{value}</div>
      {sub && <div className="text-[10px] text-white/30 mt-1 font-mono">{sub}</div>}
    </div>
  </div>
);

// --- PAGE ---
export default async function StatisticsPage() {
  let rows: ShareData[] = [];
  try {
    rows = await fetchShares();
  } catch (err) {
    console.error('Failed to load shares', err);
  }

  // --- PROCESSING ---
  const total = rows.length;
  
  // Counters
  const stats = {
    structure: {} as Record<string, number>,
    physics: {} as Record<string, number>,
    scale: {} as Record<string, number>,
    palettes: {} as Record<string, number>,
  };

  rows.forEach((r) => {
    const dna = r.dna || {};
    const s = (dna.structure || 'UNKNOWN').toString();
    const p = (dna.physics || 'UNKNOWN').toString();
    const sc = (dna.scaleMode || 'UNKNOWN').toString();
    // Clean up palette name if possible (sometimes it's full DNA string)
    const pal = (dna.name ? dna.name.split(' ')[0] : 'UNKNOWN').toString();

    stats.structure[s] = (stats.structure[s] || 0) + 1;
    stats.physics[p] = (stats.physics[p] || 0) + 1;
    stats.scale[sc] = (stats.scale[sc] || 0) + 1;
    stats.palettes[pal] = (stats.palettes[pal] || 0) + 1;
  });

  const top = rows.slice(0, 24); // Show more recent items

  return (
    <div className="min-h-screen bg-black text-white selection:bg-white selection:text-black">
      
      {/* HEADER */}
      <header className="border-b border-white/10 p-6 md:p-12">
        <div className="max-w-7xl mx-auto">
          <div className="text-[10px] font-mono text-white/40 mb-2 uppercase tracking-[0.3em]">
            Merkurov System // Telemetry
          </div>
          <h1 className="text-5xl md:text-6xl font-extralight tracking-tight mb-4">
            The Ledger
          </h1>
          <p className="text-sm text-white/50 max-w-xl font-light">
            Real-time analytics of generated artifacts. Tracking entropy, structure, and user chaos across the network.
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 md:p-12">
        
        {/* KPI GRID */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-12">
          <KpiBox label="Total Artifacts" value={total} sub="GENERATED & SAVED" />
          <KpiBox label="Unique Structures" value={Object.keys(stats.structure).length} sub="GEOMETRY TYPES" />
          <KpiBox label="Physics Engines" value={Object.keys(stats.physics).length} sub="BEHAVIOR MODES" />
          <KpiBox label="Dominant Palette" value={
             Object.entries(stats.palettes).sort((a,b)=>b[1]-a[1])[0]?.[0] || "N/A"
          } sub="MOST POPULAR AESTHETIC" />
        </div>

        {/* ANALYTICS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-16">
          <StatGroup title="Structure" data={stats.structure} />
          <StatGroup title="Physics" data={stats.physics} />
          <StatGroup title="Scale Mode" data={stats.scale} />
        </div>

        {/* RECENT ARTIFACTS (GALLERY) */}
        <div className="border-t border-white/10 pt-12">
          <div className="flex justify-between items-end mb-8">
            <h2 className="text-2xl font-light tracking-wide">Recent Signals</h2>
            <div className="text-[10px] font-mono text-white/40">LATEST 24 ENTRIES</div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-px bg-white/10 border border-white/10">
            {top.map((r) => {
              const palette = (r.dna?.palette && Array.isArray(r.dna.palette)) 
                ? r.dna.palette 
                : ['#333', '#000'];
              
              const grad = `linear-gradient(135deg, hsla(${palette[0]}, 1) 0%, hsla(${palette[1]||palette[0]}, 1) 100%)`;

              return (
                <a 
                  key={r.slug} 
                  href={`/liveheart/${r.slug}`} 
                  className="group relative aspect-square bg-black p-4 hover:bg-white/[0.03] transition-colors overflow-hidden"
                >
                  {/* Color Orb */}
                  <div 
                    className="w-8 h-8 rounded-full mb-3 opacity-80 group-hover:scale-110 transition-transform duration-500 blur-sm" 
                    style={{ background: grad }} 
                  />
                  
                  {/* Data */}
                  <div className="space-y-1 relative z-10">
                    <div className="text-[9px] font-mono text-white/30 uppercase tracking-widest">
                        {r.dna?.structure || "UNKNOWN"}
                    </div>
                    <div className="text-xs font-medium text-white/90 truncate group-hover:text-cyan-400 transition-colors">
                        {r.title || r.dna?.name || "Untitled"}
                    </div>
                    <div className="text-[9px] text-white/20 font-mono mt-2">
                        {new Date(r.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                    </div>
                  </div>

                  {/* Hover Border Effect */}
                  <div className="absolute inset-0 border border-white/0 group-hover:border-white/20 transition-colors pointer-events-none" />
                </a>
              );
            })}
          </div>
        </div>

      </main>
    </div>
  );
}