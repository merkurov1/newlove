import Link from "next/link";
import { ArrowRight, ArrowUpRight, ArrowDown } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Private Office | Merkurov",
  description: "Heritage Architecture for the Post-Digital Age.",
};

export default function LobbyPage() {
  return (
    <main className="min-h-screen bg-white text-[#1C1917] font-serif selection:bg-black selection:text-white">
      
      {/* --- SECTION 1: HERO (THE MANIFESTO) --- */}
      <section className="min-h-screen flex flex-col justify-center px-6 md:px-12 relative border-b border-gray-100">
        
        {/* Top Meta */}
        <div className="absolute top-8 left-6 md:left-12 right-6 md:right-12 flex justify-between items-start">
           <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
             Merkurov Private Office
           </span>
           <div className="hidden md:flex flex-col items-end">
             <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
               Loc: Global / Unframed
             </span>
           </div>
        </div>

        <div className="max-w-5xl mx-auto w-full pt-20">
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-medium tracking-tight leading-[0.9] mb-12 text-black">
            I architect <br/>
            <span className="text-gray-400 italic">futures.</span>
          </h1>
          
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12">
             <div className="md:col-span-7">
                <p className="text-xl md:text-2xl text-gray-800 leading-relaxed font-serif">
                  The world is drowning in noise. Algorithms dictate attention. Politics dictate geography.
                  <br/><br/>
                  Here, there are no algorithms. Only structure.
                </p>
                
                <div className="mt-12">
                  <Link href="/advising" className="group inline-flex items-center gap-4 border-b border-black pb-1 hover:opacity-50 transition-opacity">
                    <span className="font-mono text-xs uppercase tracking-widest text-black">
                       Enter The Office
                    </span>
                    <ArrowRight size={14} />
                  </Link>
                </div>
             </div>
          </div>
        </div>
        
        <div className="absolute bottom-12 left-6 md:left-12">
           <ArrowDown size={20} className="text-gray-300 animate-bounce" />
        </div>
      </section>


      {/* --- SECTION 2: FORESIGHT (TRACK RECORD) --- */}
      <section className="py-24 md:py-32 px-6 md:px-12 border-b border-gray-100">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-32">
          
          {/* Left: Intro */}
          <div>
            <span className="block font-mono text-xs uppercase tracking-[0.2em] text-gray-400 mb-8">
              01 / The Track Record
            </span>
            <h2 className="text-4xl md:text-6xl font-medium leading-[1.1] mb-8">
              Predicting the collapse before it happens.
            </h2>
            <p className="text-lg text-gray-500 leading-relaxed max-w-md font-serif">
              I don't use crystal balls. I use forensic data analysis. Being right is boring, but profitable.
            </p>
          </div>

          {/* Right: Timeline (Minimalist) */}
          <div className="space-y-16 border-l border-gray-200 pl-8 md:pl-12 py-2">
            
            {/* 2012 */}
            <div className="relative">
              <span className="absolute -left-[37px] md:-left-[53px] top-2 w-3 h-3 bg-white border border-black rounded-full"></span>
              <div className="font-mono text-gray-400 text-xs mb-2 uppercase tracking-widest">2012 — The Splinternet</div>
              <h4 className="text-xl md:text-2xl font-medium text-black">The Fragmentation Prediction</h4>
            </div>

            {/* 2018 */}
            <div className="relative">
              <span className="absolute -left-[37px] md:-left-[53px] top-2 w-3 h-3 bg-white border border-black rounded-full"></span>
              <div className="font-mono text-gray-400 text-xs mb-2 uppercase tracking-widest">2018 — The Resistance</div>
              <h4 className="text-xl md:text-2xl font-medium text-black">The Telegram War</h4>
            </div>

            {/* 2025 */}
            <div className="relative">
              <span className="absolute -left-[37px] md:-left-[53px] top-2 w-3 h-3 bg-black rounded-full"></span>
              <div className="font-mono text-black text-xs mb-2 uppercase tracking-widest font-bold">2025 — The Reality</div>
              <h4 className="text-xl md:text-2xl font-medium text-black">The Digital Collar</h4>
            </div>

          </div>
        </div>
      </section>


      {/* --- SECTION 3: MEDIA TICKER (Clean White) --- */}
      <section className="py-12 border-b border-gray-100 overflow-hidden whitespace-nowrap bg-gray-50">
        <div className="animate-marquee inline-block font-mono text-xs md:text-sm uppercase tracking-[0.15em] text-gray-500">
          <span className="mx-12">NYT (2018): "Putin never really uses the internet..."</span>
          <span className="mx-12 text-black font-bold">MERKUROV WAS RIGHT</span>
          <span className="mx-12">WaPo (2018): "Millions of digital emigres..."</span>
          <span className="mx-12 text-black font-bold">MERKUROV WAS RIGHT</span>
          <span className="mx-12">EURACTIV (2020): "Biology is the weak link..."</span>
        </div>
      </section>


      {/* --- SECTION 4: PHILOSOPHY (Split) --- */}
      <section className="py-24 md:py-32 px-6 md:px-12 bg-white">
        <div className="max-w-7xl mx-auto">
            <span className="block font-mono text-xs uppercase tracking-[0.2em] text-gray-400 mb-16 text-center">
              02 / The Philosophy
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-24">
                {/* GRANITE */}
                <div className="p-8 border-l border-gray-200">
                    <h4 className="font-mono text-black text-xs uppercase tracking-widest mb-6">Heritage (Granite)</h4>
                    <p className="text-2xl md:text-3xl leading-snug font-serif text-gray-800">
                        My great-grandfather carved the Empire in stone. Heavy. Immovable. Eternal.
                    </p>
                    <div className="mt-8 font-mono text-[10px] text-gray-400 uppercase tracking-widest">Sergey Merkurov</div>
                </div>

                {/* ETHER */}
                <div className="p-8 border-l border-black">
                    <h4 className="font-mono text-black text-xs uppercase tracking-widest mb-6">Future (Ether)</h4>
                    <p className="text-2xl md:text-3xl leading-snug font-serif text-black">
                        I operate in the Ether. Transmuting heavy history into light, liquid digital assets.
                    </p>
                    <div className="mt-8 font-mono text-[10px] text-gray-400 uppercase tracking-widest">Anton Merkurov</div>
                </div>
            </div>
        </div>
      </section>


      {/* --- SECTION 5: PROTOCOLS (Clean Cards) --- */}
      <section className="py-24 md:py-32 px-6 md:px-12 bg-gray-50 border-t border-gray-100">
        <div className="max-w-7xl mx-auto">
            <span className="block font-mono text-xs uppercase tracking-[0.2em] text-gray-400 mb-16">
              03 / Select Protocol
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-0 border-t border-l border-gray-200 bg-white">
              
              {[
                { id: '01', title: 'Intelligence', desc: 'Forensic analysis of digital decay.', link: '/research', label: 'Research' },
                { id: '02', title: 'Capital', desc: 'Algorithmic art advisory. Data is the new marble.', link: '/advising', label: 'Advisory' },
                { id: '03', title: 'Creation', desc: 'The Symbol. 2022 unique artifacts.', link: '/heartandangel', label: 'Art' },
                { id: '04', title: 'Legacy', desc: 'The Codex. Unframed biography.', link: '/unframed', label: 'Story' }
              ].map((card) => (
                <Link key={card.id} href={card.link} className="group relative p-8 border-r border-b border-gray-200 hover:bg-gray-50 transition-colors duration-300 h-[320px] flex flex-col justify-between">
                    <div>
                        <div className="font-mono text-[10px] text-gray-400 mb-6">{card.id}</div>
                        <h3 className="text-2xl font-serif font-medium mb-4">{card.title}</h3>
                        <p className="text-sm text-gray-500 leading-relaxed font-serif">
                            {card.desc}
                        </p>
                    </div>
                    <div className="flex justify-between items-end">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400 group-hover:text-black transition-colors">{card.label}</span>
                        <ArrowUpRight size={16} className="text-gray-300 group-hover:text-black transition-colors" />
                    </div>
                </Link>
              ))}

            </div>
        </div>
      </section>


      {/* --- SECTION 6: FOOTER (Clean) --- */}
      <section className="py-32 px-6 bg-white text-center border-t border-gray-100">
        <h2 className="text-4xl md:text-5xl font-serif text-black mb-12">
            Join the Signal.
        </h2>
        
        <div className="inline-flex flex-col gap-4">
            <Link href="/journal" className="px-8 py-4 border border-gray-200 text-xs font-mono uppercase tracking-widest hover:border-black hover:bg-black hover:text-white transition-all">
              Access Journal
            </Link>
            <span className="font-serif italic text-gray-400 text-sm">
                Ignore the noise.
            </span>
        </div>

        <footer className="mt-24 text-[10px] font-mono text-gray-300 uppercase tracking-[0.2em]">
          Merkurov Private Office © 2025
        </footer>
      </section>

    </main>
  );
}