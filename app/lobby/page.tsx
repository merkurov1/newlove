import Link from "next/link";
import { ArrowRight, ArrowUpRight, ArrowDown } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Private Office | Merkurov",
  description: "Heritage Architecture for the Post-Digital Age.",
};

export default function LobbyPage() {
  return (
    <main className="min-h-screen bg-[#FDFBF7] text-[#111] font-sans selection:bg-black selection:text-white relative">
      {/* Top Decorative Border */}
      <div className="h-1 w-full bg-black fixed top-0 z-50" />
      
      {/* --- SECTION 1: HERO (THE MANIFESTO) --- */}
      <section className="min-h-screen flex flex-col justify-center px-6 md:px-12 relative border-b border-gray-200/60">
        
        {/* Top Meta Header */}
        <div className="absolute top-8 left-6 md:left-12 right-6 md:right-12 flex justify-between items-center">
           <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-500">
             Merkurov Private Office
           </span>
           <div className="flex items-center gap-2">
             <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
             <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-500">
               Loc: Global / Unframed
             </span>
           </div>
        </div>

        <div className="max-w-5xl mx-auto w-full pt-20 text-center">
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-serif font-medium tracking-tight leading-[0.9] mb-8 text-black">
            I architect <br/>
            <span className="text-gray-400 italic font-normal">context.</span>
          </h1>

          <div className="mx-auto max-w-2xl">
            <p className="text-xl md:text-2xl text-gray-800 leading-relaxed font-serif mb-10">
              The world is drowning in noise. Algorithms dictate attention. Politics dictate geography.
              <br/><br/>
              Here, there are no algorithms. Only structure and signal.
            </p>

            <div>
              <Link 
                href="/advising" 
                className="group inline-flex items-center gap-4 border-b border-black pb-1 hover:opacity-50 transition-all duration-300"
              >
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-black">Enter The Office</span>
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform duration-300" />
              </Link>
            </div>
          </div>
        </div>
        
        <div className="absolute bottom-12 left-6 md:left-12">
           <ArrowDown size={18} className="text-gray-400 animate-bounce" />
        </div>
      </section>


      {/* --- SECTION 2: FORESIGHT (TRACK RECORD) --- */}
      <section className="py-24 md:py-32 px-6 md:px-12 border-b border-gray-200/60">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-32">
          
          {/* Left: Intro */}
          <div>
            <span className="block font-mono text-xs uppercase tracking-[0.2em] text-gray-400 mb-8">
              01 / The Track Record
            </span>
            <h2 className="text-4xl md:text-6xl font-serif font-medium leading-[1.1] mb-8">
              Predicting structural shifts before they manifest.
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed max-w-md font-serif">
              Forensic media analysis, cultural archives, and digital sovereignty. Being right is quiet, but essential.
            </p>
          </div>

          {/* Right: Timeline */}
          <div className="space-y-16 border-l border-gray-200 pl-8 md:pl-12 py-2">
            
            {/* 2012 */}
            <div className="relative group">
              <span className="absolute -left-[37px] md:-left-[53px] top-2 w-3 h-3 bg-white border border-black rounded-full group-hover:bg-black transition-colors"></span>
              <div className="font-mono text-gray-400 text-xs mb-2 uppercase tracking-widest">2012 — The Splinternet</div>
              <h4 className="text-xl md:text-2xl font-serif font-medium text-black">The Fragmentation Prediction</h4>
            </div>

            {/* 2018 */}
            <div className="relative group">
              <span className="absolute -left-[37px] md:-left-[53px] top-2 w-3 h-3 bg-white border border-black rounded-full group-hover:bg-black transition-colors"></span>
              <div className="font-mono text-gray-400 text-xs mb-2 uppercase tracking-widest">2018 — The Resistance</div>
              <h4 className="text-xl md:text-2xl font-serif font-medium text-black">The Telegram War & Digital Emigration</h4>
            </div>

            {/* 2026 */}
            <div className="relative group">
              <span className="absolute -left-[37px] md:-left-[53px] top-2 w-3 h-3 bg-black rounded-full"></span>
              <div className="font-mono text-black text-xs mb-2 uppercase tracking-widest font-bold">2026 — The Unframed</div>
              <h4 className="text-xl md:text-2xl font-serif font-medium text-black">Cultural Infrastructure & Post-Digital Assets</h4>
            </div>

          </div>
        </div>
      </section>


      {/* --- SECTION 3: MEDIA TICKER (Updated Quotes) --- */}
      <section className="py-10 border-b border-gray-200/60 overflow-hidden whitespace-nowrap bg-[#F7F4EE]">
        <div className="animate-marquee inline-block font-mono text-xs md:text-sm uppercase tracking-[0.15em] text-gray-600 hover:[animation-play-state:paused]">
          <span className="mx-12">
            <span className="font-bold text-black">LE MONDE (2026):</span> "The main issue is no longer just control of the network, but control over physical and social nodes."
          </span>
          <span className="mx-12 text-gray-300">///</span>
          <span className="mx-12">
            <span className="font-bold text-black">CHRISTIAN SCIENCE MONITOR (2026):</span> "When information channels compress, independent forensic analysis becomes the primary currency."
          </span>
          <span className="mx-12 text-gray-300">///</span>
          <span className="mx-12">
            <span className="font-bold text-black">THE WASHINGTON POST (2018):</span> "The result will be millions of digital emigres turning their backs on the state."
          </span>
          <span className="mx-12 text-gray-300">///</span>
          <span className="mx-12">
            <span className="font-bold text-black">EURACTIV (2020):</span> "The main danger is physical access to the device. Biology is the weak link."
          </span>
        </div>
      </section>


      {/* --- SECTION 4: PHILOSOPHY --- */}
      <section className="py-24 md:py-32 px-6 md:px-12 bg-[#FDFBF7]">
        <div className="max-w-7xl mx-auto">
            <span className="block font-mono text-xs uppercase tracking-[0.2em] text-gray-400 mb-16 text-center">
              02 / The Philosophy
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-24">
                {/* GRANITE */}
                <div className="p-8 md:p-12 border-l border-gray-200 bg-white/50">
                    <h4 className="font-mono text-black text-xs uppercase tracking-widest mb-6">Heritage (Granite)</h4>
                    <p className="text-2xl md:text-3xl leading-relaxed font-serif text-gray-800">
                        My great-grandfather carved the Empire in stone. Heavy. Immovable. Eternal.
                    </p>
                    <div className="mt-8 font-mono text-[10px] text-gray-400 uppercase tracking-widest">Sergey Merkurov</div>
                </div>

                {/* ETHER */}
                <div className="p-8 md:p-12 border-l border-black bg-white">
                    <h4 className="font-mono text-black text-xs uppercase tracking-widest mb-6">Future (Ether)</h4>
                    <p className="text-2xl md:text-3xl leading-relaxed font-serif text-black">
                        I operate in the Ether. Transmuting heavy history into light, liquid digital assets.
                    </p>
                    <div className="mt-8 font-mono text-[10px] text-gray-400 uppercase tracking-widest">Anton Merkurov</div>
                </div>
            </div>
        </div>
      </section>


      {/* --- SECTION 5: PROTOCOLS (Including Curator Engine) --- */}
      <section className="py-24 md:py-32 px-6 md:px-12 bg-[#F7F4EE] border-t border-gray-200/60">
        <div className="max-w-7xl mx-auto">
            <span className="block font-mono text-xs uppercase tracking-[0.2em] text-gray-400 mb-16">
              03 / Select Protocol
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-t border-l border-gray-200 bg-white">
              
              {[
                { 
                  id: '01', 
                  title: 'INTELLIGENCE', 
                  desc: 'Forensic analysis of geopolitical fracture and digital decay. Mapping system cracks before they break to provide asymmetric information.', 
                  link: '/research', 
                  label: 'Research' 
                },
                { 
                  id: '02', 
                  title: 'CAPITAL', 
                  desc: 'Converting cultural chaos into liquid assets. A data-driven approach to Blue Chip acquisition and art advisory.', 
                  link: '/advising', 
                  label: 'Advisory' 
                },
                { 
                  id: '03', 
                  title: 'CURATOR ENGINE', 
                  desc: 'Algorithmic radar for art-market intelligence and noise reduction. Real-time open data enrichment for cultural assets.', 
                  link: '/art-engine', 
                  label: 'Engine' 
                },
                { 
                  id: '04', 
                  title: 'CREATION', 
                  desc: 'The immutable archive. Unique physical & digital artifacts forged in the Void as an aesthetic anchor of preservation.', 
                  link: '/heartandangel', 
                  label: 'Art' 
                },
                { 
                  id: '05', 
                  title: 'LEGACY', 
                  desc: 'The source code of Unframed. A manual on navigating exile, managing crisis, and converting status into global sovereignty.', 
                  link: '/unframed', 
                  label: 'Story' 
                },
                { 
                  id: '06', 
                  title: 'SIGNAL', 
                  desc: 'Regular dispatches, essays, and notes on media, art, and open networks. Pure commentary without algorithmic noise.', 
                  link: '/journal', 
                  label: 'Journal' 
                }
              ].map((card) => (
                <Link 
                  key={card.id} 
                  href={card.link} 
                  className="group relative p-8 border-r border-b border-gray-200 hover:bg-black hover:text-white transition-all duration-300 h-[340px] flex flex-col justify-between"
                >
                    <div>
                        <div className="font-mono text-[10px] text-gray-400 group-hover:text-gray-400 mb-6">{card.id}</div>
                        <h3 className="text-2xl font-serif font-medium mb-4 group-hover:text-white">{card.title}</h3>
                        <p className="text-sm text-gray-500 group-hover:text-gray-300 leading-relaxed font-serif">
                            {card.desc}
                        </p>
                    </div>
                    <div className="flex justify-between items-end pt-4">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400 group-hover:text-gray-300 transition-colors">
                          {card.label}
                        </span>
                        <ArrowUpRight size={16} className="text-gray-400 group-hover:text-white transition-colors" />
                    </div>
                </Link>
              ))}

            </div>
        </div>
      </section>


      {/* --- SECTION 6: FOOTER --- */}
      <section className="py-32 px-6 bg-white text-center border-t border-gray-200/60">
        <h2 className="text-4xl md:text-5xl font-serif text-black mb-12">
            Join the Signal.
        </h2>
        
        <div className="inline-flex flex-col gap-4">
            <Link 
              href="/journal" 
              className="px-8 py-4 border border-black text-xs font-mono uppercase tracking-widest hover:bg-black hover:text-white transition-all duration-300"
            >
              Access Journal
            </Link>
            <span className="font-serif italic text-gray-400 text-sm">
                Ignore the noise.
            </span>
        </div>

        <footer className="mt-24 text-[10px] font-mono text-gray-400 uppercase tracking-[0.2em]">
          Merkurov Private Office © 2026
        </footer>
      </section>

    </main>
  );
}
