'use client';

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

export default function LobbyClient() {
  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FAF8F5] antialiased">
      
      {/* Subtle Paper Grain Texture */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* --- SECTION 1: HERO --- */}
      <section className="min-h-screen flex flex-col justify-center px-8 md:px-16 pt-40 md:pt-48 pb-16 border-b border-zinc-200/60">

        <div className="max-w-5xl mx-auto w-full text-center my-auto">
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-serif font-normal tracking-tight leading-[0.92] mb-10 text-[#111111]">
            I architect <br/>
            <span className="text-zinc-500 italic hover:text-[#111111] transition-colors duration-700 cursor-default">
              context.
            </span>
          </h1>

          <div className="mx-auto max-w-2xl">
            <p className="text-xl md:text-2xl text-zinc-700 leading-relaxed font-serif mb-12 font-normal">
              The world is drowning in noise. Algorithms dictate attention. Politics dictate geography.
              <br/><br/>
              Here, there are no algorithms. Only structure and signal.
            </p>

            <div>
              <Link 
                href="/advising" 
                className="group inline-flex items-center gap-4 border-b-2 border-zinc-900 pb-1.5 hover:border-zinc-500 transition-all duration-300"
              >
                <span className="font-mono text-xs uppercase tracking-[0.25em] font-semibold text-[#111111] group-hover:text-zinc-600 transition-colors">Enter The Office</span>
                <ArrowRight size={16} className="group-hover:translate-x-1.5 transition-transform duration-300 text-[#111111] group-hover:text-zinc-600" />
              </Link>
            </div>
          </div>
        </div>
      </section>


      {/* --- SECTION 2: FORESIGHT --- */}
      <section className="py-28 md:py-36 px-8 md:px-16 border-b border-zinc-200/60">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-32">
          
          {/* Left Column */}
          <div>
            <span className="block font-mono text-xs font-medium uppercase tracking-[0.3em] text-zinc-500 mb-8">
              01 / Track Record
            </span>
            <h2 className="text-4xl md:text-6xl font-serif font-normal leading-[1.1] mb-8 text-[#111111]">
              Structural shifts before they manifest.
            </h2>
            <p className="text-lg md:text-xl text-zinc-600 leading-relaxed max-w-md font-serif">
              Media analysis, cultural archives, and digital sovereignty. Being right is quiet, but essential.
            </p>
          </div>

          {/* Right Column: Timeline */}
          <div className="space-y-16 border-l border-zinc-300 pl-8 md:pl-12 py-2">
            
            <div className="relative group cursor-default">
              <span className="absolute -left-[37px] md:-left-[53px] top-2.5 w-2.5 h-2.5 bg-zinc-400 rounded-full group-hover:bg-[#111111] transition-all duration-500"></span>
              <div className="font-mono text-zinc-500 text-xs mb-2 uppercase tracking-[0.25em] font-medium">2012 — The Splinternet</div>
              <h3 className="text-2xl font-serif font-normal text-[#111111]">The Fragmentation Prediction</h3>
            </div>

            <div className="relative group cursor-default">
              <span className="absolute -left-[37px] md:-left-[53px] top-2.5 w-2.5 h-2.5 bg-zinc-400 rounded-full group-hover:bg-[#111111] transition-all duration-500"></span>
              <div className="font-mono text-zinc-500 text-xs mb-2 uppercase tracking-[0.25em] font-medium">2018 — The Resistance</div>
              <h3 className="text-2xl font-serif font-normal text-[#111111]">The Telegram War &amp; Digital Emigration</h3>
            </div>

            <div className="relative group cursor-default">
              <span className="absolute -left-[37px] md:-left-[53px] top-2.5 w-2.5 h-2.5 bg-[#111111] rounded-full"></span>
              <div className="font-mono text-[#111111] text-xs mb-2 uppercase tracking-[0.25em] font-semibold">2026 — Digital Heritage</div>
              <h3 className="text-2xl font-serif font-normal text-[#111111]">Cultural Infrastructure &amp; Post-Digital Assets</h3>
            </div>

          </div>
        </div>
      </section>


      {/* --- SECTION 3: MEDIA TICKER --- */}
      <section className="py-10 border-b border-zinc-200/60 overflow-hidden whitespace-nowrap bg-[#F4F1EA]/80">
        <div className="animate-marquee inline-block font-mono text-xs uppercase tracking-[0.2em] text-zinc-700 hover:[animation-play-state:paused]">
          <span className="mx-12">
            <strong className="text-[#111111] font-semibold">LE MONDE (2026):</strong> "The legal framework is ready... But they won’t succeed. Because, in reality, it’s impossible."
          </span>
          <span className="mx-12 text-zinc-400">—</span>
          <span className="mx-12">
            <strong className="text-[#111111] font-semibold">CHRISTIAN SCIENCE MONITOR (2026):</strong> "There is a bureaucratic battle over this. Many state agencies, and lots of officials, use Telegram in their work."
          </span>
          <span className="mx-12 text-zinc-400">—</span>
          <span className="mx-12">
            <strong className="text-[#111111] font-semibold">THE WASHINGTON POST (2018):</strong> "The result will be millions of digital emigres turning their backs on the state."
          </span>
          <span className="mx-12 text-zinc-400">—</span>
          <span className="mx-12">
            <strong className="text-[#111111] font-semibold">EURACTIV (2020):</strong> "The main danger is physical access to the device. Biology is the weak link."
          </span>
        </div>
      </section>


      {/* --- SECTION 4: PHILOSOPHY --- */}
      <section className="py-28 md:py-36 px-8 md:px-16">
        <div className="max-w-7xl mx-auto">
            <span className="block font-mono text-xs font-medium uppercase tracking-[0.3em] text-zinc-500 mb-16 text-center">
              02 / Philosophy
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20">
                {/* GRANITE */}
                <div className="p-10 md:p-14 border border-zinc-300 bg-white/50">
                    <span className="block font-mono text-zinc-500 text-xs uppercase tracking-[0.3em] mb-6 font-medium">Heritage (Granite)</span>
                    <p className="text-2xl md:text-3xl leading-relaxed font-serif text-zinc-900 font-normal">
                        My great-grandfather carved the Empire in stone. Heavy. Immovable. Eternal.
                    </p>
                    <div className="mt-10 font-mono text-xs text-zinc-500 uppercase tracking-[0.25em]">Sergey Merkurov</div>
                </div>

                {/* ETHER */}
                <div className="p-10 md:p-14 border border-zinc-900/30 bg-white/90 shadow-sm">
                    <span className="block font-mono text-zinc-700 text-xs uppercase tracking-[0.3em] mb-6 font-medium">Future (Ether)</span>
                    <p className="text-2xl md:text-3xl leading-relaxed font-serif text-[#111111] font-normal">
                        I operate in the Ether. Transmuting heavy history into light, liquid digital assets.
                    </p>
                    <div className="mt-10 font-mono text-xs text-zinc-500 uppercase tracking-[0.25em]">Anton Merkurov</div>
                </div>
            </div>
        </div>
      </section>


      {/* --- SECTION 5: INDEX GRID --- */}
      <section className="py-28 md:py-36 px-8 md:px-16 bg-[#F4F1EA]/60 border-t border-zinc-200/60">
        <div className="max-w-7xl mx-auto">
            <span className="block font-mono text-xs font-medium uppercase tracking-[0.3em] text-zinc-500 mb-16">
              03 / Index
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-zinc-300 border border-zinc-300">
              
              {[
                { 
                  id: '01', 
                  title: 'RESEARCH', 
                  desc: 'Geopolitical fracture and media transformation. Independent commentary on system shifts and open networks.', 
                  link: '/research', 
                  label: 'Analysis' 
                },
                { 
                  id: '02', 
                  title: 'ADVISING', 
                  desc: 'Private art advisory, provenance verification, and digital legacy structures for long-term cultural capital.', 
                  link: '/advising', 
                  label: 'Office' 
                },
                { 
                  id: '03', 
                  title: 'CURATOR ENGINE', 
                  desc: 'Art-market intelligence and noise reduction. Real-time data enrichment for physical and digital assets.', 
                  link: '/art-engine', 
                  label: 'Engine' 
                },
                { 
                  id: '04', 
                  title: 'ARTWORK', 
                  desc: 'The physical and digital archive. Unique artifacts and recurring symbolic motifs created as aesthetic anchors.', 
                  link: '/heartandangel', 
                  label: 'Works' 
                },
                { 
                  id: '05', 
                  title: 'SELECTION', 
                  desc: 'Curated cultural inventory and private collection access with verifiable provenance.', 
                  link: '/selection', 
                  label: 'Inventory' 
                },
                { 
                  id: '06', 
                  title: 'JOURNAL', 
                  desc: 'Regular dispatches, essays, and public commentary on technology, culture, and society.', 
                  link: '/journal', 
                  label: 'Dispatches' 
                }
              ].map((card) => (
                <Link 
                  key={card.id} 
                  href={card.link} 
                  className="group relative p-8 md:p-10 bg-[#FAF8F5] hover:bg-white transition-all duration-500 h-[320px] flex flex-col justify-between"
                >
                    <div>
                        <div className="font-mono text-xs text-zinc-400 mb-6 group-hover:text-zinc-800 transition-colors">{card.id}</div>
                        <h3 className="text-2xl font-serif font-normal mb-4 text-[#111111]">{card.title}</h3>
                        <p className="text-sm text-zinc-600 leading-relaxed font-serif">
                            {card.desc}
                        </p>
                    </div>
                    <div className="flex justify-between items-end pt-4">
                        <span className="text-xs font-mono uppercase tracking-[0.25em] text-zinc-500 font-medium">
                          {card.label}
                        </span>
                        <ArrowUpRight size={16} className="text-zinc-500 group-hover:text-[#111111] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300" />
                    </div>
                </Link>
              ))}

            </div>
        </div>
      </section>


      {/* --- SECTION 6: FOOTER --- */}
      <section className="py-28 px-8 bg-[#FAF8F5] text-center border-t border-zinc-200/60">
        <h2 className="text-3xl md:text-5xl font-serif font-normal text-[#111111] mb-8">
            Read the Journal.
        </h2>
        
        <div className="inline-flex flex-col items-center gap-4">
            <Link 
              href="/journal" 
              className="px-8 py-4 border border-zinc-900 bg-[#111111] text-[#FAF8F5] hover:bg-transparent hover:text-[#111111] text-xs font-mono uppercase tracking-[0.25em] transition-all duration-500 font-medium"
            >
              Access Dispatches
            </Link>
            <span className="font-serif italic text-zinc-500 text-base mt-2">
                Ignore the noise.
            </span>
        </div>

        <footer className="mt-24 text-xs font-mono text-zinc-500 uppercase tracking-[0.3em]">
          Anton Merkurov Private Office
        </footer>
      </section>

    </main>
  );
}
