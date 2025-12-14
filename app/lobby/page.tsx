import Link from "next/link";
import { ArrowDown, ArrowUpRight } from "lucide-react";
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: "Merkurov | System Access",
  description: "The Digital Monumentalist. System Status: Live.",
};

export default function LobbyPage() {
  return (
    <main className="bg-[#F2F0E9] text-[#1C1917] font-serif h-screen overflow-y-scroll snap-y snap-mandatory scroll-smooth selection:bg-[#B91C1C] selection:text-white">
      
      {/* --- SECTION 1: INTRO (THE MANIFESTO) --- */}
      <section className="h-screen snap-start flex flex-col items-center justify-center p-4 md:p-12 text-center relative border-b border-[#1C1917]">
        
        {/* Status Header */}
        <div className="absolute top-24 w-full flex justify-between px-6 md:px-12 text-[10px] font-mono tracking-widest text-[#57534E] uppercase">
          <span>System: Online</span>
          <span>Loc: Global / Unframed</span>
        </div>

        <div className="max-w-3xl md:max-w-5xl mx-auto space-y-8">
          <p className="text-xs font-mono text-[#B91C1C] tracking-[0.2em] uppercase">
            // Operating System v.3.0
          </p>
          
          <h1 className="text-4xl sm:text-5xl md:text-7xl font-black text-[#1C1917] leading-[0.9] tracking-tighter uppercase">
            I architect futures<br/>
            <span className="text-[#57534E]">in the digital void.</span>
          </h1>
          
          <div className="max-w-lg md:max-w-2xl mx-auto space-y-4 text-lg md:text-xl text-[#1C1917] leading-relaxed italic">
            <p>
              The world is drowning in noise. Algorithms dictate your attention. 
              Politics dictate your geography.
            </p>
            <p>
              Here, there are no algorithms. Only structure. 
            </p>
          </div>

          <Link href="/advising" className="inline-block mt-8 border border-[#1C1917] px-8 py-3 text-xs font-mono uppercase tracking-widest hover:bg-[#1C1917] hover:text-[#F2F0E9] transition-all">
             Initiate Protocol
          </Link>
        </div>
        
        {/* Scroll Indicator */}
        <div className="absolute bottom-12 animate-bounce text-[#1C1917]">
          <ArrowDown size={24} />
        </div>
      </section>


      {/* --- SECTION 2: FORESIGHT (THE PROOF) --- */}
      <section className="min-h-screen md:h-screen snap-start flex items-center justify-center p-6 md:p-12 bg-[#E7E5DE] border-b border-[#1C1917]">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 md:gap-24 max-w-7xl w-full">
          
          {/* Left: Introduction */}
          <div className="space-y-6">
            <h2 className="text-xs font-mono text-[#B91C1C] uppercase tracking-widest border-b border-[#1C1917] pb-2 inline-block">
              01 / The Track Record
            </h2>
            <h3 className="text-4xl md:text-6xl font-bold leading-none">
              Predicting the collapse <br/> before it happens.
            </h3>
            <p className="text-lg text-[#57534E] leading-relaxed max-w-md">
              I don't use crystal balls. I use forensic data analysis. 
              Being right is boring, but profitable.
            </p>
          </div>

          {/* Right: Timeline */}
          <div className="space-y-12 border-l-2 border-[#1C1917] pl-8 py-4">
            
            {/* 2012 */}
            <div className="relative group">
              <span className="absolute -left-[41px] top-1 w-5 h-5 bg-[#F2F0E9] border-4 border-[#1C1917] rounded-full group-hover:bg-[#B91C1C] transition-colors"></span>
              <div className="font-mono text-[#57534E] text-xs mb-1">2012 — The Splinternet</div>
              <h4 className="text-xl font-bold">The Fragmentation Prediction</h4>
            </div>

            {/* 2018 */}
            <div className="relative group">
              <span className="absolute -left-[41px] top-1 w-5 h-5 bg-[#F2F0E9] border-4 border-[#1C1917] rounded-full group-hover:bg-[#B91C1C] transition-colors"></span>
              <div className="font-mono text-[#57534E] text-xs mb-1">2018 — The Resistance</div>
              <h4 className="text-xl font-bold">The Telegram War & Digital Emigres</h4>
            </div>

            {/* 2025 */}
            <div className="relative group">
              <span className="absolute -left-[41px] top-1 w-5 h-5 bg-[#B91C1C] border-4 border-[#B91C1C] rounded-full animate-pulse"></span>
              <div className="font-mono text-[#B91C1C] text-xs mb-1">2025 — The Reality</div>
              <h4 className="text-xl font-bold">The Digital Collar & Institutional Capital</h4>
            </div>

          </div>
        </div>
      </section>


      {/* --- SECTION 3: MEDIA TICKER --- */}
      <section className="snap-start py-16 bg-[#1C1917] text-[#F2F0E9] border-y border-black flex items-center overflow-hidden whitespace-nowrap relative">
        <div className="animate-marquee inline-block font-mono text-lg md:text-2xl">
          <span className="mx-8 opacity-50">///</span>
          <span className="mx-8">NYT (2018): "Putin never really uses the internet..."</span>
          <span className="mx-8 text-[#B91C1C]">MERKUROV WAS RIGHT</span>
          <span className="mx-8">WaPo (2018): "Millions of digital emigres..."</span>
          <span className="mx-8 text-[#B91C1C]">MERKUROV WAS RIGHT</span>
          <span className="mx-8 opacity-50">///</span>
        </div>
      </section>


      {/* --- SECTION 4: PHILOSOPHY --- */}
      <section className="h-screen snap-start flex items-center justify-center p-6 md:p-12 bg-[#F2F0E9]">
        <div className="max-w-6xl w-full grid grid-cols-1 md:grid-cols-2 gap-0 border border-[#1C1917]">
            
            {/* GRANITE */}
            <div className="p-12 md:p-16 bg-white border-b md:border-b-0 md:border-r border-[#1C1917] flex flex-col justify-between h-[50vh] md:h-[60vh]">
                <h4 className="font-mono text-[#B91C1C] text-xs uppercase tracking-widest">Heritage</h4>
                <p className="text-2xl md:text-4xl font-serif leading-tight">
                    My great-grandfather carved the Empire in <span className="font-black">Granite</span>. 
                    Heavy. Immovable. Eternal.
                </p>
                <span className="font-mono text-xs opacity-50">SERGEY MERKUROV</span>
            </div>

            {/* ETHER */}
            <div className="p-12 md:p-16 bg-[#1C1917] text-[#F2F0E9] flex flex-col justify-between h-[50vh] md:h-[60vh]">
                <h4 className="font-mono text-[#F2F0E9] text-xs uppercase tracking-widest opacity-50">Future</h4>
                <p className="text-2xl md:text-4xl font-serif leading-tight">
                    I operate in the <span className="font-black text-white">Ether</span>. 
                    Transmuting heavy history into light, liquid digital assets.
                </p>
                <span className="font-mono text-xs opacity-50">ANTON MERKUROV</span>
            </div>

        </div>
      </section>


      {/* --- SECTION 5: PROTOCOLS (CARDS) --- */}
      <section className="min-h-screen snap-start flex flex-col justify-center p-6 md:p-12 bg-[#E7E5DE]">
        <h2 className="text-xs font-mono text-[#1C1917] uppercase tracking-widest mb-12 text-center">
          03 / Select Protocol
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 h-full max-w-7xl mx-auto w-full">
          
          {[
            { id: '01', title: 'Intelligence', desc: 'Forensic analysis of digital decay.', link: '/research', label: 'Research' },
            { id: '02', title: 'Capital', desc: 'Algorithmic art advisory. Data is the new marble.', link: '/advising', label: 'Advisory' },
            { id: '03', title: 'Creation', desc: 'The Symbol. 2022 unique artifacts.', link: '/heartandangel', label: 'Art' },
            { id: '04', title: 'Legacy', desc: 'The Codex. Unframed biography.', link: '/unframed', label: 'Story' }
          ].map((card) => (
            <Link key={card.id} href={card.link} className="group bg-[#F2F0E9] border border-[#1C1917] p-8 hover:bg-[#1C1917] hover:text-[#F2F0E9] transition-all duration-300 flex flex-col justify-between h-[350px]">
                <div>
                    <div className="font-mono text-xs opacity-50 mb-4">{card.id}</div>
                    <h3 className="text-3xl font-serif font-bold mb-4">{card.title}</h3>
                    <p className="text-sm leading-relaxed opacity-80 group-hover:opacity-100">
                        {card.desc}
                    </p>
                </div>
                <div className="flex justify-between items-center border-t border-[#1C1917]/20 group-hover:border-[#F2F0E9]/20 pt-4 mt-4">
                    <span className="text-xs font-mono uppercase tracking-widest">{card.label}</span>
                    <ArrowUpRight size={16} />
                </div>
            </Link>
          ))}

        </div>
      </section>


      {/* --- SECTION 6: FOOTER --- */}
      <section className="h-[50vh] snap-start flex flex-col items-center justify-center p-8 bg-[#1C1917] text-center">
        
        <h2 className="text-4xl md:text-6xl font-serif text-[#F2F0E9] mb-8">
            Join the Signal.
        </h2>
        
        <div className="flex flex-col sm:flex-row gap-6 w-full max-w-md">
            <Link href="/journal" className="flex-1 py-4 bg-[#F2F0E9] text-[#1C1917] font-mono text-xs uppercase tracking-widest hover:bg-[#B91C1C] hover:text-white transition-colors">
              Access Journal
            </Link>
        </div>

        <footer className="mt-16 text-[10px] font-mono text-[#57534E] uppercase tracking-widest">
          Merkurov Private Office © 2025
        </footer>
      </section>

    </main>
  );
}