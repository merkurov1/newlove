import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';

export const metadata = {
  title: 'Merkurov | The Interface',
  description: 'Art, advising, and curated selection. Digital Heritage Architecture.',
};

export default function Home() {
  return (
    <main className="min-h-screen bg-white text-[#1C1917] pt-32 pb-12 selection:bg-red-600 selection:text-white">

      {/* SECTION 1: SYSTEM STATUS (Small Header) */}
      <div className="max-w-4xl mx-auto px-6 mb-24 text-center">
        <div className="inline-flex items-center gap-2 border border-gray-100 px-3 py-1 rounded-full mb-6">
           <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
           <span className="text-[10px] font-mono uppercase tracking-widest text-gray-400">
             System Operational
           </span>
        </div>
        <h1 className="text-xl md:text-2xl font-serif italic text-gray-400">
          "Structure is the antidote to chaos."
        </h1>
      </div>

      {/* SECTION 2: THE TRINITY (Navigation) */}
      <nav className="max-w-4xl mx-auto px-6 flex flex-col items-center gap-16 md:gap-24 mb-32">
        
        {/* PILLAR 1: ART */}
        <Link href="/heartandangel" className="group text-center block w-full">
          <span className="block text-5xl md:text-8xl font-serif font-medium text-black group-hover:italic transition-all duration-500">
            [ ART ]
          </span>
          <div className="mt-4 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 transform translate-y-2 group-hover:translate-y-0">
             <span className="font-mono text-xs text-red-600 tracking-widest uppercase">The Digital Ritual</span>
             <ArrowUpRight size={12} className="text-red-600"/>
          </div>
        </Link>

        {/* PILLAR 2: SELECTION */}
        <Link href="/selection" className="group text-center block w-full">
          <span className="block text-5xl md:text-8xl font-serif font-medium text-black group-hover:italic transition-all duration-500">
            [ SELECTION ]
          </span>
          <div className="mt-4 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 transform translate-y-2 group-hover:translate-y-0">
             <span className="font-mono text-xs text-red-600 tracking-widest uppercase">Curated Inventory</span>
             <ArrowUpRight size={12} className="text-red-600"/>
          </div>
        </Link>

        {/* PILLAR 3: ADVISING */}
        <Link href="/advising" className="group text-center block w-full">
          <span className="block text-5xl md:text-8xl font-serif font-medium text-black group-hover:italic transition-all duration-500">
            [ ADVISING ]
          </span>
          <div className="mt-4 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-500 transform translate-y-2 group-hover:translate-y-0">
             <span className="font-mono text-xs text-red-600 tracking-widest uppercase">Private Acquisition</span>
             <ArrowUpRight size={12} className="text-red-600"/>
          </div>
        </Link>

      </nav>

      {/* SECTION 3: MANIFESTO & SYSTEM ACCESS */}
      <div className="max-w-2xl mx-auto px-6 text-center border-t border-gray-100 pt-16">
        <p className="font-mono text-sm md:text-base text-gray-500 leading-relaxed mb-12">
          I traded complexity for truth. <br className="hidden md:block" />
          My art is a return to the fundamental source code. <br className="hidden md:block" />
          No politics. Just the raw transmission of empathy.
        </p>

        <Link 
          href="/lobby"
          className="inline-flex items-center gap-3 px-8 py-4 bg-black text-white rounded-full hover:bg-red-600 transition-colors duration-300 group"
        >
          <span className="font-mono text-xs uppercase tracking-widest">
            Enter Private Office
          </span>
          <span className="w-1.5 h-1.5 bg-white rounded-full group-hover:animate-ping"></span>
        </Link>
      </div>

      {/* FOOTER */}
      <footer className="mt-24 text-center pb-8">
         <span className="text-[10px] font-mono text-gray-300 uppercase tracking-widest">
            M — 2025 • Global
         </span>
      </footer>

    </main>
  );
}