import Link from 'next/link';
import { ArrowRight, BarChart3, Shield, Zap } from 'lucide-react';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Merkurov | Private Office',
  description: 'Data is the new marble. Art advisory and heritage architecture.',
};

export default function Home() {
  return (
    <main className="min-h-screen bg-[#F2F0E9] text-[#1C1917] font-serif selection:bg-[#B91C1C] selection:text-white">

      {/* HERO SECTION */}
      <section className="border-b border-[#1C1917] pt-20 pb-16 px-4 md:px-8">
        <div className="max-w-7xl mx-auto text-center">
            
            <div className="inline-flex items-center gap-2 px-3 py-1 border border-[#1C1917] rounded-full mb-8 bg-white">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#B91C1C] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#B91C1C]"></span>
                </span>
                <span className="text-[10px] font-mono uppercase tracking-widest">
                    Executive Build v.3.0
                </span>
            </div>

            <h1 className="text-5xl md:text-8xl font-black uppercase tracking-tighter leading-[0.9] mb-8">
                Selling Silence<br/>
                <span className="font-serif italic font-normal text-4xl md:text-7xl lowercase tracking-normal text-[#57534E]">and</span><br/>
                Structure.
            </h1>

            <p className="max-w-2xl mx-auto text-lg md:text-xl font-serif italic text-[#57534E] mb-12 leading-relaxed">
                "In a noisy world, history is the only reliable asset class. 
                I transmute heritage into equity for the intellectual elite."
            </p>

            {/* QUICK ACTIONS */}
            <div className="flex flex-col sm:flex-row justify-center gap-4 font-mono text-xs uppercase tracking-widest">
                <Link href="/lobby" className="bg-[#1C1917] text-[#F2F0E9] px-8 py-4 hover:bg-[#B91C1C] transition-colors flex items-center justify-center gap-2">
                    Enter Lobby <ArrowRight size={14}/>
                </Link>
                <Link href="/journal" className="border border-[#1C1917] px-8 py-4 hover:bg-white transition-colors flex items-center justify-center gap-2">
                    Read Intelligence
                </Link>
            </div>
        </div>
      </section>

      {/* THE DEPARTMENTS (GRID NAVIGATION) */}
      <section className="border-b border-[#1C1917]">
          <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-[#1C1917]">
              
              {/* DEPT 1: ART */}
              <Link href="/heartandangel" className="group block p-8 md:p-12 hover:bg-white transition-all h-full">
                 <div className="flex justify-between items-start mb-12">
                    <span className="font-mono text-xs text-[#B91C1C]">01</span>
                    <Zap size={20} className="text-[#57534E] group-hover:text-[#B91C1C]"/>
                 </div>
                 <h2 className="text-4xl font-bold mb-4 group-hover:underline decoration-2 underline-offset-4">Art</h2>
                 <p className="font-mono text-xs uppercase tracking-widest text-[#57534E] mb-6">
                    The Ritual
                 </p>
                 <p className="text-sm leading-relaxed opacity-80">
                    2022 unique artifacts created in the void. Pure transmission of empathy without algorithmic interference.
                 </p>
              </Link>

              {/* DEPT 2: SELECTION */}
              <Link href="/selection" className="group block p-8 md:p-12 hover:bg-white transition-all h-full">
                 <div className="flex justify-between items-start mb-12">
                    <span className="font-mono text-xs text-[#B91C1C]">02</span>
                    <BarChart3 size={20} className="text-[#57534E] group-hover:text-[#B91C1C]"/>
                 </div>
                 <h2 className="text-4xl font-bold mb-4 group-hover:underline decoration-2 underline-offset-4">Selection</h2>
                 <p className="font-mono text-xs uppercase tracking-widest text-[#57534E] mb-6">
                    The Inventory
                 </p>
                 <p className="text-sm leading-relaxed opacity-80">
                    Curated works. Buffet & Non-conformists. Assets vetted for provenance and liquidity.
                 </p>
              </Link>

              {/* DEPT 3: ADVISING */}
              <Link href="/advising" className="group block p-8 md:p-12 hover:bg-white transition-all h-full">
                 <div className="flex justify-between items-start mb-12">
                    <span className="font-mono text-xs text-[#B91C1C]">03</span>
                    <Shield size={20} className="text-[#57534E] group-hover:text-[#B91C1C]"/>
                 </div>
                 <h2 className="text-4xl font-bold mb-4 group-hover:underline decoration-2 underline-offset-4">Advising</h2>
                 <p className="font-mono text-xs uppercase tracking-widest text-[#57534E] mb-6">
                    The Office
                 </p>
                 <p className="text-sm leading-relaxed opacity-80">
                    Private acquisition and legacy architecture. We maintain silence while you build capital.
                 </p>
              </Link>

          </div>
      </section>

      {/* FOOTER MANIFESTO */}
      <section className="py-24 px-6 text-center">
        <p className="max-w-xl mx-auto font-mono text-xs leading-loose text-[#57534E]">
            MERKUROV PRIVATE OFFICE IS A NON-JURISDICTIONAL ENTITY OPERATING AT THE INTERSECTION OF HERITAGE, TECHNOLOGY, AND FINANCE. <br/>
            DATA IS THE NEW MARBLE.
        </p>
        <div className="mt-12 opacity-50">
             <div className="font-serif italic text-xl">A.M.</div>
        </div>
      </section>

    </main>
  );
}