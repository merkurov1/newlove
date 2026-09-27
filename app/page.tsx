import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

export const metadata = {
  title: 'Merkurov | The Interface',
  description: 'Art, advising, and curated selection. Digital Heritage Architecture.',
};

export default function Home() {
  return (
    <main className="min-h-screen bg-[#FDFBF7] text-[#111] font-sans selection:bg-black selection:text-white relative overflow-hidden flex flex-col justify-between">

      {/* 1. Paper Grain Overlay (Текстура галерейной бумаги) */}
      <div 
        className="fixed inset-0 pointer-events-none z-40 opacity-[0.025] mix-blend-overlay"
        style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)'/%3E%3C/svg%3E")`,
        }}
      />

      {/* Decorative Top Line */}
      <div className="h-1 w-full bg-black fixed top-0 z-50" />

      {/* TOP BAR */}
      <header className="w-full px-6 py-8 md:px-12 flex justify-between items-center z-10">
        <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-zinc-400">
          Merkurov Office
        </span>

        {/* STATUS BADGE */}
        <div className="inline-flex items-center gap-2.5 border border-zinc-200/80 px-3 py-1 rounded-full bg-white/60 backdrop-blur-sm shadow-sm">
           <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
           <span className="font-mono text-[9px] md:text-[10px] uppercase tracking-[0.2em] text-zinc-600">
             System Online
           </span>
        </div>
      </header>


      {/* CENTER CONTAINER */}
      <div className="w-full max-w-4xl mx-auto px-6 py-12 flex flex-col items-center z-10 my-auto">

        {/* QUOTE */}
        <h1 className="text-xl md:text-3xl font-serif italic text-zinc-400 mb-10 text-center max-w-lg leading-relaxed font-normal">
          "Structure is the antidote to chaos."
        </h1>

        {/* LOBBY BUTTON (ARCHITECTURAL PASS) */}
        <div className="mb-16 md:mb-20">
            <Link 
              href="/lobby" 
              className="group inline-flex items-center gap-6 border border-black/80 bg-black text-white px-8 py-3.5 hover:bg-white hover:text-black transition-all duration-500 shadow-lg hover:shadow-xl"
            >
                <div className="flex flex-col text-left">
                    <span className="font-mono text-[9px] uppercase tracking-[0.25em] text-zinc-400 group-hover:text-zinc-500 transition-colors">
                        Protocol 00
                    </span>
                    <span className="font-serif text-base md:text-lg leading-none italic pr-2">
                        Enter The Lobby
                    </span>
                </div>
                <ArrowUpRight size={16} className="text-zinc-400 group-hover:text-black group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300" />
            </Link>
        </div>

        {/* THE PILLARS (Navigation Grid) */}
        <nav className="flex flex-col items-center gap-6 md:gap-10 w-full max-w-2xl">
          
          {/* PILLAR 1: ART */}
          <Link href="/heartandangel" className="group relative block w-full text-center py-2">
            <span className="block text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-serif font-medium tracking-tight text-zinc-900 group-hover:italic group-hover:tracking-normal transition-all duration-500 ease-out">
              [ ART ]
            </span>
            <span className="block font-mono text-[10px] text-zinc-400 tracking-[0.25em] uppercase mt-2 opacity-60 group-hover:opacity-100 group-hover:text-black transition-all duration-300">
               The Digital Ritual & Artifacts
            </span>
          </Link>

          {/* PILLAR 2: SELECTION */}
          <Link href="/selection" className="group relative block w-full text-center py-2">
            <span className="block text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-serif font-medium tracking-tight text-zinc-900 group-hover:italic group-hover:tracking-normal transition-all duration-500 ease-out">
              [ SELECTION ]
            </span>
            <span className="block font-mono text-[10px] text-zinc-400 tracking-[0.25em] uppercase mt-2 opacity-60 group-hover:opacity-100 group-hover:text-black transition-all duration-300">
               Curated Cultural Inventory
            </span>
          </Link>

          {/* PILLAR 3: ADVISING */}
          <Link href="/advising" className="group relative block w-full text-center py-2">
            <span className="block text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-serif font-medium tracking-tight text-zinc-900 group-hover:italic group-hover:tracking-normal transition-all duration-500 ease-out">
              [ ADVISING ]
            </span>
            <span className="block font-mono text-[10px] text-zinc-400 tracking-[0.25em] uppercase mt-2 opacity-60 group-hover:opacity-100 group-hover:text-black transition-all duration-300">
               Private Art & Heritage Strategy
            </span>
          </Link>

        </nav>

      </div>

      {/* FOOTER */}
      <footer className="w-full px-6 py-8 text-center z-10">
         <span className="text-[10px] font-mono text-zinc-400 uppercase tracking-[0.2em]">
            Merkurov Interface v3.1 — All Systems Operational
         </span>
      </footer>

    </main>
  );
}
