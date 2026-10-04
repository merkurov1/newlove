'use client';

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import Header from "@/components/Header";

export default function LobbyClient() {
  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FAF8F5] antialiased relative overflow-x-hidden">
      
      {/* Header */}
      <Header />

      {/* Subtle Paper Grain Texture */}
      <div 
        className="fixed inset-0 pointer-events-none opacity-[0.025] mix-blend-overlay z-10"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* --- SECTION 1: HERO & PROOF BAR --- */}
      <section className="min-h-screen flex flex-col justify-between px-8 md:px-16 pt-36 md:pt-44 pb-12 border-b border-zinc-200/60 relative z-20">
        
        <div className="max-w-5xl mx-auto w-full text-center my-auto">
          <h1 className="text-6xl md:text-8xl lg:text-9xl font-serif font-normal tracking-tight leading-[0.92] mb-10 text-[#111111]">
            I architect <br/>
            <span className="text-zinc-500 italic hover:text-[#111111] transition-colors duration-700 cursor-default">
              context.
            </span>
          </h1>

          <div className="mx-auto max-w-2xl">
            <p className="text-xl md:text-2xl text-zinc-700 leading-relaxed font-serif mb-12 font-normal">
              Two decades at the intersection of media, decentralized protocols, fine art, and monumental family heritage[span_1](start_span)[span_1](end_span).
              <br/><br/>
              Here, there are no algorithms. Only structure, signal, verified provenance, and love as a social benefit[span_2](start_span)[span_2](end_span).
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

        {/* Institutional Proof Bar */}
        <div className="w-full max-w-6xl mx-auto pt-12 border-t border-zinc-300/60 grid grid-cols-2 md:grid-cols-4 gap-6 text-center font-mono text-[11px] uppercase tracking-[0.2em] text-zinc-500">
          <div>
            <span className="block text-[#111111] font-semibold mb-1">20+ Years</span>
            Media &amp; Communications[span_3](start_span)[span_3](end_span)
          </div>
          <div>
            <span className="block text-[#111111] font-semibold mb-1">Heritage</span>
            S. Merkurov Museum &amp; Archives[span_4](start_span)[span_4](end_span)
          </div>
          <div>
            <span className="block text-[#111111] font-semibold mb-1">Publicist</span>
            Novaya Gazeta &amp; Forbes[span_5](start_span)[span_5](end_span)
          </div>
          <div>
            <span className="block text-[#111111] font-semibold mb-1">Art Dealer</span>
            Private Collections &amp; Curation[span_6](start_span)[span_6](end_span)
          </div>
        </div>

      </section>


      {/* --- SECTION 2: FORESIGHT & INSTITUTIONAL RECORD --- */}
      <section className="py-28 md:py-36 px-8 md:px-16 border-b border-zinc-200/60 relative z-20">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-32">
          
          {/* Left Column */}
          <div>
            <span className="block font-mono text-xs font-medium uppercase tracking-[0.3em] text-zinc-500 mb-8">
              01 / Track Record
            </span>
            <h2 className="text-4xl md:text-6xl font-serif font-normal leading-[1.1] mb-8 text-[#111111]">
              Structural shifts before they manifest.
            </h2>
            <p className="text-lg md:text-xl text-zinc-600 leading-relaxed max-w-md font-serif mb-10">
              Media analysis, decentralized communication protocols, cultural archives, and private art advisory for institutional and international clients[span_7](start_span)[span_7](end_span).
            </p>

            <div className="pt-8 border-t border-zinc-200/80 font-mono text-xs text-zinc-500 space-y-3 leading-relaxed">
              <div><strong className="text-zinc-800 uppercase tracking-wider">Lectures &amp; Talks:</strong> Moscow State University, OSCE, Goethe Institute, Polytechnic[span_8](start_span)[span_8](end_span).</div>
              <div><strong className="text-zinc-800 uppercase tracking-wider">Expert Status:</strong> State Duma Information Committee, Federation Council Commission[span_9](start_span)[span_9](end_span).</div>
            </div>
          </div>

          {/* Right Column: Timeline */}
          <div className="space-y-16 border-l border-zinc-300 pl-8 md:pl-12 py-2">
            
            <div className="relative group cursor-default">
              <span className="absolute -left-[37px] md:-left-[53px] top-2.5 w-2.5 h-2.5 bg-zinc-400 rounded-full group-hover:bg-[#111111] transition-all duration-500"></span>
              <div className="font-mono text-zinc-500 text-xs mb-2 uppercase tracking-[0.25em] font-medium">2006 — 2018 / Public &amp; Media</div>
              <h3 className="text-2xl font-serif font-normal text-[#111111] mb-2">Social Network Integration &amp; Splinternet Forecasts</h3>
              <p className="text-sm text-zinc-600 font-serif leading-relaxed">
                RBC media integration, Vice-President of Online Publishers Association, advising on decentralized messaging protocols (Open Garden / FireChat)[span_10](start_span)[span_10](end_span).
              </p>
            </div>

            <div className="relative group cursor-default">
              <span className="absolute -left-[37px] md:-left-[53px] top-2.5 w-2.5 h-2.5 bg-zinc-400 rounded-full group-hover:bg-[#111111] transition-all duration-500"></span>
              <div className="font-mono text-zinc-500 text-xs mb-2 uppercase tracking-[0.25em] font-medium">2018 — 2022 / Protocols &amp; Cinema</div>
              <h3 className="text-2xl font-serif font-normal text-[#111111] mb-2">Digital Emigration &amp; Cultural Production</h3>
              <p className="text-sm text-zinc-600 font-serif leading-relaxed">
                Media producer for Pelevin’s <em>Empire V</em>, communications lead for Clostra / NewNode p2p protocol, tokenization of Lenin’s death mask archive[span_11](start_span)[span_11](end_span).
              </p>
            </div>

            <div className="relative group cursor-default">
              <span className="absolute -left-[37px] md:-left-[53px] top-2.5 w-2.5 h-2.5 bg-[#111111] rounded-full"></span>
              <div className="font-mono text-[#111111] text-xs mb-2 uppercase tracking-[0.25em] font-semibold">2026 / Present</div>
              <h3 className="text-2xl font-serif font-normal text-[#111111] mb-2">Cultural Infrastructure &amp; Private Advisory</h3>
              <p className="text-sm text-zinc-600 font-serif leading-relaxed">
                Management of Sergey Merkurov House-Museum archive in Gyumri, private art dealing, regular dispatches for Novaya Gazeta, and publishing <em>UNFRAMED</em>[span_12](start_span)[span_12](end_span).
              </p>
            </div>

          </div>
        </div>
      </section>


      {/* --- SECTION 3: EDITORIAL PRESS CLIPPINGS --- */}
      <section className="py-24 px-8 md:px-16 bg-[#F4F1EA]/80 border-b border-zinc-200/60 relative z-20">
        <div className="max-w-7xl mx-auto">
          <span className="block font-mono text-xs font-medium uppercase tracking-[0.3em] text-zinc-500 mb-12">
            International Press &amp; Commentary
          </span>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 font-serif">
            
            <div className="border-t border-zinc-300 pt-6">
              <div className="font-mono text-xs text-zinc-500 uppercase tracking-[0.2em] mb-4">The Washington Post[span_13](start_span)[span_13](end_span)</div>
              <p className="text-lg text-zinc-800 italic leading-relaxed mb-6">
                &ldquo;The result will be millions of digital emigres, people who will simply turn their backs on the state... acutely aware that it is willing to ignore their interests.&rdquo;[span_14](start_span)[span_14](end_span)
              </p>
              <div className="font-mono text-[11px] text-zinc-400 uppercase tracking-widest">— Anton Merkurov on Information Networks[span_15](start_span)[span_15](end_span)</div>
            </div>

            <div className="border-t border-zinc-300 pt-6">
              <div className="font-mono text-xs text-zinc-500 uppercase tracking-[0.2em] mb-4">Le Monde[span_16](start_span)[span_16](end_span)</div>
              <p className="text-lg text-zinc-800 italic leading-relaxed mb-6">
                &ldquo;The legal framework is ready... But they won’t succeed. Because, in reality, it’s impossible to enforce absolute sovereign isolation.&rdquo;
              </p>
              <div className="font-mono text-[11px] text-zinc-400 uppercase tracking-widest">— Commentary on Network Resilience</div>
            </div>

            <div className="border-t border-zinc-300 pt-6">
              <div className="font-mono text-xs text-zinc-500 uppercase tracking-[0.2em] mb-4">The Art Newspaper[span_17](start_span)[span_17](end_span)</div>
              <p className="text-lg text-zinc-800 italic leading-relaxed mb-6">
                &ldquo;Protecting and transmitting monumental family legacy into new technological mediums without losing provenance or historical weight.&rdquo;[span_18](start_span)[span_18](end_span)
              </p>
              <div className="font-mono text-[11px] text-zinc-400 uppercase tracking-widest">— On S. Merkurov Legacy &amp; Archives[span_19](start_span)[span_19](end_span)</div>
            </div>

          </div>
        </div>
      </section>


      {/* --- SECTION 4: DUALITY PHILOSOPHY --- */}
      <section className="py-28 md:py-36 px-8 md:px-16 relative z-20">
        <div className="max-w-7xl mx-auto">
            <span className="block font-mono text-xs font-medium uppercase tracking-[0.3em] text-zinc-500 mb-16 text-center">
              02 / Dual Roots
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 md:gap-20">
                {/* GRANITE */}
                <div className="p-10 md:p-14 border border-zinc-300 bg-white/50 rounded-3xl">
                    <span className="block font-mono text-zinc-500 text-xs uppercase tracking-[0.3em] mb-6 font-medium">Granite (Heritage &amp; Physical)[span_20](start_span)[span_20](end_span)</span>
                    <p className="text-2xl md:text-3xl leading-relaxed font-serif text-zinc-900 font-normal">
                        My great-grandfather carved the Soviet monumental era in granite. Heavy. Immovable. Permanent[span_21](start_span)[span_21](end_span).
                    </p>
                    <div className="mt-10 font-mono text-xs text-zinc-500 uppercase tracking-[0.25em]">Sergey Merkurov (1881–1952)[span_22](start_span)[span_22](end_span)</div>
                </div>

                {/* ETHER */}
                <div className="p-10 md:p-14 border border-zinc-900/30 bg-white/90 shadow-sm rounded-3xl">
                    <span className="block font-mono text-zinc-700 text-xs uppercase tracking-[0.3em] mb-6 font-medium">Ether (Signal, Art &amp; Media)[span_23](start_span)[span_23](end_span)</span>
                    <p className="text-2xl md:text-3xl leading-relaxed font-serif text-[#111111] font-normal">
                        I operate across decentralized protocols, fine art curation, public commentary, and the <em>Heart &amp; Angel</em> project[span_24](start_span)[span_24](end_span).
                    </p>
                    <div className="mt-10 font-mono text-xs text-zinc-500 uppercase tracking-[0.25em]">Anton Merkurov[span_25](start_span)[span_25](end_span)</div>
                </div>
            </div>
        </div>
      </section>


      {/* --- SECTION 5: INDEX GRID --- */}
      <section className="py-28 md:py-36 px-8 md:px-16 bg-[#F4F1EA]/60 border-t border-zinc-200/60 relative z-20">
        <div className="max-w-7xl mx-auto">
            <span className="block font-mono text-xs font-medium uppercase tracking-[0.3em] text-zinc-500 mb-16">
              03 / Index &amp; Operations
            </span>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-px bg-zinc-300 border border-zinc-300">
              
              {[
                { id: '01', title: 'RESEARCH', desc: 'Geopolitical analysis, media transformations, and independent commentary on network shifts.', link: '/research', label: 'Analysis' },
                { id: '02', title: 'ADVISING', desc: 'Private art advisory, provenance verification, and archival legacy management for family offices[span_26](start_span)[span_26](end_span).', link: '/advising', label: 'Office' },
                { id: '03', title: 'CURATOR ENGINE', desc: 'Art-market intelligence and noise reduction. Real-time data curation for physical collections[span_27](start_span)[span_27](end_span).', link: '/art-engine', label: 'Engine' },
                { id: '04', title: 'ARTWORK', desc: 'The Heart & Angel series. Physical ink, acrylic, and canvas works expressing universal human connection[span_28](start_span)[span_28](end_span).', link: '/heartandangel', label: 'Works' },
                { id: '05', title: 'SELECTION', desc: 'Curated inventory of fine art, rare sculpture archives, and verified private provenance items[span_29](start_span)[span_29](end_span).', link: '/selection', label: 'Inventory' },
                { id: '06', title: 'JOURNAL', desc: 'Regular dispatches, column archives from Novaya Gazeta and Forbes, and long-form essays[span_30](start_span)[span_30](end_span).', link: '/journal', label: 'Dispatches' }
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

    </main>
  );
}
