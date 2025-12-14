"use client";

import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { ArrowUpRight, ArrowDownRight, Activity, Shield, Zap } from 'lucide-react';

export const metadata = {
  title: 'Silence Index | Merkurov Private Office',
  description:
    'The Silence Index — a composite tracking Heritage vs Noise (Gold, Hermes vs BTC, NVDA). Interactive chart and brief analysis.',
};

export default function SilenceIndexPage() {
  const [data, setData] = useState<any[]>([]);
  const [meta, setMeta] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/silence-index')
      .then(res => res.json())
      .then(json => {
        setData(json.data);
        setMeta(json.meta);
        setLoading(false);
      });
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-[#F2F0E9] flex items-center justify-center text-[#2C2C2C]">
      <span className="font-serif animate-pulse text-xl">Loading Data...</span>
    </div>
  );

  const isPositive = meta?.trend === 'up';

  return (
    <div className="min-h-screen bg-[#F2F0E9] text-[#1C1917] p-6 md:p-12 font-serif selection:bg-[#B91C1C] selection:text-white">
      
      {/* HEADER */}
      <header className="max-w-4xl mx-auto mb-12 border-b border-[#1C1917]/10 pb-6">
        <div className="flex justify-between items-end">
          <div>
            <h1 className="text-4xl md:text-6xl tracking-tight font-bold mb-2">
              The Silence Index
            </h1>
            <p className="text-[#57534E] text-sm md:text-base italic max-w-md">
              "Volatility is a tax on the impatient. We track the ratio of Heritage (Gold, Hermes) to Hype (BTC, Nvidia)."
            </p>
          </div>
          <div className="text-right hidden md:block">
            <div className="text-xs uppercase tracking-widest text-[#57534E] mb-1">Current Value</div>
            <div className="text-5xl font-mono">{meta?.currentValue ?? 0}</div>
          </div>
        </div>
      </header>

      {/* MAIN METRIC MOBILE */}
      <div className="md:hidden mb-8 text-center">
        <div className="text-5xl sm:text-6xl font-mono mb-2">{meta?.currentValue ?? 0}</div>
        <div
          className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm ${
            isPositive ? 'bg-[#E7E5DE] text-green-800' : 'bg-[#E7E5DE] text-[#B91C1C]'
          }`}
        >
          {isPositive ? <ArrowUpRight size={16} /> : <ArrowDownRight size={16} />}
          {Math.abs(meta?.percentChange ?? 0)}% (24h)
        </div>
      </div>

      {/* CHART AREA */}
      <main className="max-w-5xl mx-auto h-[260px] sm:h-[320px] md:h-[500px] mb-12 md:mb-16 relative">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <XAxis 
              dataKey="date" 
              hide={true} 
            />
            <YAxis 
              domain={['auto', 'auto']} 
              hide={true} 
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#F2F0E9', border: '1px solid #1C1917', fontFamily: 'monospace' }}
              itemStyle={{ color: '#1C1917' }}
              formatter={(value: number) => [value, 'Index']}
              labelStyle={{ color: '#57534E', marginBottom: '5px' }}
            />
            {/* Основная линия Индекса */}
            <Line 
              type="monotone" 
              dataKey="value" 
              stroke="#1C1917" 
              strokeWidth={2} 
              dot={false}
              activeDot={{ r: 4, fill: '#1C1917' }}
            />
            {/* Линия тренда (Reference) - среднее значение */}
            <ReferenceLine y={meta.currentValue} stroke="#B91C1C" strokeDasharray="3 3" opacity={0.3} />
          </LineChart>
        </ResponsiveContainer>

        {/* Labels on Chart */}
        <div className="absolute top-0 left-0 text-xs font-mono text-[#57534E]">High Sensitivity</div>
        <div className="absolute bottom-0 right-0 text-xs font-mono text-[#57534E]">T-30 Days</div>
      </main>

      {/* INSIGHTS GRID */}
      <section className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 border-t border-[#1C1917]/10 pt-12">
        
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[#57534E]">
            <Shield size={16} />
            <h3 className="text-xs uppercase tracking-widest font-bold">The Silence Basket</h3>
          </div>
          <p className="text-sm leading-relaxed">
            Composed of Assets that reject time: Physical Gold (XAU) and Hermes (RMS.PA). Represents stability and provenance.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[#57534E]">
            <Zap size={16} />
            <h3 className="text-xs uppercase tracking-widest font-bold">The Noise Basket</h3>
          </div>
          <p className="text-sm leading-relaxed">
            Composed of Assets driven by attention: Bitcoin (BTC) and Nvidia (NVDA). Represents volatility and hype cycles.
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-[#57534E]">
            <Activity size={16} />
            <h3 className="text-xs uppercase tracking-widest font-bold">Merkurov Analysis</h3>
          </div>
          <p className="text-sm leading-relaxed font-mono text-[#B91C1C]">
            {isPositive 
              ? "STATUS: SILENCE PREVAILS. Capital is seeking refuge in history." 
              : "STATUS: NOISE DOMINATES. The market is drunk on future promises."}
          </p>
        </div>

      </section>

      <footer className="max-w-4xl mx-auto mt-24 text-center text-xs text-[#57534E] uppercase tracking-widest opacity-50">
        Merkurov Private Office © 2025 • Data via Yahoo Finance • Zero-Waste Execution
      </footer>
    </div>
  );
}