'use client';

import Link from "next/link";
import { ArrowRight, ArrowUpRight, ArrowDown } from "lucide-react";

export default function LobbyClient() {
  return (
    <main className="min-h-screen bg-[#FDFBF7] text-[#111] font-sans selection:bg-black selection:text-white relative overflow-x-hidden">
      
      {/* Paper Grain Overlay */}
      <div 
        className="fixed inset-0 pointer-events-none z-40 opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Top Border */}
      <div className="h-1 w-full bg-black fixed top-0 z-50" />
      
      {/* --- SECTION 1: HERO --- */}
      <section className="min-h-screen flex flex-col justify-center px-6 md:px-12 relative border-b border-gray-200/60">
        
        {/* Top Header */}
        <div className="absolute top-8 left-6 md:left-12 right-6 md:right-12 flex justify-between items-center">
           <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-gray-400">
             Merkurov Private Office
           </span>
           <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-gray-400">
             Unframed
           </span>
        </div>

        <div className="max-w-5xl mx-auto w-full pt-20 text-center">
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-serif font-medium tracking-tight leading-[0.9] mb-8 text-black">
            I architect <br/>
            <span className="text-gray-400 italic font-normal hover:text-black transition-colors duration-700 cursor-default">
              context.
            </span>
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
                className="group inline-flex items-center gap-4 border-b border-black pb-1 hover:border-gray-400 hover:text-gray-600 transition-all duration-300"
              >
                <span className="font-mono text-xs uppercase tracking-[0.2em] text-black group-hover:text-gray-600">Enter The Office</span>
                <ArrowRight size={14} className="group-hover:translate-x-2 transition-transform duration-300 text-black group-hover:text-gray-600" />
              </Link>
            </div>
          </div>
        </div>
        
        <div className="absolute bottom-12 left-6 md:left-12">
           <ArrowDown size={18} className="text-gray-400 animate-bounce" />
        </div>
      </section>


      {/* --- SECTION 2: FORESIGHT --- */}
      <section className="py-24 md:py-32 px-6 md:px-12 border-b border-gray-200/60">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-32">
          
          {/* Left */}
          <div>
            <span className="block font-mono text-xs uppercase tracking-[0.2em] text-gray-400 mb-8">
              01 / Track Record
            </span>
            <h2 className="text-4xl md:text-6xl font-serif font-medium leading-[1.1] mb-8">
              Structural shifts before they manifest.
            </h2>
            <p className="text-lg text-gray-600 leading-relaxed max-w-md font-serif">
              Media analysis, cultural archives, and digital sovereignty. Being right is quiet, but essential.
            </p>
          </div>

          {/* Right Timeline */}
          <div className="space-y-16 border-l border-gray-200 pl-8 md:pl-12 py-2">
            
            <div className="relative group cursor-default">
              <span className="absolute -left-[37px] md:-left-[53px] top-2 w-3 h-3 bg-white border border-black rounded-full group-hover:bg-black transition-all duration-300"></span>
              <div className="font-mono text-gray-400 text-xs mb-2 uppercase tracking-widest">2012 — The Splinternet</div>
              <h4 className="text-xl md:text-2xl font-serif font-medium text-black">The Fragmentation Prediction</h4>
            </div>

            <div className="relative group cursor-default">
              <span className="absolute -left-[37px] md:-left-[53px] top-2 w-3 h-3 bg-white border border-black rounded-full group-hover:bg-black transition-all duration-300"></span>
              <div className="font-mono text-gray-400 text-xs mb-2 uppercase tracking-widest">2018 — The Resistance</div>
              <h4 className="text-xl md:text-2xl font-serif font-medium text-black">The Telegram War & Digital Emigration</h4>
            </div>

            <div className="relative group cursor-default">
              <span className="absolute -left-[37px] md:-left-[53px] top-2 w-3 h-3 bg-black rounded-full"></span>
              <div className="font-mono text-black text-xs mb-2 uppercase tracking-widest font-bold">2026 — The Unframed</div>
              <h4 className="text-xl md:text-2xl font-serif font-medium text-black">Cultural Infrastructure & Post-Digital Assets</h4>
            </div>

          </div>
        </div>
      </section>


      {/* --- SECTION 3: MEDIA TICKER --- */}
      <section className="py-10 border-b border-gray-200/60 overflow-hidden whitespace-nowrap bg-[#F7F4EE]">
        <div className="animate-marquee inline-block font-mono text-xs md:text-sm uppercase tracking-[0.15em] text-gray-600 hover:[animation-play-state:paused] cursor-pointer">
          <span className="mx-12">
            <span className="font-bold text-black">LE MONDE (2026):</span> "The legal framework is ready... But they won’t succeed. Because, in reality, it’s impossible."
          </span>
          <span className="mx-12 text-gray-300">///</span>
          <span className="mx-12">
            <span className="font-bold text-black">CHRISTIAN SCIENCE MONITOR (2026):</span> "There is a bureaucratic battle over this. Many state agencies, and lots of officials, use Telegram in their work."
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
              02 / Philosophy
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-24">
                {/* GRANITE */}
                <div className="p-8 md:p-12 border-l border-gray-200 bg-white/50 hover:bg-white hover:border-gray-400 transition-all duration-500">
                    <h4 className="font-mono text-black text-xs uppercase tracking-widest mb-6">Heritage (Granite)</h4>
                    <p className="text-2xl md:text-3xl leading-relaxed font-serif text-gray-800">
                        My great-grandfather carved the Empire in stone. Heavy. Immovable. Eternal.
                    </p>
                    <div className="mt-8 font-mono text-[10px] text-gray-400 uppercase tracking-widest">Sergey Merkurov</div>
                </div>

                {/* ETHER */}
                <div className="p-8 md:p-12 border-l border-black bg-white hover:bg-black hover:text-white group transition-all duration-500">
                    <h4 className="font-mono text-black group-hover:text-gray-400 text-xs uppercase tracking-widest mb-6 transition-colors">Future (Ether)</h4>
                    <p className="text-2xl md:text-3xl leading-relaxed font-serif text-black group-hover:text-white transition-colors">
                        I operate in the Ether. Transmuting heavy history into light, liquid digital assets.
                    </p>
                    <div className="mt-8 font-mono text-[10px] text-gray-400 group-hover:text-gray-400 uppercase tracking-widest transition-colors">Anton Merkurov</div>
                </div>
            </div>
        </div>
      </section>


      {/* --- SECTION 5: NAVIGATION / SECTIONS --- */}
      <section className="py-24 md:py-32 px-6 md:px-12 bg-[#F7F4EE] border-t border-gray-200/60">
        <div className="max-w-7xl mx-auto">
            <span className="block font-mono text-xs uppercase tracking-[0.2em] text-gray-400 mb-16">
              03 / Index
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-0 border-t border-l border-gray-200 bg-white">
              
              {[
                { 
                  id: '01', 
                  title: 'ANALYSIS', 
                  desc: 'Geopolitical fracture and media transformation. Independent commentary on system shifts and open networks.', 
                  link: '/research', 
                  label: 'Research' 
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
                  title: 'UNFRAMED', 
                  desc: 'Essays on exile, independence, and personal sovereignty in a fragmented world.', 
                  link: '/unframed', 
                  label: 'Monograph' 
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
                  className="group relative p-8 border-r border-b border-gray-200 hover:bg-black transition-all duration-500 h-[320px] flex flex-col justify-between"
                >
                    <div>
                        <div className="font-mono text-[10px] text-gray-400 mb-6">{card.id}</div>
                        <h3 className="text-2xl font-serif font-medium mb-4 text-black group-hover:text-white transition-colors">{card.title}</h3>
                        <p className="text-sm text-gray-500 group-hover:text-gray-300 leading-relaxed font-serif transition-colors">
                            {card.desc}
                        </p>
                    </div>
                    <div className="flex justify-between items-end pt-4">
                        <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400 group-hover:text-gray-300 transition-colors">
                          {card.label}
                        </span>
                        <ArrowUpRight size={16} className="text-gray-400 group-hover:text-white group-hover:translate-x-1 group-hover:-translate-y-1 transition-all duration-300" />
                    </div>
                </Link>
              ))}

            </div>
        </div>
      </section>


      {/* --- SECTION 6: FOOTER --- */}
      <section className="py-28 px-6 bg-white text-center border-t border-gray-200/60">
        <h2 className="text-4xl md:text-5xl font-serif text-black mb-10">
            Read the Journal.
        </h2>
        
        <div className="inline-flex flex-col gap-4">
            <Link 
              href="/journal" 
              className="px-8 py-3.5 border border-black text-xs font-mono uppercase tracking-widest hover:bg-black hover:text-white transition-all duration-500"
            >
              Access Dispatches
            </Link>
            <span className="font-serif italic text-gray-400 text-sm">
                Ignore the noise.
            </span>
        </div>

        <footer className="mt-20 text-[10px] font-mono text-gray-400 uppercase tracking-[0.2em]">
          Merkurov Private Office © 2026
        </footer>
      </section>

    </main>
  );
}
