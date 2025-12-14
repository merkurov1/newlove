import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

export const metadata = {
  title: 'Merkurov | The Interface',
  description: 'Art, advising, and curated selection. Digital Heritage Architecture.',
};

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-zinc-900 pt-8 md:pt-20 flex flex-col justify-center items-center relative overflow-hidden selection:bg-red-600 selection:text-white">

      {/* CENTER CONTAINER */}
      <div className="w-full max-w-4xl md:max-w-6xl px-6 flex flex-col items-center z-10">

        {/* 1. STATUS BADGE */}
        <div className="mb-4 md:mb-8 animate-fade-in-down">
          <div className="inline-flex items-center gap-3 border border-zinc-200 px-4 py-1.5 rounded-full bg-white/50 backdrop-blur-sm">
             <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]"></span>
             <span className="font-mono text-[10px] md:text-xs font-bold uppercase tracking-[0.15em] text-zinc-500">
               System Online
             </span>
          </div>
        </div>

        {/* 2. QUOTE */}
        <h1 className="text-lg md:text-2xl font-serif italic text-zinc-400 mb-6 md:mb-10 text-center max-w-md md:max-w-lg leading-relaxed">
          "Structure is the antidote to chaos."
        </h1>

        {/* 3. LOBBY BUTTON (ONBOARDING) - Central & Prominent */}
        <div className="mb-8 md:mb-16">
            <Link 
              href="/lobby" 
              className="group flex items-center gap-4 bg-zinc-900 text-white px-8 py-4 rounded-sm hover:bg-red-600 transition-all duration-500 shadow-xl hover:shadow-red-600/20"
            >
                <div className="flex flex-col text-left">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-400 group-hover:text-white/80">
                        Private Office
                    </span>
                    <span className="font-serif text-lg leading-none italic pr-2">
                        Enter The Lobby
                    </span>
                </div>
                <ArrowRight size={18} className="text-zinc-500 group-hover:text-white group-hover:translate-x-1 transition-all duration-300" />
            </Link>
        </div>

        {/* 4. THE PILLARS (Navigation) */}
        <nav className="flex flex-col items-center gap-3 md:gap-8 w-full">
          
          {/* PILLAR 1: ART */}
          <Link href="/heartandangel" className="group relative block w-full text-center py-1.5 md:py-2">
            <span className="block text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-serif font-medium text-zinc-900 group-hover:italic group-hover:scale-105 transition-all duration-500 ease-out">
              [ ART ]
            </span>
            <span className="absolute left-1/2 -translate-x-1/2 bottom-0 font-mono text-[10px] sm:text-xs text-red-600 tracking-[0.2em] uppercase opacity-0 group-hover:opacity-100 group-hover:-translate-y-2 transition-all duration-500 whitespace-nowrap">
               The Digital Ritual
            </span>
          </Link>

          {/* PILLAR 2: SELECTION */}
          <Link href="/selection" className="group relative block w-full text-center py-1.5 md:py-2">
            <span className="block text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-serif font-medium text-zinc-900 group-hover:italic group-hover:scale-105 transition-all duration-500 ease-out">
              [ SELECTION ]
            </span>
            <span className="absolute left-1/2 -translate-x-1/2 bottom-0 font-mono text-[10px] sm:text-xs text-red-600 tracking-[0.2em] uppercase opacity-0 group-hover:opacity-100 group-hover:-translate-y-2 transition-all duration-500 whitespace-nowrap">
               Curated Inventory
            </span>
          </Link>

          {/* PILLAR 3: ADVISING */}
          <Link href="/advising" className="group relative block w-full text-center py-1.5 md:py-2">
            <span className="block text-4xl sm:text-6xl md:text-7xl lg:text-8xl font-serif font-medium text-zinc-900 group-hover:italic group-hover:scale-105 transition-all duration-500 ease-out">
              [ ADVISING ]
            </span>
            <span className="absolute left-1/2 -translate-x-1/2 bottom-0 font-mono text-[10px] sm:text-xs text-red-600 tracking-[0.2em] uppercase opacity-0 group-hover:opacity-100 group-hover:-translate-y-2 transition-all duration-500 whitespace-nowrap">
               Private Acquisition
            </span>
          </Link>

        </nav>

      </div>

      {/* FOOTER */}
      <footer className="absolute bottom-6 left-0 right-0 text-center pointer-events-none">
         <span className="text-[10px] font-mono text-zinc-300 uppercase tracking-[0.2em]">
            Merkurov Executive Build v.3.0
         </span>
      </footer>

    </main>
  );
}