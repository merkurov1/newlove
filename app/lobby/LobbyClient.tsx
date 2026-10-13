'use client';

import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";

export default function LobbyClient() {
  return (
    <main className="min-h-screen bg-[#FAF8F5] text-[#111111] font-sans selection:bg-[#111111] selection:text-[#FAF8F5] antialiased relative overflow-x-hidden">
      
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
          <h1 className="text-4xl sm:text-6xl md:text-8xl lg:text-9xl font-serif font-normal tracking-tight leading-[0.98] sm:leading-[0.92] mb-10 text-[#111111] break-words">
            I architect <br/>
            <span className="text-zinc-500 italic hover:text-[#111111] transition-colors duration-700 cursor-default">
              context.
            </span>
          </h1>

          <div className="mx-auto max-w-2xl">
            <p className="text-xl md:text-2xl text-zinc-700 leading-relaxed font-serif mb-12 font-normal">
              Two decades at the intersection of media, decentralized protocols, fine art, and monumental family heritage.
              <br/><br/>
              Here, there are no algorithms. Only structure, signal, verified provenance, and love as a social benefit.
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
            Media &amp; Communications
          </div>
          <div>
            <span className="block text-[#111111] font-semibold mb-1">Heritage</span>
            S. Merkurov Museum &amp; Archives
          </div>
          <div>
            <span className="block text-[#111111] font-semibold mb-1">Publicist</span>
            Novaya Gazeta &amp; Forbes
          </div>
          <div>
            <span className="block text-[#111111] font-semibold mb-1">Art Dealer</span>
            Private Collections &amp; Curation
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
              Media analysis, decentralized communication protocols, cultural archives, and private art advisory for institutional and international clients.
            </p>

            <div className="pt-8 border-t border-zinc-200/80 font-mono text-xs text-zinc-500 space-y-3 leading-relaxed">
              <div><strong className="text-zinc-800 uppercase tracking-wider">Lectures &amp; Talks:</strong> Moscow State University, OSCE, Goethe Institute, Polytechnic.</div>
              <div><strong className="text-zinc-800 uppercase tracking-wider">Expert Status:</strong> State Duma Information Committee, Federation Council Commission.</div>
            </div>
          </div>

          {/* Right Column: Timeline */}
          <div className="space-y-16 border-l border-zinc-300 pl-8 md:pl-12 py-2">
            
            <div className="relative group cursor-default">
              <span className="absolute -left-[37px] md:-left-[53px] top-2.5 w-2.5 h-2.5 bg-zinc-400 rounded-full group-hover:bg-[#111111] transition-all duration-500"></span>
              <div className="font-mono text-zinc-500 text-xs mb-2 uppercase tracking-[0.25em] font-medium">2006 — 2018 / Public &amp; Media</div>
              <h3 className="text-2xl font-serif font-normal text-[#111111] mb-2">Social Network Integration &amp; Splinternet Forecasts</h3>
              <p className="text-sm text-zinc-600 font-serif leading-relaxed">
                RBC media integration, Vice-President of Online Publishers Association, advising on decentralized messaging protocols (Open Garden / FireChat).
              </p>
            </div>

            <div className="relative group cursor-default">
              <span className="absolute -left-[37px] md:-left-[53px] top-2.5 w-2.5 h-2.5 bg-zinc-400 rounded-full group-hover:bg-[#111111] transition-all duration-500"></span>
              <div className="font-mono text-zinc-500 text-xs mb-2 uppercase tracking-[0.25em] font-medium">2018 — 2022 / Protocols &amp; Cinema</div>
              <h3 className="text-2xl font-serif font-normal text-[#111111] mb-2">Digital Emigration &amp; Cultural Production</h3>
              <p className="text-sm text-zinc-600 font-serif leading-relaxed">
                Media producer for Pelevin’s <em>Empire V</em>, communications lead for Clostra / NewNode p2p protocol, tokenization of Lenin’s death mask archive.
              </p>
            </div>

            <div className="relative group cursor-default">
              <span className="absolute -left-[37px] md:-left-[53px] top-2.5 w-2.5 h-2.5 bg-[#111111] rounded-full"></span>
              <div className="font-mono text-[#111111] text-xs mb-2 uppercase tracking-[0.25em] font-semibold">2026 / Present</div>
              <h3 className="text-2xl font-serif font-normal text-[#111111] mb-2">Cultural Infrastructure &amp; Private Advisory</h3>
              <p className="text-sm text-zinc-600 font-serif leading-relaxed">
                Management of Sergey Merkurov House-Museum archive in Gyumri, private art dealing, regular dispatches, and publishing <em>UNFRAMED</em>.
              </p>
            </div>

          </div>
        </div>
      </section>


      {/* --- SECTION 3: EDITORIAL PRESS CLIPPINGS --- */}
      <section className="py-24 px-8 md:px-16 bg-[#F4F1EA]/80 border-b border-zinc-200/60 relative z-20">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8 mb-14">
            <div>
              <span className="block font-mono text-xs font-medium uppercase tracking-[0.3em] text-zinc-500 mb-5">
                International Press &amp; Commentary
              </span>
              <h2 className="max-w-3xl text-4xl md:text-6xl font-serif font-normal leading-[1.05] tracking-tight text-[#111111]">
                A public record, across disciplines.
              </h2>
              <p className="mt-5 max-w-2xl text-base md:text-lg text-zinc-600 font-serif leading-relaxed">
                Published commentary on internet freedom, state control,
                and the preservation of cultural heritage.
              </p>
            </div>

            <Link
              href="/media"
              className="group inline-flex w-fit shrink-0 items-center gap-4 border-b border-zinc-900 pb-3 text-[#111111] transition-colors hover:border-[#8D3D2E] hover:text-[#8D3D2E]"
            >
              <span className="font-mono text-xs uppercase tracking-[0.16em]">
                Explore the media archive
              </span>
              <ArrowUpRight
                size={17}
                className="transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1"
              />
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10 md:gap-12 font-serif">
            <article className="flex flex-col border-t border-zinc-300 pt-6">
              <div className="font-mono text-xs text-zinc-500 uppercase tracking-[0.2em] mb-5">
                The Washington Post
              </div>
              <blockquote className="text-xl md:text-2xl text-[#111111] leading-snug">
                “The result will be millions of digital émigrés, people who
                will simply turn their backs on the state... acutely aware
                that it is willing to ignore their interests.”
              </blockquote>
              <div className="mt-auto pt-8 font-mono text-[10px] text-zinc-500 uppercase tracking-[0.15em]">
                Digital society / Network policy
              </div>
            </article>

            <article className="flex flex-col border-t border-zinc-300 pt-6">
              <div className="font-mono text-xs text-zinc-500 uppercase tracking-[0.2em] mb-5">
                Le Monde
              </div>
              <blockquote className="text-xl md:text-2xl text-[#111111] leading-snug">
                “The legal framework is ready, and the FSB will be able to
                enforce it. Its agencies are trying every possible means.
                But they won’t succeed. Because in practice, it’s impossible.”
              </blockquote>
              <div className="mt-auto pt-8 font-mono text-[10px] text-zinc-500 uppercase tracking-[0.15em]">
                Internet freedom / State control
              </div>
            </article>

            <article className="flex flex-col border-t border-zinc-300 pt-6">
              <div className="font-mono text-xs text-zinc-500 uppercase tracking-[0.2em] mb-5">
                The Art Newspaper Russia
              </div>
              <blockquote className="text-lg md:text-xl text-[#111111] leading-relaxed">
                “I have long been involved in preserving and studying Sergei
                Merkurov’s legacy, and I have never before encountered such
                careful, even reverent, treatment of my great-grandfather’s
                work. There is hope that this outstanding monument of Soviet
                sculpture will be preserved in proper condition.”
              </blockquote>
              <div className="mt-auto pt-8 font-mono text-[10px] text-zinc-500 uppercase tracking-[0.15em]">
                Sculpture / Restoration / Family legacy
              </div>
            </article>
          </div>

          <div className="mt-14 pt-6 border-t border-zinc-300/80 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="max-w-xl text-sm text-zinc-500 font-serif leading-relaxed">
              Interviews, expert commentary, author columns, and documented
              appearances are collected in the chronological archive.
            </p>
            <Link
              href="/media"
              className="group inline-flex items-center gap-3 text-sm text-[#111111] hover:text-[#8D3D2E] transition-colors"
            >
              <span className="underline underline-offset-4 decoration-zinc-400 group-hover:decoration-[#8D3D2E]">
                Browse all publications
              </span>
              <ArrowRight
                size={15}
                className="transition-transform duration-300 group-hover:translate-x-1"
              />
            </Link>
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
                    <span className="block font-mono text-zinc-500 text-xs uppercase tracking-[0.3em] mb-6 font-medium">Granite (Heritage &amp; Physical)</span>
                    <p className="text-2xl md:text-3xl leading-relaxed font-serif text-zinc-900 font-normal">
                        My great-grandfather carved the Soviet monumental era in granite. Heavy. Immovable. Permanent.
                    </p>
                    <div className="mt-10 font-mono text-xs text-zinc-500 uppercase tracking-[0.25em]">Sergey Merkurov (1881–1952)</div>
                </div>

                {/* ETHER */}
                <div className="p-10 md:p-14 border border-zinc-900/30 bg-white/90 shadow-sm rounded-3xl">
                    <span className="block font-mono text-zinc-700 text-xs uppercase tracking-[0.3em] mb-6 font-medium">Ether (Signal, Art &amp; Media)</span>
                    <p className="text-2xl md:text-3xl leading-relaxed font-serif text-[#111111] font-normal">
                        I operate across decentralized protocols, fine art curation, public commentary, and the <em>Heart &amp; Angel</em> project.
                    </p>
                    <div className="mt-10 font-mono text-xs text-zinc-500 uppercase tracking-[0.25em]">Anton Merkurov</div>
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
                { id: '02', title: 'ADVISING', desc: 'Private art advisory, provenance verification, and archival legacy management for family offices.', link: '/advising', label: 'Office' },
                { id: '03', title: 'CURATOR ENGINE', desc: 'Art-market intelligence and noise reduction. Real-time data curation for physical collections.', link: '/art-engine', label: 'Engine' },
                { id: '04', title: 'ARTWORK', desc: 'The Heart & Angel series. Physical ink, acrylic, and canvas works expressing universal human connection.', link: '/heartandangel', label: 'Works' },
                { id: '05', title: 'SELECTION', desc: 'Curated inventory of fine art, rare sculpture archives, and verified private provenance items.', link: '/selection', label: 'Inventory' },
                { id: '06', title: 'JOURNAL', desc: 'Reflections on human consciousness, digital existence, and where art meets evolving technology.', link: '/journal', label: 'Dispatches' }
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
