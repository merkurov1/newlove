import Link from "next/link";
import { ArrowRight, ArrowUpRight, ArrowDown } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Private Office | Merkurov",
  description: "Heritage Architecture for the Post-Digital Age.",
};

export default function LobbyPage() {
  return (
    <main className="min-h-screen bg-[#FDFBF7] text-[#111] font-sans selection:bg-black selection:text-white">
      {/* Decorative border top */}
      <div className="h-1 w-full bg-black fixed top-0 z-50" />
      
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

        <div className="max-w-5xl mx-auto w-full pt-20 text-center">
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-serif font-medium tracking-tight leading-[0.9] mb-8 text-black">
            I architect <br/>
            <span className="text-gray-400 italic">futures.</span>
          </h1>

          <div className="mx-auto max-w-2xl">
            <p className="text-xl md:text-2xl text-gray-800 leading-relaxed font-serif mb-8">
              The world is drowning in noise. Algorithms dictate attention. Politics dictate geography.
              <br/><br/>
              Here, there are no algorithms. Only structure.
            </p>

            <div className="mt-6">
              <Link href="/advising" className="group inline-flex items-center gap-4 border-b border-black pb-1 hover:opacity-50 transition-opacity">
                <span className="font-mono text-xs uppercase tracking-widest text-black">Enter The Office</span>
                <ArrowRight size={14} />
              </Link>
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
            <h2 className="text-4xl md:text-6xl font-serif font-medium leading-[1.1] mb-8">
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
              <h4 className="text-xl md:text-2xl font-serif font-medium text-black">The Fragmentation Prediction</h4>
            </div>

            {/* 2018 */}
            <div className="relative">
              <span className="absolute -left-[37px] md:-left-[53px] top-2 w-3 h-3 bg-white border border-black rounded-full"></span>
              <div className="font-mono text-gray-400 text-xs mb-2 uppercase tracking-widest">2018 — The Resistance</div>
              <h4 className="text-xl md:text-2xl font-serif font-medium text-black">The Telegram War</h4>
            </div>

            {/* 2025 */}
            <div className="relative">
              <span className="absolute -left-[37px] md:-left-[53px] top-2 w-3 h-3 bg-black rounded-full"></span>
              <div className="font-mono text-black text-xs mb-2 uppercase tracking-widest font-bold">2025 — The Reality</div>
              <h4 className="text-xl md:text-2xl font-serif font-medium text-black">The Digital Collar</h4>
            </div>

          </div>
        </div>
      </section>


      {/* --- SECTION 3: MEDIA TICKER (Clean White) --- */}
      <section className="py-12 border-b border-gray-100 overflow-hidden whitespace-nowrap bg-gray-50">
        <div className="animate-marquee inline-block">
          <span className="text-xl md:text-3xl font-mono text-zinc-400 mx-8">
            <span className="text-white font-bold">THE NEW YORK TIMES (2018):</span> "Putin never really uses the internet, so he doesn't understand how it works." — Anton Merkurov
          </span>
          <span className="text-xl md:text-3xl font-mono text-zinc-500 mx-8">///</span>
          <span className="text-xl md:text-3xl font-mono text-zinc-400 mx-8">
            <span className="text-white font-bold">THE WASHINGTON POST (2018):</span> "The result will be millions of digital emigres turning their backs on the state."
          </span>
          <span className="text-xl md:text-3xl font-mono text-zinc-500 mx-8">///</span>
          <span className="text-xl md:text-3xl font-mono text-zinc-400 mx-8">
            <span className="text-white font-bold">EURACTIV (2020):</span> "The main danger is physical access to the device. Biology is the weak link."
          </span>
          <span className="text-xl md:text-3xl font-mono text-zinc-500 mx-8">///</span>
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
                { id: '01', title: 'INTELLIGENCE', desc: 'Deep-dive forensic analysis of geopolitical fracture and digital decay. We map the cracks in the global system before they break, providing asymmetric information for those who cannot afford to be wrong.', link: '/research', label: 'Research' },
                  { id: '02', title: 'CAPITAL', desc: 'Converting cultural chaos into liquid assets. A data-driven approach to Blue Chip acquisition, designed for the 100-year portfolio. We do not buy decoration; we acquire history.', link: '/advising', label: 'Advisory' },
                  { id: '03', title: 'CREATION', desc: 'The immutable archive. 2022 unique digital artifacts forged in the Void, serving as the aesthetic anchor of the brand. A ritual of preservation in an age of ephemeral noise.', link: '/heartandangel', label: 'Art' },
                  { id: '04', title: 'LEGACY', desc: 'The source code of the Unframed. A techno-political manual on navigating exile, managing crisis, and converting local status into global sovereignty. Not just a biography, but a blueprint.', link: '/unframed', label: 'Story' }
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