import React from 'react';
import { createClient } from '../../../lib/supabase/server';

type CountMap = Record<string, number>;

async function fetchShares() {
  const supabase = createClient({ useServiceRole: true });
  const { data, error } = await supabase
    .from('liveheart_shares')
    .select('slug, title, dna, created_at')
    .order('created_at', { ascending: false })
    .limit(10000);

  if (error) throw error;
  return data || [];
}

export default async function Page() {
  let rows: any[] = [];
  try {
    rows = await fetchShares();
  } catch (err) {
    console.error('Failed to load shares', err);
  }

  const total = rows.length;

  const byStructure: CountMap = {};
  const byPhysics: CountMap = {};
  const byScale: CountMap = {};

  rows.forEach((r) => {
    const dna = r.dna || {};
    const s = (dna.structure || 'UNKNOWN').toString();
    const p = (dna.physics || 'UNKNOWN').toString();
    const sc = (dna.scaleMode || 'UNKNOWN').toString();
    byStructure[s] = (byStructure[s] || 0) + 1;
    byPhysics[p] = (byPhysics[p] || 0) + 1;
    byScale[sc] = (byScale[sc] || 0) + 1;
  });

  const top = rows.slice(0, 12);

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-light mb-6">LiveHeart — Statistics</h1>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="p-4 bg-white/5 rounded-lg">
            <div className="text-sm text-gray-300">Total saved artifacts</div>
            <div className="text-3xl font-semibold">{total}</div>
          </div>
          <div className="p-4 bg-white/5 rounded-lg">
            <div className="text-sm text-gray-300">Unique structures</div>
            <div className="text-3xl font-semibold">{Object.keys(byStructure).length}</div>
          </div>
          <div className="p-4 bg-white/5 rounded-lg">
            <div className="text-sm text-gray-300">Unique physics</div>
            <div className="text-3xl font-semibold">{Object.keys(byPhysics).length}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <section className="bg-white/5 p-4 rounded-lg">
            <h2 className="text-lg mb-3">By Structure</h2>
            <ul className="space-y-2 text-sm">
              {Object.entries(byStructure).sort((a,b)=>b[1]-a[1]).map(([k,v])=> (
                <li key={k} className="flex justify-between">
                  <span className="text-gray-200">{k}</span>
                  <span className="font-medium">{v}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-white/5 p-4 rounded-lg">
            <h2 className="text-lg mb-3">By Physics</h2>
            <ul className="space-y-2 text-sm">
              {Object.entries(byPhysics).sort((a,b)=>b[1]-a[1]).map(([k,v])=> (
                <li key={k} className="flex justify-between">
                  <span className="text-gray-200">{k}</span>
                  <span className="font-medium">{v}</span>
                </li>
              ))}
            </ul>
          </section>

          <section className="bg-white/5 p-4 rounded-lg">
            <h2 className="text-lg mb-3">By Scale Mode</h2>
            <ul className="space-y-2 text-sm">
              {Object.entries(byScale).sort((a,b)=>b[1]-a[1]).map(([k,v])=> (
                <li key={k} className="flex justify-between">
                  <span className="text-gray-200">{k}</span>
                  <span className="font-medium">{v}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="mb-8">
          <h2 className="text-2xl mb-4">Recent artifacts</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {top.map((r) => {
              const palette = (r.dna?.palette && Array.isArray(r.dna.palette)) ? r.dna.palette : ['#ff6b6b'];
              return (
                <a key={r.slug} href={`/liveheart/${r.slug}`} className="block p-3 bg-white/3 rounded-lg hover:scale-[1.02] transition-transform">
                  <div className="h-28 mb-2 rounded-md overflow-hidden" style={{ background: `linear-gradient(135deg, ${palette[0]}, ${palette[1]||palette[0]})` }} />
                  <div className="text-sm text-gray-200 truncate">{r.title ?? r.dna?.name ?? r.slug}</div>
                  <div className="text-xs text-gray-400">{new Date(r.created_at).toLocaleString()}</div>
                </a>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
